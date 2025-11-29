const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const path = require('node:path');
const { exec } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const { BluetoothService } = require('./main/bluetoothService');
const net = require('net');

const bluetoothSubscribers = new Set();
let bluetoothEnabled = true;

// Keep a global reference of the window object
let mainWindow;
const bluetoothService = new BluetoothService();

bluetoothService.on('message', (payload) => {
    if (mainWindow) {
        mainWindow.webContents.send('bluetooth-received', {
            payload,
            receivedAt: Date.now()
        });
    }
});

bluetoothService.on('error', (error) => {
    if (mainWindow) {
        mainWindow.webContents.send('bluetooth-error', error);
    }
});

bluetoothService.on('warning', (warning) => {
    if (mainWindow) {
        mainWindow.webContents.send('bluetooth-warning', warning);
    }
});

function createWindow() {
    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        autoHideMenuBar: true, // Hide menu bar (can toggle with Alt)
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: process.platform === 'win32' ? 'build/termichemti.ico' : 'build/termichemti.png'
    });

    // Load the app
    mainWindow.loadFile('index.html');

    // Open DevTools to see errors (you can remove this later)
    // mainWindow.webContents.openDevTools();

    // Emitted when the window is closed
    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(createWindow);

// Quit when all windows are closed
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
    if (mainWindow === null) createWindow();
});

// --- Helper functions for parsing command output ---
function parseWifiList(stdout, platform) {
    if (platform === 'win32') {
        return stdout.split('\n')
            .map(line => line.match(/All User Profile\s+:\s(.*)/))
            .filter(Boolean)
            .map(match => match[1].trim());
    } else { // linux
        return stdout.split('\n')
            .slice(1)
            .filter(line => line.trim() !== '')
            .map(line => line.trim());
    }
}

function parseWifiDetails(stdout, platform) {
    let password = null;
    let authType = null;
    if (platform === 'win32') {
        const match = stdout.match(/Key Content\s+:\s(.*)/);
        if (match) password = match[1].trim();
        const authMatch = stdout.match(/Authentication\s+:\s(.*)/);
        if (authMatch) authType = authMatch[1].trim();
    } else { // linux
        const match = stdout.match(/802-11-wireless-security.psk:\s*(.*)/);
        if (match) password = match[1].trim();
        const authMatch = stdout.match(/802-11-wireless-security.key-mgmt:\s*(.*)/);
        if (authMatch) authType = authMatch[1].trim();
    }
    return { password: password, fullDetails: stdout.trim(), authType };
}

// --- Parse available networks ---
function parseAvailableNetworks(stdout, platform) {
    const networks = [];

    if (platform === 'win32') {
        // Parse Windows netsh wlan show profiles output
        const lines = stdout.split('\n');
        let currentNetwork = null;

        for (const line of lines) {
            const trimmedLine = line.trim();

            // Network name
            const nameMatch = trimmedLine.match(/^SSID \d+ : (.+)$/);
            if (nameMatch) {
                if (currentNetwork) {
                    networks.push(currentNetwork);
                }
                currentNetwork = {
                    ssid: nameMatch[1].trim(),
                    signal: 0,
                    security: 'Unknown',
                    channel: 'Unknown',
                    frequency: 'Unknown'
                };
                continue;
            }

            if (currentNetwork) {
                // Signal strength
                const signalMatch = trimmedLine.match(/Signal\s*:\s*(\d+)%/);
                if (signalMatch) {
                    currentNetwork.signal = parseInt(signalMatch[1]);
                }

                // Security
                const securityMatch = trimmedLine.match(/Authentication\s*:\s*(.+)$/);
                if (securityMatch) {
                    currentNetwork.security = securityMatch[1].trim();
                }

                // Channel
                const channelMatch = trimmedLine.match(/Channel\s*:\s*(\d+)/);
                if (channelMatch) {
                    currentNetwork.channel = channelMatch[1];
                }
            }
        }

        if (currentNetwork) {
            networks.push(currentNetwork);
        }

    } else { // linux
        // Parse Linux nmcli output
        const lines = stdout.split('\n').slice(1); // Skip header

        for (const line of lines) {
            const parts = line.split(':').map(part => part.trim());
            if (parts.length >= 4) {
                networks.push({
                    ssid: parts[0] || 'Hidden Network',
                    signal: parseInt(parts[2]) || 0,
                    security: parts[3] || 'Open',
                    channel: parts[4] || 'Unknown',
                    frequency: parts[1] || 'Unknown'
                });
            }
        }
    }

    // Remove duplicates and sort by signal strength
    const uniqueNetworks = networks.reduce((acc, network) => {
        const existing = acc.find(n => n.ssid === network.ssid);
        if (!existing || network.signal > existing.signal) {
            acc = acc.filter(n => n.ssid !== network.ssid);
            acc.push(network);
        }
        return acc;
    }, []);

    return uniqueNetworks.sort((a, b) => b.signal - a.signal);
}

function broadcastBluetoothOffer(payload) {
    for (const subscriber of bluetoothSubscribers) {
        try {
            subscriber.send('bluetooth-network-received', payload);
        } catch (error) {
            console.warn('Failed to notify renderer of Bluetooth offer:', error);
        }
    }
}

