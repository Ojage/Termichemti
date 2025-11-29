export class TabManager {
  constructor(tabsContainer, contentContainer, qrService, logger) {
    this.tabsContainer = tabsContainer;
    this.contentContainer = contentContainer;
    this.qrService = qrService;
    this.logger = logger;
    this.tabs = new Map();
    this.activeName = null;

    this.tabsContainer?.addEventListener('click', (event) => this.handleTabClick(event));
  }

  open(network) {
    const existing = this.tabs.get(network.name);
    if (existing) {
      this.activate(network.name);
      return;
    }

    const tab = document.createElement('div');
    tab.className = 'editor-tab active';
    tab.dataset.name = network.name;
    tab.innerHTML = `
      <span class="tab-title"><i class="fas fa-wifi"></i> ${network.name}</span>
      <button class="editor-tab-close" aria-label="Close tab">×</button>
    `;

    this.deactivateAllTabs();
    this.tabsContainer?.appendChild(tab);

    const content = this.buildContent(network);
    this.replaceContent(content);

    this.tabs.set(network.name, { tab, content });
    this.activeName = network.name;
    this.logger?.info(`Opened network ${network.name}`);
  }

  deactivateAllTabs() {
    this.tabs.forEach(({ tab, content }) => {
      tab.classList.remove('active');
      content.classList.remove('active');
    });
  }

  activate(name) {
    const entry = this.tabs.get(name);
    if (!entry) return;
    this.deactivateAllTabs();
    entry.tab.classList.add('active');
    entry.content.classList.add('active');
    this.replaceContent(entry.content);
    this.activeName = name;
  }

  close(name) {
    const entry = this.tabs.get(name);
    if (!entry) return;
    entry.tab.remove();
    entry.content.remove();
    this.tabs.delete(name);

    const last = Array.from(this.tabs.keys()).pop();
    this.activeName = last || null;
    if (last) {
      this.activate(last);
    } else {
      this.showEmptyState();
    }
  }

  revealPassword(name) {
    const entry = this.tabs.get(name);
    if (!entry) return;
    const secret = entry.content.querySelector('[data-secret]');
    if (!secret) return;
    secret.classList.add('revealed');
    this.activate(name);
  }

  copyPasswordByName(name) {
    const entry = this.tabs.get(name);
    if (!entry) return;
    const secret = entry.content.querySelector('[data-secret]');
    if (!secret) return;
    navigator.clipboard.writeText(secret.textContent || '')
      .then(() => this.logger?.success('Password copied'))
      .catch(() => this.logger?.error('Failed to copy password'));
  }

  restoreActive() {
    if (this.activeName && this.tabs.has(this.activeName)) {
      this.activate(this.activeName);
    } else if (this.tabs.size > 0) {
      const last = Array.from(this.tabs.keys()).pop();
      this.activate(last);
    } else {
      this.showEmptyState();
    }
  }

  handleTabClick(event) {
    const tabEl = event.target.closest('.editor-tab');
    if (!tabEl) return;
    const name = tabEl.dataset.name;

    if (event.target.classList.contains('editor-tab-close')) {
      this.close(name);
    } else {
      this.activate(name);
    }
  }

  buildContent(network) {
    const container = document.createElement('div');
    container.className = 'editor-pane active';
    container.dataset.name = network.name;

    const passwordContent = network.password ? `<span class="secret" data-secret>${network.password}</span>` : '<span class="muted">No password stored</span>';
    const qrMarkup = network.password
      ? `<img src="${this.qrService.getImageUrl({ ssid: network.name, password: network.password, security: 'WPA' })}" alt="QR code for ${network.name}" />`
      : '<div class="qr-placeholder">Password required to build QR code</div>';

    container.innerHTML = `
      <div class="network-summary">
        <div>
          <p class="label">Network</p>
          <h2>${network.name}</h2>
        </div>
        <div class="summary-actions">
          <button class="ghost-btn" data-action="copy" ${network.password ? '' : 'disabled'}><i class="fas fa-copy"></i> Copy password</button>
          <button class="ghost-btn" data-action="toggle" ${network.password ? '' : 'disabled'}><i class="fas fa-eye"></i> Toggle visibility</button>
        </div>
      </div>
      <div class="two-column">
        <div class="card">
          <div class="card-header"><i class="fas fa-key"></i> Credentials</div>
          <div class="card-body">
            ${passwordContent}
          </div>
        </div>
        <div class="card">
          <div class="card-header"><i class="fas fa-qrcode"></i> QR code</div>
          <div class="card-body qr-body">
            ${qrMarkup}
            <p class="qr-caption">Scan to connect from mobile devices</p>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><i class="fas fa-file-alt"></i> Full profile data</div>
        <pre class="card-body raw-details">${network.fullDetails}</pre>
      </div>
    `;

    container.addEventListener('click', (event) => {
      if (!(event.target instanceof HTMLElement)) return;
      if (event.target.dataset.action === 'copy') {
        this.copyPassword(container);
      }
      if (event.target.dataset.action === 'toggle') {
        this.togglePassword(container);
      }
    });

    return container;
  }

  copyPassword(container) {
    const secret = container.querySelector('[data-secret]');
    if (!secret) return;
    navigator.clipboard.writeText(secret.textContent || '')
      .then(() => this.logger?.success('Password copied'))
      .catch(() => this.logger?.error('Failed to copy password'));
  }

  togglePassword(container) {
    const secret = container.querySelector('[data-secret]');
    if (!secret) return;
    secret.classList.toggle('revealed');
  }

  replaceContent(content) {
    if (!this.contentContainer) return;
    this.contentContainer.innerHTML = '';
    this.contentContainer.appendChild(content);
  }

  showEmptyState() {
    if (!this.contentContainer) return;
    this.contentContainer.innerHTML = `
      <div class="editor-empty-state">
        <i class="fas fa-folder-open"></i>
        <h2>No Network Selected</h2>
        <p>Select a network from the explorer to view details</p>
      </div>
    `;
  }
}
