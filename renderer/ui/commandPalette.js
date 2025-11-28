export class CommandPalette {
  constructor({ savedNetworks, availableNetworks, tabManager, wifiService, openSettings, logger }) {
    this.savedNetworks = savedNetworks;
    this.availableNetworks = availableNetworks;
    this.tabManager = tabManager;
    this.wifiService = wifiService;
    this.openSettings = openSettings;
    this.logger = logger;

    this.commands = [];
    this.filtered = [];
    this.activeIndex = 0;

    this.buildUi();
    this.registerGlobalShortcut();
  }

  buildUi() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'command-palette';
    this.overlay.innerHTML = `
      <div class="command-dialog">
        <div class="command-input-row">
          <i class="fas fa-terminal"></i>
          <input type="text" class="command-input" placeholder="Type a command..." aria-label="Command Palette" />
          <span class="command-hint">Esc to close</span>
        </div>
        <div class="command-list" role="listbox"></div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.input = this.overlay.querySelector('.command-input');
    this.list = this.overlay.querySelector('.command-list');

    this.overlay.addEventListener('click', (event) => {
      if (event.target === this.overlay) {
        this.close();
      }
    });

    this.input.addEventListener('input', () => this.filter(this.input.value));
    this.input.addEventListener('keydown', (event) => this.handleInputKey(event));
    this.list.addEventListener('click', (event) => this.handleClick(event));
  }

  registerGlobalShortcut() {
    document.addEventListener('keydown', (event) => {
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      if (isShortcut) {
        event.preventDefault();
        this.open();
      }
      if (event.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });
  }

  isOpen() {
    return this.overlay.classList.contains('open');
  }

  open() {
    this.commands = this.buildCommands();
    this.filtered = [...this.commands];
    this.activeIndex = 0;
    this.render();
    this.overlay.classList.add('open');
    this.input.value = '';
    this.input.focus();
  }

  close() {
    this.overlay.classList.remove('open');
    this.input.blur();
  }

  buildCommands() {
    const commands = [
      {
        id: 'scan-networks',
        title: 'Scan networks',
        subtitle: 'Discover nearby Wi-Fi networks',
        icon: 'fas fa-broadcast-tower',
        action: () => this.availableNetworks?.scan()
      },
      {
        id: 'refresh-saved',
        title: 'Refresh saved networks',
        subtitle: 'Reload stored Wi-Fi profiles and passwords',
        icon: 'fas fa-rotate',
        action: () => this.savedNetworks?.load()
      },
      {
        id: 'open-settings',
        title: 'Open settings',
        subtitle: 'Adjust theme and preferences',
        icon: 'fas fa-sliders-h',
        action: () => this.openSettings?.()
      }
    ];

    (this.savedNetworks?.networks || []).forEach((network) => {
      commands.push({
        id: `open-${network.name}`,
        title: `Open ${network.name}`,
        subtitle: 'View saved network details',
        icon: 'fas fa-wifi',
        action: () => this.tabManager?.open(network)
      });

      if (network.password) {
        commands.push({
          id: `reveal-${network.name}`,
          title: `Reveal password for ${network.name}`,
          subtitle: 'Show stored credentials',
          icon: 'fas fa-eye',
          action: () => {
            this.tabManager?.open(network);
            this.tabManager?.revealPassword(network.name);
          }
        });

        commands.push({
          id: `copy-${network.name}`,
          title: `Copy password for ${network.name}`,
          subtitle: 'Copy to clipboard',
          icon: 'fas fa-copy',
          action: () => {
            this.tabManager?.open(network);
            this.tabManager?.copyPassword(network.name);
          }
        });
      }
    });

    (this.availableNetworks?.networks || []).forEach((network) => {
      commands.push({
        id: `connect-${network.ssid}`,
        title: `Connect to ${network.ssid}`,
        subtitle: `${network.security} • Signal ${network.signal}%`,
        icon: 'fas fa-plug',
        action: () => this.connectToNetwork(network)
      });
    });

    return commands;
  }

  filter(query) {
    const term = query.toLowerCase().trim();
    this.filtered = this.commands.filter((command) => {
      if (!term) return true;
      return (
        command.title.toLowerCase().includes(term) ||
        (command.subtitle && command.subtitle.toLowerCase().includes(term))
      );
    });
    this.activeIndex = 0;
    this.render();
  }

  render() {
    if (!this.list) return;
    if (this.filtered.length === 0) {
      this.list.innerHTML = '<div class="command-empty">No matching commands</div>';
      return;
    }

    this.list.innerHTML = this.filtered
      .map((command, index) => `
        <div class="command-item ${index === this.activeIndex ? 'active' : ''}" data-index="${index}" role="option">
          <div class="command-title">
            <i class="${command.icon || 'fas fa-terminal'}"></i>
            <span>${command.title}</span>
          </div>
          <div class="command-subtitle">${command.subtitle || ''}</div>
        </div>
      `)
      .join('');
  }

  handleInputKey(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex = (this.activeIndex + 1) % Math.max(this.filtered.length, 1);
      this.render();
      this.scrollActiveIntoView();
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex = (this.activeIndex - 1 + this.filtered.length) % Math.max(this.filtered.length, 1);
      this.render();
      this.scrollActiveIntoView();
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.runActiveCommand();
    }
  }

  handleClick(event) {
    const item = event.target.closest('.command-item');
    if (!item) return;
    const index = Number(item.dataset.index);
    this.activeIndex = index;
    this.runActiveCommand();
  }

  scrollActiveIntoView() {
    const active = this.list.querySelector('.command-item.active');
    if (active) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  runActiveCommand() {
    const command = this.filtered[this.activeIndex];
    if (!command) return;
    this.close();
    Promise.resolve(command.action?.()).catch((error) => {
      this.logger?.error(error?.message || 'Command failed');
    });
  }

  async connectToNetwork(network) {
    try {
      const requiresPassword = !/open/i.test(network.security || '');
      let password = '';
      if (requiresPassword) {
        password = window.prompt(`Enter password for ${network.ssid}`) || '';
        if (!password) {
          this.logger?.warn('Password required to connect');
          return;
        }
      }
      const result = await this.wifiService?.connectToNetwork({
        ssid: network.ssid,
        password,
        saveProfile: true,
        autoConnect: true
      });
      if (result?.success) {
        this.logger?.success(result.message || `Connected to ${network.ssid}`);
      } else {
        this.logger?.error(result?.message || 'Connection failed');
      }
    } catch (error) {
      this.logger?.error(error?.message || 'Unable to connect');
    }
  }
}