// --- Parse Windows available networks ---
function parseWindowsAvailableNetworks(stdout) {
    const networks = [];
    const lines = stdout.split('\n');
    let currentNetwork = null;

    for (const line of lines) {
        const trimmedLine = line.trim();

        // Look for "SSID #### :" lines which contain network names
        const nameMatch = trimmedLine.match(/^SSID \d+ : (.+)$/);
        if (nameMatch) {
            // If we were processing a previous network, push it before starting a new one
            if (currentNetwork) {
                networks.push(currentNetwork);
            }
            currentNetwork = {
                ssid: nameMatch[1].trim(),
                signal: 0, // Will be updated by the next block
                security: 'Unknown',
                channel: 'Unknown', // not typically available from this command
                frequency: 'Unknown'
            };
            continue;
        }

        // If we have a current network being processed, look for details
        if (currentNetwork) {
            // Signal strength (e.g., "Signal     : 95%")
            const signalMatch = trimmedLine.match(/Signal\s*:\s*(\d+)%/);
            if (signalMatch) {
                currentNetwork.signal = parseInt(signalMatch[1]);
            }

            // Security type (e.g., "Authentication : WPA2-Personal")
            const securityMatch = trimmedLine.match(/Authentication\s*:\s*(.+)$/);
            if (securityMatch) {
                currentNetwork.security = securityMatch[1].trim().split('-')[0]; // Extract base type (WPA, WPA2, WEP)
            }
            // Note: Channel and Frequency are not readily available from 'netsh wlan show networks' for all networks.
            // We'll stick to what's commonly parsable.
        }
    }

    // Push the last processed network
    if (currentNetwork) {
        networks.push(currentNetwork);
    }

    // Filter out empty SSIDs or networks that couldn't be parsed properly
    const validNetworks = networks.filter(net => net.ssid && net.ssid !== 'N/A' && net.ssid !== '');

    // Remove duplicates and sort by signal strength
    const uniqueNetworks = [];
    const seenSSIDs = new Set();

    for (const network of validNetworks) {
        if (!seenSSIDs.has(network.ssid)) {
            seenSSIDs.add(network.ssid);
            uniqueNetworks.push(network);
        }
    }

    return uniqueNetworks.sort((a, b) => b.signal - a.signal);
}

function parseWindowsConnectionStatus(stdout) {
    const lines = stdout.split(/\r?\n/);
    let state = null;
    let ssid = null;
    let profile = null;

    const normalizeValue = (value) => {
        if (!value) return null;
        const cleaned = value.trim();
        if (!cleaned || cleaned === 'N/A') return null;
        if (cleaned.toLowerCase().includes('not available')) return null;
        return cleaned;
    };

    const evaluateBlock = () => {
        if (state && state.toLowerCase().includes('connected')) {
            return normalizeValue(ssid) || normalizeValue(profile);
        }
        return null;
    };

    const resetBlock = () => {
        state = null;
        ssid = null;
        profile = null;
    };

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
            const result = evaluateBlock();
            if (result) return result;
            resetBlock();
            continue;
        }

        const stateMatch = line.match(/^State\s*:\s*(.+)$/i);
        if (stateMatch) {
            state = stateMatch[1];
            continue;
        }

        const ssidMatch = line.match(/^SSID\s*:\s*(.+)$/i);
        if (ssidMatch) {
            ssid = ssidMatch[1];
            continue;
        }

        const profileMatch = line.match(/^Profile\s*:\s*(.+)$/i);
        if (profileMatch) {
            profile = profileMatch[1];
        }
    }

    return evaluateBlock();
}

// --- Parse Linux available networks ---
function parseLinuxAvailableNetworks(stdout) {
    const networks = [];
    const lines = stdout.split('\n');

    // Skip header line
    const dataLines = lines.slice(1);

    for (const line of dataLines) {
        if (!line.trim()) continue; // Skip empty lines

        // nmcli output example:
        // *  MyHotspot   802-11n  2462MHz  54       70   WPA2      --
        //    AnotherNet  802-11ac 5745MHz  144      85   WPA2 WPA3 --
        //    HiddenNet                           --       50   WPA2      --
        const parts = line.trim().split(/\s+/);

        if (parts.length < 5) continue; // Need at least SSID, Frequency, Channel, Signal, Security

        const isConnected = parts[0] === '*';
        const ssid = parts[isConnected ? 1 : 0];
        const frequency = parts[isConnected ? 2 : 1];
        const channel = parts[isConnected ? 3 : 2];
        const signal = parseInt(parts[isConnected ? 4 : 3]);
        // Security can span multiple parts if it's WPA2 WPA3 etc.
        const securityParts = parts.slice(isConnected ? 5 : 4);
        const security = securityParts.join(' ') || 'Open';

        // Basic validation: SSID must exist and be valid, signal must be a number
        if (ssid && ssid !== '--' && !isNaN(signal)) {
            networks.push({
                ssid: ssid,
                signal: signal,
                security: security.replace(/-\w+$/, ''), // Remove trailing hyphenated words like "-PSK"
                channel: channel,
                frequency: frequency
            });
        }
    }

    // Remove duplicates and sort by signal strength (already handled by nmcli, but for consistency)
    const uniqueNetworks = [];
    const seenSSIDs = new Set();
    for (const network of networks) {
        if (!seenSSIDs.has(network.ssid)) {
            seenSSIDs.add(network.ssid);
            uniqueNetworks.push(network);
        }
    }

    return uniqueNetworks.sort((a, b) => b.signal - a.signal);
}

function createWindowsProfileXml({ ssid, password, autoConnect, hidden }) {
    return `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
    <name>${ssid}</name>
    <SSIDConfig>
        <SSID>
            <name>${ssid}</name>
        </SSID>
        <nonBroadcast>${hidden ? 'true' : 'false'}</nonBroadcast>
    </SSIDConfig>
    <connectionType>ESS</connectionType>
    <connectionMode>${autoConnect ? 'auto' : 'manual'}</connectionMode>
    <MSM>
        <security>
            <authEncryption>
                <authentication>WPA2PSK</authentication>
                <encryption>AES</encryption>
                <useOneX>false</useOneX>
            </authEncryption>
            <sharedKey>
                <keyType>passPhrase</keyType>
                <protected>false</protected>
                <keyMaterial>${password || ''}</keyMaterial>
            </sharedKey>
        </security>
    </MSM>
</WLANProfile>`;
}

