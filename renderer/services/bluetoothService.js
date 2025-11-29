export class BluetoothService {
  constructor(logger) {
    this.logger = logger;
    this.listenerRegistered = false;
  }

  async shareNetwork(network) {
    if (!window.api?.shareNetworkBluetooth) {
      this.logger?.error('Bluetooth sharing API is unavailable');
      return { success: false, message: 'Bluetooth API unavailable' };
    }

    const payload = {
      ssid: network.name,
      password: network.password,
      security: network.security || 'Unknown',
      encrypted: Boolean(network.password)
    };

    return window.api.shareNetworkBluetooth(payload);
  }

  startListening(callback) {
    if (this.listenerRegistered || !window.api?.onBluetoothNetworkReceived) return;
    window.api.onBluetoothNetworkReceived((payload) => {
      callback?.(payload);
    });
    window.api.startBluetoothListener?.();
    this.listenerRegistered = true;
  }

  async respondToOffer(offer, approved) {
    if (!window.api?.respondToBluetoothOffer) {
      this.logger?.error('Bluetooth response API unavailable');
      return { success: false };
    }

    return window.api.respondToBluetoothOffer({ ...offer, approved });
  }
}
