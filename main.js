const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const path = require('node:path');
const { exec } = require('node:child_process');
const fs = require('fs');
const os = require('os');
const https = require('https');

const bluetoothSubscribers = new Set();

// Keep a global reference of the window object
let mainWindow;

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
    // Placeholder implementation; replace with OS-level Bluetooth APIs as available.
    console.info('Bluetooth share requested:', payload);
    return { success: true, encrypted: payload.encrypted, ssid: payload.ssid, security: payload.security };
});

ipcMain.handle('respond-to-bluetooth-offer', async (_event, payload) => {
    console.info('Bluetooth offer response:', payload);
    return { success: true, approved: payload.approved };
});

ipcMain.handle('start-bluetooth-listener', async (event) => {
    bluetoothSubscribers.add(event.sender);
    return { listening: true };
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