// --- The Existing All-in-One IPC Handler ---
ipcMain.handle('get-all-wifi-details', async () => {
    return new Promise((listResolve, listReject) => {
        const platform = process.platform;
        const listCommand = platform === 'win32' ? 'netsh wlan show profiles' : 'nmcli --fields NAME connection show';

        if (platform !== 'win32' && platform !== 'linux') {
            return listReject(`Unsupported OS: ${platform}`);
        }

        // Add timeout to prevent hanging
        const timeout = setTimeout(() => {
            listReject('Request timed out after 30 seconds');
        }, 30000);

        // 1. First, get the list of all profile names
        exec(listCommand, { timeout: 10000 }, (listError, listStdout, listStderr) => {
            if (listError) {
                clearTimeout(timeout);
                return listReject(listStderr || listError.message);
            }

            const profiles = parseWifiList(listStdout, platform);

            if (profiles.length === 0) {
                clearTimeout(timeout);
                return listResolve([]);
            }

            // 2. Now, create a promise for each profile to get its details
            const detailPromises = profiles.map(profileName => {
                return new Promise((detailResolve) => {
                    let detailCommand;
                    if (platform === 'win32') {
                        const escapedName = `"${profileName}"`;
                        detailCommand = `chcp 65001 > nul && netsh wlan show profile name=${escapedName} key=clear`;
                    } else {
                        const escapedName = `"${profileName.replace(/"/g, '\\"')}"`;
                        detailCommand = `nmcli --show-secrets connection show ${escapedName}`;
                    }

                    exec(detailCommand, { timeout: 5000 }, (detailError, detailStdout, detailStderr) => {
                        if (detailError) {
                            // If one fails, don't crash the whole app. Resolve with an error state.
                            detailResolve({ name: profileName, error: detailStderr || detailError.message });
                        } else {
                            detailResolve({ name: profileName, details: parseWifiDetails(detailStdout, platform) });
                        }
                    });
                });
            });

            // 3. Run all the detail-fetching promises in parallel and return the collected results
            Promise.all(detailPromises).then(results => {
                clearTimeout(timeout);
                listResolve(results);
            }).catch(error => {
                clearTimeout(timeout);
                listReject(error.message || error);
            });
        });
    });
});

// --- Scan for available networks ---
ipcMain.handle('scan-available-networks', async () => {
    return new Promise((resolve, reject) => {
        const platform = process.platform;

        if (platform === 'win32') {
            // Correct command for scanning available networks on Windows
            const scanCommand = 'netsh wlan show networks';

            exec(scanCommand, (error, stdout, stderr) => {
                if (error) {
                    // Log stderr for better debugging if command fails
                    console.error('netsh wlan show networks stderr:', stderr);
                    return reject(stderr || error.message);
                }

                try {
                    const networks = parseWindowsAvailableNetworks(stdout);
                    resolve(networks);
                } catch (parseError) {
                    console.error('Failed to parse Windows network data:', parseError, 'Output:', stdout);
                    reject(`Failed to parse network data: ${parseError.message}`);
                }
            });

        } else if (platform === 'linux') {
            // Linux: Actually scan for available networks
            // Added a small delay after rescan to ensure results are fresh
            const scanCommand = 'nmcli device wifi rescan && sleep 2 && nmcli device wifi list';

            exec(scanCommand, (error, stdout, stderr) => {
                if (error) {
                    console.error('nmcli error:', stderr);
                    return reject(stderr || error.message);
                }

                try {
                    const networks = parseLinuxAvailableNetworks(stdout);
                    resolve(networks);
                } catch (parseError) {
                    console.error('Failed to parse Linux network data:', parseError, 'Output:', stdout);
                    reject(`Failed to parse network data: ${parseError.message}`);
                }
            });
        } else {
            return reject(`Unsupported OS: ${platform}`);
        }
    });
});

