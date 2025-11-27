export class AvailableNetworksController {
  constructor({ tree, searchInput, scanButton, wifiService, logger }) {
    this.tree = tree;
    this.searchInput = searchInput;
    this.scanButton = scanButton;
    this.wifiService = wifiService;
    this.logger = logger;
    this.networks = [];

    this.scanButton?.addEventListener('click', () => this.scan());
    this.searchInput?.addEventListener('input', () => this.render());
  }

  async scan() {
    try {
      if (this.scanButton) {
        this.scanButton.disabled = true;
        this.scanButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      }
      this.tree.innerHTML = '<div class="tree-loading"><div class="loader-small"></div><span>Scanning...</span></div>';
      this.networks = await this.wifiService.scanAvailableNetworks();
      this.render();
      this.logger?.success(`Found ${this.networks.length} networks`);
    } catch (error) {
      this.tree.innerHTML = '<div class="tree-empty"><i class="fas fa-exclamation-triangle"></i><p>Scan failed</p></div>';
      this.logger?.error(`Failed to scan networks: ${error.message || error}`);
    } finally {
      if (this.scanButton) {
        this.scanButton.disabled = false;
        this.scanButton.innerHTML = '<i class="fas fa-sync-alt"></i>';
      }
    }
  }

  filteredNetworks() {
    const term = (this.searchInput?.value || '').toLowerCase().trim();
    if (!term) return this.networks;
    return this.networks.filter((n) => n.ssid.toLowerCase().includes(term));
  }

  render() {
    if (!this.tree) return;
    const items = this.filteredNetworks();
    if (items.length === 0) {
      this.tree.innerHTML = '<div class="tree-empty"><i class="fas fa-wifi-slash"></i><p>No networks found</p></div>';
      return;
    }

    this.tree.innerHTML = items.map((network) => `
      <div class="tree-item">
        <i class="fas fa-broadcast-tower"></i>
        <div class="tree-item-body">
          <span class="tree-item-title">${network.ssid}</span>
          <span class="tree-item-subtitle">${network.security} • Signal ${network.signal}%</span>
        </div>
      </div>
    `).join('');
  }
}
