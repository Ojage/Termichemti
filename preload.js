const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // Get all saved Wi-Fi network details
    getAllWifiDetails: () => ipcRenderer.invoke('get-all-wifi-details'),

    // Scan for available networks
    scanAvailableNetworks: () => ipcRenderer.invoke('scan-available-networks'),

    // Connect to a network
    connectToNetwork: (networkData) => ipcRenderer.invoke('connect-to-network', networkData),

    // Apply a decrypted network profile and connect
    applyNetworkProfile: (profileData) => ipcRenderer.invoke('apply-network-profile', profileData),

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
    runLatencyAnalyzer: (host) => ipcRenderer.invoke('run-latency-analyzer', host),
    runSpeedEstimator: () => ipcRenderer.invoke('run-speed-estimator'),
    runChannelScan: () => ipcRenderer.invoke('run-channel-scan'),
    runBandDetection: () => ipcRenderer.invoke('run-band-detection'),
    runSignalStability: () => ipcRenderer.invoke('run-signal-stability'),
    runCaptivePortalCheck: () => ipcRenderer.invoke('run-captive-portal-check'),
    runDnsBenchmark: (host) => ipcRenderer.invoke('run-dns-benchmark', host),
    runIpHealthCheck: () => ipcRenderer.invoke('run-ip-health-check'),
    runRouterInfo: () => ipcRenderer.invoke('run-router-info'),
    runMiniTraceroute: (host) => ipcRenderer.invoke('run-mini-traceroute', host),
    runMtuTest: (host) => ipcRenderer.invoke('run-mtu-test', host),
    runLocalScan: () => ipcRenderer.invoke('run-local-scan'),
    runPortCheck: (host) => ipcRenderer.invoke('run-port-check', host),
    runWifiProfileCheck: () => ipcRenderer.invoke('run-wifi-profile-check'),
    runSmartSummary: () => ipcRenderer.invoke('run-smart-summary'),

    // Bluetooth bridge
    confirmBluetoothPermission: (approved) => ipcRenderer.invoke('bluetooth-confirm-session', approved),
    startBluetoothAdvertising: (options) => ipcRenderer.invoke('bluetooth-start-advertising', options),
    stopBluetoothAdvertising: () => ipcRenderer.invoke('bluetooth-stop-advertising'),
    sendBluetoothPayload: (payload, options) => ipcRenderer.invoke('bluetooth-send-payload', payload, options),
    onBluetoothReceived: (callback) => ipcRenderer.on('bluetooth-received', (_event, data) => callback(data)),
    onBluetoothError: (callback) => ipcRenderer.on('bluetooth-error', (_event, error) => callback(error)),
    onBluetoothWarning: (callback) => ipcRenderer.on('bluetooth-warning', (_event, warning) => callback(warning)),

    // Theme Management
    getSystemTheme: () => ipcRenderer.invoke('get-system-theme'),
    onThemeChanged: (callback) => ipcRenderer.on('theme-changed', (_event, theme) => callback(theme)),

    // Bluetooth Sharing
    shareNetworkBluetooth: (payload) => ipcRenderer.invoke('share-network-bluetooth', payload),
    onBluetoothNetworkReceived: (callback) => ipcRenderer.on('bluetooth-network-received', (_event, payload) => callback(payload)),
    respondToBluetoothOffer: (payload) => ipcRenderer.invoke('respond-to-bluetooth-offer', payload),
    startBluetoothListener: () => ipcRenderer.invoke('start-bluetooth-listener'),
    getBluetoothState: () => ipcRenderer.invoke('get-bluetooth-state'),
    enableBluetooth: () => ipcRenderer.invoke('enable-bluetooth'),
    scanBluetoothPeers: () => ipcRenderer.invoke('scan-bluetooth-peers')
});