// --- Apply decrypted network profile and connect ---
ipcMain.handle('apply-network-profile', async (event, payload = {}) => {
    return new Promise((resolve) => {
        const platform = process.platform;
        if (platform !== 'win32' && platform !== 'linux') {
            return resolve({ success: false, message: `Unsupported OS: ${platform}` });
        }

        const {
            ssid,
            password = '',
            autoConnect = true,
            hidden = false,
            origin = 'renderer'
        } = payload;

        if (!ssid) {
            return resolve({ success: false, message: 'SSID is required to apply a profile', origin });
        }

        if (platform === 'win32') {
            const safeSsid = `${ssid}`.replace(/"/g, '');
            const profileXml = createWindowsProfileXml({ ssid: safeSsid, password, autoConnect, hidden });
            const profilePath = path.join(os.tmpdir(), `wifi_profile_${Date.now()}.xml`);

            fs.writeFile(profilePath, profileXml, (writeError) => {
                if (writeError) {
                    return resolve({ success: false, message: `Failed to write profile: ${writeError.message}`, origin });
                }

                const addProfileCommand = `netsh wlan add profile filename="${profilePath}" user=all`;
                const connectCommand = `netsh wlan connect name="${safeSsid}"`;

                exec(addProfileCommand, (addError, addStdout, addStderr) => {
                    try {
                        fs.unlinkSync(profilePath);
                    } catch (cleanupError) {
                        console.warn('Failed to remove temporary profile file:', cleanupError.message);
                    }

                    if (addError) {
                        return resolve({
                            success: false,
                            message: addStderr || addError.message,
                            stdout: addStdout,
                            origin,
                            platform
                        });
                    }

                    exec(connectCommand, (connectError, connectStdout, connectStderr) => {
                        if (connectError) {
                            return resolve({
                                success: false,
                                message: connectStderr || connectError.message,
                                stdout: connectStdout,
                                origin,
                                platform
                            });
                        }

                        return resolve({
                            success: true,
                            message: `Profile applied and connection attempted for ${safeSsid}`,
                            stdout: connectStdout,
                            origin,
                            platform
                        });
                    });
                });
            });
        } else {
            const escapedSsid = `${ssid}`.replace(/"/g, '\\"');
            const escapedPassword = `${password}`.replace(/"/g, '\\"');
            const commandParts = [
                `nmcli dev wifi connect "${escapedSsid}"`
            ];

            if (password) {
                commandParts.push(`password "${escapedPassword}"`);
            }

            commandParts.push(`hidden ${hidden ? 'yes' : 'no'}`);
            commandParts.push(`autoconnect ${autoConnect ? 'yes' : 'no'}`);

            const connectCommand = commandParts.join(' ');

            exec(connectCommand, (error, stdout, stderr) => {
                if (error) {
                    return resolve({ success: false, message: stderr || error.message, stdout, origin, platform });
                }

                return resolve({
                    success: true,
                    message: `Profile applied and connection attempted for ${ssid}`,
                    stdout,
                    origin,
                    platform
                });
            });
        }
    });
});

// --- Connect to a network ---
ipcMain.handle('connect-to-network', async (event, { ssid, password, saveProfile = true, autoConnect = false }) => {
    return new Promise((resolve, reject) => {
        const platform = process.platform;

        if (platform === 'win32') {
            // Windows connection process
            if (saveProfile) {
                // Create a temporary XML profile file
                const profileXml = `<?xml version="1.0"?>
<WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">
    <name>${ssid}</name>
    <SSIDConfig>
        <SSID>
            <name>${ssid}</name>
        </SSID>
    </SSIDConfig>
    <connectionType>ESS</connectionType>
    <connectionMode>${autoConnect ? 'auto' : 'manual'}</connectionMode>
    <MSM>
        <security>
            <authEncryption>
                <authentication>WPA2PSK</authentication>
                <encryption>AES</encryption>
                <useOneX>false</useOneX>
            </authEncryption>
            <sharedKey>
                <keyType>passPhrase</keyType>
                <protected>false</protected>
                <keyMaterial>${password}</keyMaterial>
            </sharedKey>
        </security>
    </MSM>
</WLANProfile>`;

                // Write profile to temporary file
                const tempDir = os.tmpdir();
                const profilePath = path.join(tempDir, `wifi_profile_${ssid}.xml`);

                fs.writeFileSync(profilePath, profileXml);

                // Add profile and connect
                const addProfileCommand = `netsh wlan add profile filename="${profilePath}"`;
                const connectCommand = `netsh wlan connect name="${ssid}"`;

                exec(addProfileCommand, (addError, addStdout, addStderr) => {
                    // Clean up temp file
                    try {
                        fs.unlinkSync(profilePath);
                    } catch (e) {
                        console.warn('Failed to delete temp profile file:', e);
                    }

                    if (addError) {
                        return reject(`Failed to add profile: ${addStderr || addError.message}`);
                    }

                    // Now connect to the network
                    exec(connectCommand, (connectError, connectStdout, connectStderr) => {
                        if (connectError) {
                            return reject(`Failed to connect: ${connectStderr || connectError.message}`);
                        }
                        resolve({ success: true, message: 'Successfully connected to network' });
                    });
                });
            } else {
                // Direct connection without saving profile
                const connectCommand = `netsh wlan connect name="${ssid}"`;
                exec(connectCommand, (error, stdout, stderr) => {
                    if (error) {
                        return reject(`Failed to connect: ${stderr || error.message}`);
                    }
                    resolve({ success: true, message: 'Successfully connected to network' });
                });
            }

        } else if (platform === 'linux') {
            // Linux connection using nmcli
            let connectCommand;

            if (saveProfile) {
                // Create a new connection profile
                connectCommand = `nmcli device wifi connect "${ssid}" password "${password}"`;
                if (autoConnect) {
                    connectCommand += ' autoconnect yes';
                }
            } else {
                // Connect without saving (temporary connection)
                connectCommand = `nmcli device wifi connect "${ssid}" password "${password}" --temporary`;
            }

            exec(connectCommand, (error, stdout, stderr) => {
                if (error) {
                    return reject(`Failed to connect: ${stderr || error.message}`);
                }
                resolve({ success: true, message: 'Successfully connected to network' });
            });

        } else {
            reject(`Unsupported OS: ${platform}`);
        }
    });
});

// --- Get current connection status ---
ipcMain.handle('get-connection-status', async () => {
    return new Promise((resolve, reject) => {
        const platform = process.platform;
        let statusCommand;

        if (platform === 'win32') {
            statusCommand = 'netsh wlan show interfaces';
        } else if (platform === 'linux') {
            // Use nmcli to get active connection information
            statusCommand = 'nmcli -t -f NAME,TYPE connection show --active | grep -i wifi';
        } else {
            return reject(`Unsupported OS: ${platform}`);
        }

        // Add timeout to prevent hanging
        const timeout = setTimeout(() => {
            resolve({ connected: false, ssid: null });
        }, 5000); // 5 second timeout

        exec(statusCommand, { timeout: 4000 }, (error, stdout, stderr) => {
            clearTimeout(timeout);
            
            // If error, resolve with disconnected status instead of rejecting
            if (error) {
                console.warn('Failed to get connection status:', error.message);
                return resolve({ connected: false, ssid: null });
            }

            try {
                let currentNetwork = null;

                if (platform === 'win32') {
                    currentNetwork = parseWindowsConnectionStatus(stdout);
                } else { // linux
                    // Parse nmcli tab-separated output: NAME:TYPE
                    const lines = stdout.split('\n');
                    for (const line of lines) {
                        if (line.trim()) {
                            const parts = line.split(':');
                            if (parts.length >= 1 && parts[0]) {
                                currentNetwork = parts[0].trim();
                                break; // Take the first active wifi connection
                            }
                        }
                    }
                }

                resolve({ connected: !!currentNetwork, ssid: currentNetwork });
            } catch (parseError) {
                console.warn('Failed to parse connection status:', parseError.message);
                resolve({ connected: false, ssid: null });
            }
        });
    });
});

// --- Disconnect from current network ---
ipcMain.handle('disconnect-network', async () => {
    return new Promise((resolve, reject) => {
        const platform = process.platform;
        let disconnectCommand;

        if (platform === 'win32') {
            disconnectCommand = 'netsh wlan disconnect';
        } else if (platform === 'linux') {
            disconnectCommand = 'nmcli device disconnect wifi';
        } else {
            return reject(`Unsupported OS: ${platform}`);
        }

        exec(disconnectCommand, (error, stdout, stderr) => {
            if (error) {
                return reject(stderr || error.message);
            }
            resolve({ success: true, message: 'Successfully disconnected from network' });
        });
    });
});

// --- Delete saved network profile ---
ipcMain.handle('delete-network-profile', async (event, { ssid }) => {
    return new Promise((resolve, reject) => {
        const platform = process.platform;
        let deleteCommand;

        if (platform === 'win32') {
            deleteCommand = `netsh wlan delete profile name="${ssid}"`;
        } else if (platform === 'linux') {
            deleteCommand = `nmcli connection delete "${ssid}"`;
        } else {
            return reject(`Unsupported OS: ${platform}`);
        }

        exec(deleteCommand, (error, stdout, stderr) => {
            if (error) {
                return reject(stderr || error.message);
            }
            resolve({ success: true, message: 'Successfully deleted network profile' });
        });
    });
});

// --- Network Diagnostics Handlers ---

// 1. Ping
ipcMain.handle('run-ping', async (event, host) => {
    return new Promise((resolve, reject) => {
        const platform = process.platform;
        const command = platform === 'win32' ? `ping -n 4 ${host}` : `ping -c 4 ${host}`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                // Ping returns error code if host is unreachable, but we still want the output
                resolve({ success: false, output: stdout || stderr || error.message });
            } else {
                resolve({ success: true, output: stdout });
            }
        });
    });
});

