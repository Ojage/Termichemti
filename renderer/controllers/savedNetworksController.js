export class SavedNetworksController {
  constructor({ tree, searchInput, refreshButton, status, wifiService, bluetoothService, tabs, logger, toastManager, diagnostics }) {
    this.tree = tree;
    this.searchInput = searchInput;
    this.refreshButton = refreshButton;
    this.status = status;
    this.wifiService = wifiService;
    this.bluetoothService = bluetoothService;
    this.tabs = tabs;
    this.logger = logger;
    this.toastManager = toastManager;
    this.diagnostics = diagnostics;
    this.networks = [];

    this.refreshButton?.addEventListener('click', () => this.load());
    this.searchInput?.addEventListener('input', () => this.render());
    this.tree?.addEventListener('click', (event) => this.handleSelect(event));
  }

  async load() {
    try {
      this.setStatus('Loading saved networks...');
      this.tree.innerHTML = '<div class="tree-loading"><div class="loader-small"></div><span>Loading...</span></div>';
      this.networks = await this.wifiService.fetchSavedNetworks();
      this.render();
      this.setStatus(`Loaded ${this.networks.length} saved network${this.networks.length === 1 ? '' : 's'}`);
      this.logger?.success('Saved networks refreshed');
    } catch (error) {
      this.tree.innerHTML = '<div class="tree-empty"><i class="fas fa-exclamation-triangle"></i><p>Failed to load networks</p></div>';
      this.logger?.error(`Failed to load saved networks: ${error.message || error}`);
    }
  }

  filteredNetworks() {
    const term = (this.searchInput?.value || '').toLowerCase().trim();
    if (!term) return this.networks;
    return this.networks.filter((n) => n.name.toLowerCase().includes(term));
  }

  render() {
    if (!this.tree) return;
    const items = this.filteredNetworks();
    if (items.length === 0) {
      this.tree.innerHTML = '<div class="tree-empty"><i class="fas fa-wifi-slash"></i><p>No matching networks</p></div>';
      return;
    }

    this.tree.innerHTML = items.map((network) => `
      <div class="tree-item" data-name="${network.name}">
        <i class="fas fa-wifi"></i>
        <div class="tree-item-body">
          <span class="tree-item-title">${network.name}</span>
          <span class="tree-item-subtitle">${network.password ? 'Password stored' : 'No password'} • ${network.security || 'Unknown'} security</span>
        </div>
        <div class="tree-item-actions">
          <button class="ghost-btn ghost-btn-compact" data-action="share" data-name="${network.name}"><i class="fas fa-bluetooth-b"></i> Share via Bluetooth</button>
        </div>
      </div>
    `).join('');
  }

  handleSelect(event) {
    const shareButton = event.target.closest('[data-action="share"]');
    if (shareButton) {
      const network = this.networks.find((n) => n.name === shareButton.dataset.name);
      this.shareNetwork(network);
      event.stopPropagation();
      return;
    }

    const item = event.target.closest('.tree-item');
    if (!item) return;
    const name = item.dataset.name;
    const network = this.networks.find((n) => n.name === name);
    if (network) {
      this.tabs.open(network);
    }
  }

  setStatus(text) {
    if (this.status) this.status.textContent = text;
  }

  async shareNetwork(network) {
    if (!network) return;
    const toast = this.toastManager?.show(`Sharing ${network.name} over Bluetooth...`, 'info', { spinner: true, duration: 0 });
    this.logger?.info(`Preparing Bluetooth share for ${network.name} (${network.security || 'Unknown'}; encrypted=${network.password ? 'yes' : 'no'})`);
    this.diagnostics?.recordBluetoothEvent?.({
      type: 'share',
      ssid: network.name,
      security: network.security,
      encrypted: Boolean(network.password),
      status: 'pending'
    });

    try {
      const result = await this.bluetoothService?.shareNetwork(network);
      if (result?.success) {
        toast?.update(`Shared ${network.name} via Bluetooth`, 'success');
        this.logger?.success(`Shared ${network.name} via Bluetooth (${network.security || 'Unknown'})`);
        this.diagnostics?.recordBluetoothEvent?.({
          type: 'share',
          ssid: network.name,
          security: network.security,
          encrypted: Boolean(network.password),
          status: 'success'
        });
      } else {
        toast?.update(result?.message || `Failed to share ${network.name}`, 'error');
        this.logger?.error(`Bluetooth share failed for ${network.name}: ${result?.message || 'Unknown error'}`);
        this.diagnostics?.recordBluetoothEvent?.({
          type: 'share',
          ssid: network.name,
          security: network.security,
          encrypted: Boolean(network.password),
          status: 'failed'
        });
      }
    } catch (error) {
      toast?.update(`Bluetooth share failed: ${error.message || error}`, 'error');
      this.logger?.error(`Bluetooth share failed for ${network.name}: ${error.message || error}`);
      this.diagnostics?.recordBluetoothEvent?.({
        type: 'share',
        ssid: network.name,
        security: network.security,
        encrypted: Boolean(network.password),
        status: 'failed'
      });
    }
  }
}
