export class WifiService {
  constructor(logger) {
    this.logger = logger;
  }

  async fetchSavedNetworks() {
    const records = await window.api.getAllWifiDetails();
    return records.map((record) => ({
      name: record.name,
      password: record.details?.password || null,
      fullDetails: record.details?.fullDetails || record.error || 'Unavailable'
    }));
  }

  async fetchConnectionStatus() {
    try {
      return await window.api.getConnectionStatus();
    } catch (error) {
      this.logger?.warn('Unable to read connection status');
      return { connected: false, ssid: null };
    }
  }

  async scanAvailableNetworks() {
    return window.api.scanAvailableNetworks();
  }

  async connectToNetwork(options) {
    return window.api.connectToNetwork(options);
  }
}