// 2. DNS Lookup
ipcMain.handle('run-dns-lookup', async (event, host) => {
    return new Promise((resolve, reject) => {
        const command = `nslookup ${host}`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                resolve({ success: false, output: stdout || stderr || error.message });
            } else {
                resolve({ success: true, output: stdout });
            }
        });
    });
});

// 3. IP Configuration
ipcMain.handle('get-ip-config', async () => {
    return new Promise((resolve, reject) => {
        const platform = process.platform;
        const command = platform === 'win32' ? 'ipconfig /all' : 'ip addr'; // or ifconfig if available

        exec(command, (error, stdout, stderr) => {
            if (error) {
                resolve({ success: false, output: stderr || error.message });
            } else {
                resolve({ success: true, output: stdout });
            }
        });
    });
});

// 4. Simple Speed Test (Download Latency & Speed)
ipcMain.handle('run-speed-test', async () => {
    return new Promise((resolve, reject) => {
        const url = 'https://proof.ovh.net/files/1Mb.dat'; // 1MB test file
        const startTime = Date.now();
        let downloadedBytes = 0;

        const req = https.get(url, (res) => {
            if (res.statusCode !== 200) {
                resolve({ success: false, message: `Failed to connect to speed test server (Status: ${res.statusCode})` });
                return;
            }

            res.on('data', (chunk) => {
                downloadedBytes += chunk.length;
            });

            res.on('end', () => {
                const endTime = Date.now();
                const durationInSeconds = (endTime - startTime) / 1000;
                const bitsLoaded = downloadedBytes * 8;
                const bps = bitsLoaded / durationInSeconds;
                const mbps = (bps / (1024 * 1024)).toFixed(2);

                resolve({
                    success: true,
                    result: {
                        downloadSpeed: mbps,
                        latency: (endTime - startTime) // Rough latency estimate
                    }
                });
            });
        });

        req.on('error', (e) => {
            resolve({ success: false, message: `Speed test failed: ${e.message}` });
        });

        req.end();
    });
});

// --- Bluetooth Sharing & Intake ---
ipcMain.handle('share-network-bluetooth', async (_event, payload) => {
    if (!bluetoothEnabled) {
        return { success: false, message: 'Bluetooth is disabled' };
    }
    // Placeholder implementation; replace with OS-level Bluetooth APIs as available.
    console.info('Bluetooth share requested:', payload);
    return {
        success: true,
        encrypted: payload.encrypted,
        ssid: payload.ssid,
        security: payload.security,
        target: payload?.target
    };
});

ipcMain.handle('respond-to-bluetooth-offer', async (_event, payload) => {
    console.info('Bluetooth offer response:', payload);
    return { success: true, approved: payload.approved };
});

ipcMain.handle('start-bluetooth-listener', async (event) => {
    bluetoothSubscribers.add(event.sender);
    return { listening: true };
});

ipcMain.handle('get-bluetooth-state', async () => {
    await bluetoothService.backendReady;
    const supported = Boolean(bluetoothService.adapter);
    return {
        supported,
        enabled: bluetoothEnabled,
        mock: !supported || !bluetoothService.adapter?.startAdvertising
    };
});

ipcMain.handle('enable-bluetooth', async () => {
    bluetoothEnabled = true;
    return { enabled: bluetoothEnabled };
});

