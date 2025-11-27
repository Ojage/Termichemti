const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Get all saved Wi-Fi network details
    getAllWifiDetails: () => ipcRenderer.invoke('get-all-wifi-details'),

    // Scan for available networks
    scanAvailableNetworks: () => ipcRenderer.invoke('scan-available-networks'),

    // Connect to a network
    connectToNetwork: (networkData) => ipcRenderer.invoke('connect-to-network', networkData),

    // Get current connection status
    getConnectionStatus: () => ipcRenderer.invoke('get-connection-status'),

    // Disconnect from current network
    disconnectNetwork: () => ipcRenderer.invoke('disconnect-network'),

    // Delete a saved network profile
    deleteNetworkProfile: (networkData) => ipcRenderer.invoke('delete-network-profile', networkData),

    // Get OS Info
    getOsInfo: () => ipcRenderer.invoke('get-os-info'),

    // Network Diagnostics
    runPing: (host) => ipcRenderer.invoke('run-ping', host),
    runDnsLookup: (host) => ipcRenderer.invoke('run-dns-lookup', host),
    getIpConfig: () => ipcRenderer.invoke('get-ip-config'),
    runSpeedTest: () => ipcRenderer.invoke('run-speed-test'),

    // Theme Management
    getSystemTheme: () => ipcRenderer.invoke('get-system-theme'),
    onThemeChanged: (callback) => ipcRenderer.on('theme-changed', (_event, theme) => callback(theme))
});