ipcMain.handle('scan-bluetooth-peers', async () => {
    if (!bluetoothEnabled) {
        return { success: false, message: 'Bluetooth is disabled' };
    }

    await bluetoothService.backendReady;
    const supported = Boolean(bluetoothService.adapter);

    const peers = [];
    let canDiscover = false;
    if (supported && bluetoothService.adapter) {
        const adapter = bluetoothService.adapter;
        const normalizePeer = (device, index) => {
            if (!device) return null;
            const id = device.id || device.address || device.mac || device.uuid || device.name || `device-${index + 1}`;
            const rssi = typeof device.rssi === 'number' ? device.rssi : (typeof device.signal === 'number' ? device.signal : device.strength);
            const strength = typeof rssi === 'number' ? Math.max(0, Math.min(100, 2 * (rssi + 100))) : undefined;
            return {
                id,
                name: device.name || device.friendlyName || device.alias || id,
                strength: typeof strength === 'number' ? Math.round(strength) : undefined
            };
        };

        const collectPeers = (items) => {
            if (!Array.isArray(items)) return;
            items.forEach((device, idx) => {
                const peer = normalizePeer(device, peers.length + idx);
                if (peer) {
                    peers.push(peer);
                }
            });
        };

        const discoverWithEvents = () => new Promise((resolve) => {
            const discovered = [];
            const handler = (address, name, rssi) => discovered.push({ address, name, rssi });
            const finish = () => {
                cleanup();
                resolve(discovered);
            };
            const cleanup = () => {
                if (typeof adapter.off === 'function') {
                    adapter.off('found', handler);
                    adapter.off('finished', finish);
                    adapter.off('error', finish);
                } else if (typeof adapter.removeListener === 'function') {
                    adapter.removeListener('found', handler);
                    adapter.removeListener('finished', finish);
                    adapter.removeListener('error', finish);
                }
            };
            const timer = setTimeout(finish, 5000);
            const safeFinish = () => {
                clearTimeout(timer);
                finish();
            };
            (adapter.on || adapter.addListener)?.call(adapter, 'found', handler);
            (adapter.on || adapter.addListener)?.call(adapter, 'finished', safeFinish);
            (adapter.on || adapter.addListener)?.call(adapter, 'error', safeFinish);
            try {
                (adapter.inquire || adapter.startInquiry)?.call(adapter);
            } catch (error) {
                clearTimeout(timer);
                cleanup();
                resolve(discovered);
            }
        });

        canDiscover = typeof adapter.discoverDevices === 'function'
            || typeof adapter.listDevices === 'function'
            || typeof adapter.scan === 'function'
            || typeof adapter.inquire === 'function'
            || typeof adapter.startInquiry === 'function';

        if (canDiscover) {
            try {
                if (typeof adapter.discoverDevices === 'function') {
                    collectPeers(await adapter.discoverDevices());
                } else if (typeof adapter.listDevices === 'function') {
                    collectPeers(await adapter.listDevices());
                } else if (typeof adapter.scan === 'function') {
                    collectPeers(await adapter.scan());
                } else {
                    collectPeers(await discoverWithEvents());
                }
            } catch (error) {
                return {
                    success: false,
                    peers: [],
                    mock: !supported || !canDiscover,
                    message: `Bluetooth scan failed: ${error.message}`
                };
            }
        }
    }

    return {
        success: true,
        peers,
        mock: !supported || !canDiscover,
        message: supported ? (peers.length ? `Found ${peers.length} device(s)` : 'No devices found') : 'Bluetooth adapter not available'
    };
});
// --- Bluetooth IPC Handlers ---
ipcMain.handle('bluetooth-confirm-session', async (_event, approved) => {
    return bluetoothService.setRendererApproval(Boolean(approved));
});

ipcMain.handle('bluetooth-start-advertising', async (_event, options) => {
    return bluetoothService.startAdvertising(options || {});
});

ipcMain.handle('bluetooth-stop-advertising', async () => {
    return bluetoothService.stopAdvertising();
});

ipcMain.handle('bluetooth-send-payload', async (_event, payload, options) => {
    return bluetoothService.sendSecurePayload(payload, options || {});
});
// 5. Latency, Jitter & Packet Loss Analyzer
ipcMain.handle('run-latency-analyzer', async (_event, host = '8.8.8.8') => {
    return new Promise((resolve) => {
        const platform = process.platform;
        const command = platform === 'win32' ? `ping -n 12 ${host}` : `ping -c 12 ${host}`;

        exec(command, (error, stdout, stderr) => {
            const output = stdout || stderr || error?.message || 'No output';
            const lines = output.split(/\r?\n/).filter(Boolean);
            const timeRegex = /time[=<]([0-9.]+)/i;
            const times = [];
            lines.forEach((line) => {
                const match = line.match(timeRegex);
                if (match) times.push(parseFloat(match[1]));
            });

            const sentLine = lines.find((line) => /packets transmitted|Sent =/i.test(line)) || '';
            const receivedLine = lines.find((line) => /received|Received =/i.test(line)) || '';
            const sentMatch = sentLine.match(/(\d+)/);
            const recvMatch = receivedLine.match(/(\d+)/);
            const sent = sentMatch ? parseInt(sentMatch[1], 10) : times.length;
            const received = recvMatch ? parseInt(recvMatch[1], 10) : times.length;
            const loss = sent > 0 ? Math.max(0, ((sent - received) / sent) * 100) : 0;

            const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
            const max = times.length ? Math.max(...times) : null;
            let jitter = null;
            if (times.length > 1) {
                const diffs = times.slice(1).map((t, idx) => Math.abs(t - times[idx]));
                jitter = diffs.reduce((a, b) => a + b, 0) / diffs.length;
            }

            resolve({
                success: !error,
                output,
                stats: {
                    avgLatency: avg,
                    maxLatency: max,
                    jitter,
                    packetLoss: loss
                }
            });
        });
    });
});

// 6. Network Speed Estimator (Lightweight)
ipcMain.handle('run-speed-estimator', async () => {
    const targets = [
        'https://speed.hetzner.de/100kB.bin',
        'https://proof.ovh.net/files/100kB.dat'
    ];

    const downloadProbe = (url) =>
        new Promise((resolve) => {
            const start = Date.now();
            let bytes = 0;
            https
                .get(url, (res) => {
                    res.on('data', (chunk) => {
                        bytes += chunk.length;
                        if (bytes >= 500000) {
                            res.destroy();
                        }
                    });
                    res.on('end', () => {
                        const seconds = (Date.now() - start) / 1000;
                        const mbps = ((bytes * 8) / seconds / (1024 * 1024)).toFixed(2);
                        resolve({ mbps: parseFloat(mbps), bytes, seconds, success: true });
                    });
                })
                .on('error', (error) => resolve({ success: false, error: error.message }));
        });

    const results = await Promise.all(targets.map((url) => downloadProbe(url)));
    const successful = results.filter((r) => r.success && r.mbps);
    const average = successful.length
        ? successful.reduce((sum, r) => sum + r.mbps, 0) / successful.length
        : null;

    return {
        success: !!average,
        results,
        averageMbps: average,
        message: average ? 'Lightweight probe complete' : 'Unable to estimate speed'
    };
});

// 7. Wi-Fi Channel Congestion Scan
ipcMain.handle('run-channel-scan', async () => {
    return new Promise((resolve) => {
        const platform = process.platform;
        const command =
            platform === 'win32'
                ? 'netsh wlan show networks mode=bssid'
                : 'nmcli --colors no -f SSID,FREQ,CHAN,IN-USE dev wifi list';

        exec(command, (error, stdout, stderr) => {
            const output = stdout || stderr || error?.message || '';
            const counts = { c1: 0, c6: 0, c11: 0, band5: 0, band6: 0 };
            const lines = output.split(/\r?\n/);
            lines.forEach((line) => {
                const channelMatch = line.match(/Channel\s*:\s*(\d+)/i) || line.match(/\s(\d{1,3})\s*$/);
                const freqMatch = line.match(/(\d+\.\d)\s*GHz/);
                const channel = channelMatch ? parseInt(channelMatch[1], 10) : null;
                const freq = freqMatch ? parseFloat(freqMatch[1]) : null;
                if (channel === 1) counts.c1 += 1;
                if (channel === 6) counts.c6 += 1;
                if (channel === 11) counts.c11 += 1;
                if (freq && freq >= 5 && freq < 6) counts.band5 += 1;
                if (freq && freq >= 6) counts.band6 += 1;
            });

            resolve({ success: !error, counts, output });
        });
    });
});

// 8. Frequency Band Detection & Router Info
ipcMain.handle('run-band-detection', async () => {
    return new Promise((resolve) => {
        const platform = process.platform;
        const command =
            platform === 'win32'
                ? 'netsh wlan show interfaces'
                : 'nmcli --colors no -f ACTIVE,BSSID,SSID,FREQ,SIGNAL,RATE dev wifi show --active';

        exec(command, (error, stdout, stderr) => {
            const output = stdout || stderr || error?.message || '';
            const freqMatch = output.match(/(\d+\.?\d*)\s*GHz/i);
            const rateMatch = output.match(/(\d+\.?\d*)\s*Mb/);
            const signalMatch = output.match(/Signal\s*:\s*(\d+)/i) || output.match(/SIGNAL:\s*(\d+)/i);
            const bssidMatch = output.match(/BSSID\s*:\s*([0-9A-Fa-f:]+)/) || output.match(/BSSID:\s*([0-9A-Fa-f:]+)/);

            let band = null;
            const freq = freqMatch ? parseFloat(freqMatch[1]) : null;
            if (freq) {
                if (freq >= 2 && freq < 3) band = '2.4 GHz';
                else if (freq >= 5 && freq < 6) band = '5 GHz';
                else if (freq >= 6) band = '6 GHz';
            }

            resolve({
                success: !!freq,
                output,
                band,
                details: {
                    frequency: freq,
                    linkSpeed: rateMatch ? rateMatch[1] : null,
                    signal: signalMatch ? signalMatch[1] : null,
                    bssid: bssidMatch ? bssidMatch[1] : null
                }
            });
        });
    });
});

// 9. Signal Strength Stability Graph (10 seconds)
ipcMain.handle('run-signal-stability', async () => {
    const platform = process.platform;
    const command =
        platform === 'win32'
            ? 'netsh wlan show interfaces'
            : 'nmcli --colors no -f SIGNAL dev wifi show --active';

    const sampleSignal = () =>
        new Promise((resolve) => {
            exec(command, (error, stdout, stderr) => {
                const text = stdout || stderr || error?.message || '';
                const match = text.match(/(\d+)\s*%/) || text.match(/SIGNAL:\s*(\d+)/);
                resolve(match ? parseInt(match[1], 10) : null);
            });
        });

    const samples = [];
    for (let i = 0; i < 10; i++) {
        // eslint-disable-next-line no-await-in-loop
        const value = await sampleSignal();
        samples.push({ tick: i + 1, signal: value });
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 1000));
    }

    return { success: samples.some((s) => s.signal !== null), samples };
});

// 10. Captive Portal Detection
ipcMain.handle('run-captive-portal-check', async () => {
    const checkHttp = () =>
        new Promise((resolve) => {
            http
                .get('http://captive.apple.com', (res) => {
                    resolve({ status: res.statusCode, location: res.headers.location });
                })
                .on('error', (error) => resolve({ error: error.message }));
        });

    const checkHttps = () =>
        new Promise((resolve) => {
            https
                .get('https://example.com', (res) => {
                    resolve({ status: res.statusCode, location: res.headers.location });
                })
                .on('error', (error) => resolve({ error: error.message }));
        });

    const [httpResult, httpsResult] = await Promise.all([checkHttp(), checkHttps()]);
    const captive =
        (httpResult.status && httpResult.status >= 300 && httpResult.status < 400) ||
        httpResult.location ||
        (httpsResult.status && httpsResult.status >= 300 && httpsResult.status < 400);

    return { success: true, httpResult, httpsResult, captivePortalDetected: captive };
});

// 11. DNS Server Benchmark
ipcMain.handle('run-dns-benchmark', async (_event, host = 'example.com') => {
    const servers = [
        { name: 'Current DNS', address: '' },
        { name: 'Google', address: '8.8.8.8' },
        { name: 'Cloudflare', address: '1.1.1.1' },
        { name: 'Quad9', address: '9.9.9.9' }
    ];

    const runLookup = (server) =>
        new Promise((resolve) => {
            const serverArg = server.address ? `${server.address} ` : '';
            const command = `nslookup ${host} ${serverArg}`;
            const start = Date.now();
            exec(command, (error, stdout, stderr) => {
                const duration = Date.now() - start;
                const output = stdout || stderr || error?.message || '';
                resolve({
                    name: server.name,
                    server: server.address || 'System default',
                    success: !error,
                    duration,
                    output
                });
            });
        });

    const results = [];
    for (const server of servers) {
        // eslint-disable-next-line no-await-in-loop
        const result = await runLookup(server);
        results.push(result);
    }

    const fastest = results
        .filter((r) => r.success)
        .sort((a, b) => a.duration - b.duration)
        .shift();

    return { success: results.some((r) => r.success), results, fastest };
});

// 12. IP Configuration Health Check
ipcMain.handle('run-ip-health-check', async () => {
    return new Promise((resolve) => {
        const platform = process.platform;
        const command = platform === 'win32' ? 'ipconfig /all' : 'ip addr';

        exec(command, (error, stdout, stderr) => {
            const output = stdout || stderr || error?.message || '';
            const warnings = [];
            if (/0\.0\.0\.0/.test(output)) warnings.push('Gateway appears to be 0.0.0.0');
            if (/Media disconnected/i.test(output)) warnings.push('Some adapters are disconnected');
            if (/Duplicate/i.test(output)) warnings.push('Potential duplicate IP detected');
            if (/Autoconfiguration/i.test(output)) warnings.push('Autoconfiguration address in use');

            resolve({ success: !error, output, warnings, status: warnings.length ? 'warning' : 'healthy' });
        });
    });
});

// 13. Router Information Extraction
ipcMain.handle('run-router-info', async () => {
    return new Promise((resolve) => {
        const platform = process.platform;
        const command =
            platform === 'win32'
                ? 'netsh wlan show interfaces'
                : 'nmcli --colors no -f BSSID,SSID,CHAN,FREQ,RATE,SIGNAL dev wifi show --active';

        exec(command, (error, stdout, stderr) => {
            const output = stdout || stderr || error?.message || '';
            const bssid = (output.match(/BSSID\s*:\s*([0-9A-Fa-f:]+)/) || output.match(/BSSID:\s*([0-9A-Fa-f:]+)/) || [])[1];
            const rate = (output.match(/(\d+\.?\d*)\s*Mb/) || [])[1];
            const signal = (output.match(/Signal\s*:\s*(\d+)/i) || output.match(/SIGNAL:\s*(\d+)/i) || [])[1];
            const freq = (output.match(/(\d+\.?\d*)\s*GHz/i) || [])[1];
            resolve({ success: !error, output, bssid, rate, signal, frequency: freq });
        });
    });
});

// 14. Internet Route Trace (Tracert/Traceroute)
ipcMain.handle('run-mini-traceroute', async (_event, host = '8.8.8.8') => {
    return new Promise((resolve) => {
        const platform = process.platform;
        const command = platform === 'win32' ? `tracert -h 5 ${host}` : `traceroute -m 5 ${host}`;
        exec(command, (error, stdout, stderr) => {
            const output = stdout || stderr || error?.message || '';
            resolve({ success: !error, output });
        });
    });
});

// 15. MTU Test
ipcMain.handle('run-mtu-test', async (_event, host = '8.8.8.8') => {
    return new Promise((resolve) => {
        const platform = process.platform;
        const maxSizes = [1472, 1460, 1400, 1300];
        const testSize = (size) =>
            new Promise((res) => {
                if (platform === 'win32') {
                    exec(`ping -f -l ${size} -n 1 ${host}`, (error) => {
                        res({ size, success: !error });
                    });
                } else {
                    exec(`ping -M do -s ${size} -c 1 ${host}`, (error) => {
                        res({ size, success: !error });
                    });
                }
            });

        const run = async () => {
            for (const size of maxSizes) {
                // eslint-disable-next-line no-await-in-loop
                const result = await testSize(size);
                if (!result.success) {
                    return { size, success: false };
                }
            }
            return { size: maxSizes[0], success: true };
        };

        run().then((result) => {
            resolve({ success: result.success, breakpoint: result.size });
        });
    });
});

// 16. Local Network Scan (Optional)
ipcMain.handle('run-local-scan', async () => {
    return new Promise((resolve) => {
        const command = process.platform === 'win32' ? 'arp -a' : 'arp -an';
        exec(command, (error, stdout, stderr) => {
            const output = stdout || stderr || error?.message || '';
            const devices = (output.match(/\d+\.\d+\.\d+\.\d+/g) || []).length;
            resolve({ success: !error, output, devices });
        });
    });
});

// 17. Firewall & Port Reachability Test
ipcMain.handle('run-port-check', async (_event, host = '8.8.8.8') => {
    const ports = [53, 80, 443, 22, 8080];
    const testPort = (port) =>
        new Promise((resolve) => {
            const socket = net.createConnection({ host, port, timeout: 3000 });
            socket.on('connect', () => {
                socket.destroy();
                resolve({ port, reachable: true });
            });
            socket.on('timeout', () => {
                socket.destroy();
                resolve({ port, reachable: false, reason: 'timeout' });
            });
            socket.on('error', (error) => {
                socket.destroy();
                resolve({ port, reachable: false, reason: error.code || error.message });
            });
        });

    const results = [];
    for (const port of ports) {
        // eslint-disable-next-line no-await-in-loop
        const result = await testPort(port);
        results.push(result);
    }
    const blocked = results.filter((r) => !r.reachable);
    return { success: true, results, blocked };
});

// 18. Wi-Fi Profile Integrity Check
ipcMain.handle('run-wifi-profile-check', async () => {
    return new Promise((resolve) => {
        const platform = process.platform;
        const command = platform === 'win32' ? 'netsh wlan show profiles' : 'nmcli connection show';
        exec(command, (error, stdout, stderr) => {
            const output = stdout || stderr || error?.message || '';
            const duplicate = /\b(\S+)\b[\s\S]*\b\1\b/.test(output);
            resolve({ success: !error, output, duplicateProfiles: duplicate });
        });
    });
});

// 19. Smart Diagnosis Summary
ipcMain.handle('run-smart-summary', async () => {
    return { success: true, message: 'Collecting latest diagnostics for summary...' };
});

// --- OS Detection Handler ---
ipcMain.handle('get-os-info', async () => {
    const platform = process.platform;
    let osInfo = {
        platform: platform,
        distro: 'Unknown',
        desktopEnv: 'Unknown'
    };

    if (platform === 'win32') {
        osInfo.distro = 'Windows';
        osInfo.desktopEnv = 'Windows Shell';
    } else if (platform === 'linux') {
        // Try to get distro name
        try {
            const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
            const match = osRelease.match(/^PRETTY_NAME="?(.*?)"?$/m);
            if (match) {
                osInfo.distro = match[1];
            }
        } catch (e) {
            console.warn('Could not read /etc/os-release:', e);
        }

    }

    return osInfo;
});

// --- Theme Detection Handler ---
ipcMain.handle('get-system-theme', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
});

// Listen for system theme changes and notify renderer
nativeTheme.on('updated', () => {
    if (mainWindow) {
        const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
        mainWindow.webContents.send('theme-changed', theme);
    }
});

