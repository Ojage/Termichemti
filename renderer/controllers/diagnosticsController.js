export class DiagnosticsController {
  constructor({
    list,
    searchInput,
    content,
    tabsContainer,
    tabManager,
    diagnosticsService,
    logger
  }) {
    this.list = list;
    this.searchInput = searchInput;
    this.content = content;
    this.tabsContainer = tabsContainer;
    this.tabManager = tabManager;
    this.diagnosticsService = diagnosticsService;
    this.logger = logger;
    this.activeTool = null;
    this.isActive = false;

    this.tools = [
      {
        key: 'ping',
        title: 'Ping Test',
        icon: 'fa-network-wired',
        description: 'Send ICMP requests to check connectivity and latency.',
        placeholder: 'Hostname or IP (e.g. 8.8.8.8)',
        action: (host, output, button) => this.runPing(host, output, button)
      },
      {
        key: 'dns',
        title: 'DNS Lookup',
        icon: 'fa-globe',
        description: 'Resolve a hostname to verify DNS works as expected.',
        placeholder: 'Hostname (e.g. example.com)',
        action: (host, output, button) => this.runDnsLookup(host, output, button)
      },
      {
        key: 'ipconfig',
        title: 'IP Configuration',
        icon: 'fa-laptop-code',
        description: 'Inspect your current IP configuration and adapters.',
        action: (_host, output, button) => this.runIpConfig(output, button)
      },
      {
        key: 'speedtest',
        title: 'Speed Test',
        icon: 'fa-tachometer-alt',
        description: 'Measure download speed and latency with a quick test.',
        action: (_host, output, button) => this.runSpeedTest(output, button)
      }
    ];

    this.searchInput?.addEventListener('input', () => this.filterList());
    this.list?.addEventListener('click', (event) => this.handleSelection(event));
  }

  enter() {
    this.isActive = true;
    if (this.tabsContainer) {
      this.tabsContainer.style.display = 'none';
    }
    const tool = this.activeTool || this.tools[0].key;
    this.showTool(tool);
  }

  exit() {
    this.isActive = false;
    if (this.tabsContainer) {
      this.tabsContainer.style.display = '';
    }
    this.tabManager?.restoreActive();
  }

  filterList() {
    const term = (this.searchInput?.value || '').toLowerCase().trim();
    const items = Array.from(this.list?.querySelectorAll('.diagnostic-item') || []);
    items.forEach((item) => {
      const text = item.textContent?.toLowerCase() || '';
      const match = !term || text.includes(term);
      item.style.display = match ? '' : 'none';
    });
  }

  handleSelection(event) {
    const item = event.target.closest('.diagnostic-item');
    if (!item) return;
    const toolKey = item.dataset.diagnostic;
    this.showTool(toolKey);
  }

  clearActive() {
    this.list?.querySelectorAll('.diagnostic-item').forEach((item) => item.classList.remove('active'));
    this.activeTool = null;
  }

  showTool(key) {
    if (!this.isActive) return;
    const tool = this.tools.find((t) => t.key === key);
    if (!tool) return;

    this.activeTool = key;
    this.markActiveItem(key);

    if (this.content) {
      this.content.innerHTML = '';
      const view = this.buildToolView(tool);
      this.content.appendChild(view);
    }
  }

  markActiveItem(key) {
    this.list?.querySelectorAll('.diagnostic-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.diagnostic === key);
    });
  }

  buildToolView(tool) {
    const wrapper = document.createElement('div');
    wrapper.className = 'diagnostic-tool-view';

    const header = document.createElement('div');
    header.className = 'diagnostic-header';
    header.innerHTML = `
      <i class="fas ${tool.icon}"></i>
      <div>
        <h2>${tool.title}</h2>
        <p>${tool.description}</p>
      </div>
    `;

    const content = document.createElement('div');
    content.className = 'diagnostic-content';

    const output = document.createElement('div');
    output.className = 'diagnostic-output';
    output.textContent = 'Ready when you are.';

    const inputGroup = document.createElement('div');
    inputGroup.className = 'diagnostic-input-group';

    const inputNeeded = tool.key === 'ping' || tool.key === 'dns';
    let input = null;

    if (inputNeeded) {
      input = document.createElement('input');
      input.placeholder = tool.placeholder || '';
      inputGroup.appendChild(input);
    }

    const button = document.createElement('button');
    button.textContent = `Run ${tool.title}`;
    inputGroup.appendChild(button);

    button.addEventListener('click', () => {
      tool.action(input?.value || '', output, button);
    });

    if (input) {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          tool.action(input.value || '', output, button);
        }
      });
    }

    content.appendChild(inputGroup);
    content.appendChild(output);

    wrapper.appendChild(header);
    wrapper.appendChild(content);

    if (input) {
      input.focus();
    }

    return wrapper;
  }

  setRunning(button, isRunning) {
    if (!button) return;
    button.disabled = isRunning;
    button.textContent = isRunning ? 'Working...' : button.dataset.originalText || button.textContent;
  }

  async runPing(host, output, button) {
    if (!output || !button) return;
    const originalText = button.textContent;
    button.dataset.originalText = originalText;
    this.setRunning(button, true);
    output.textContent = 'Pinging...';

    try {
      const result = await this.diagnosticsService.ping(host);
      output.textContent = result.output || 'No output received';
      if (result.success) {
        this.logger?.success('Ping completed');
      } else {
        this.logger?.warn('Ping completed with issues');
      }
    } catch (error) {
      output.textContent = error.message || 'Failed to run ping';
      this.logger?.error(`Ping failed: ${error.message || error}`);
    } finally {
      this.setRunning(button, false);
      button.textContent = originalText;
    }
  }

  async runDnsLookup(host, output, button) {
    if (!output || !button) return;
    const originalText = button.textContent;
    button.dataset.originalText = originalText;
    this.setRunning(button, true);
    output.textContent = 'Resolving...';

    try {
      const result = await this.diagnosticsService.dnsLookup(host);
      output.textContent = result.output || 'No output received';
      if (result.success) {
        this.logger?.success('DNS lookup completed');
      } else {
        this.logger?.warn('DNS lookup returned an error');
      }
    } catch (error) {
      output.textContent = error.message || 'Failed to run DNS lookup';
      this.logger?.error(`DNS lookup failed: ${error.message || error}`);
    } finally {
      this.setRunning(button, false);
      button.textContent = originalText;
    }
  }

  async runIpConfig(output, button) {
    if (!output || !button) return;
    const originalText = button.textContent;
    button.dataset.originalText = originalText;
    this.setRunning(button, true);
    output.textContent = 'Collecting IP configuration...';

    try {
      const result = await this.diagnosticsService.ipConfig();
      output.textContent = result.output || 'No output received';
      if (result.success) {
        this.logger?.success('IP configuration fetched');
      } else {
        this.logger?.warn('IP configuration returned an error');
      }
    } catch (error) {
      output.textContent = error.message || 'Failed to get IP configuration';
      this.logger?.error(`IP configuration failed: ${error.message || error}`);
    } finally {
      this.setRunning(button, false);
      button.textContent = originalText;
    }
  }

  async runSpeedTest(output, button) {
    if (!output || !button) return;
    const originalText = button.textContent;
    button.dataset.originalText = originalText;
    this.setRunning(button, true);
    output.textContent = 'Running speed test...';

    try {
      const result = await this.diagnosticsService.speedTest();
      if (result.success && result.result) {
        const { downloadSpeed, latency } = result.result;
        const metrics = document.createElement('div');
        metrics.className = 'speedtest-results';

        const download = document.createElement('div');
        download.className = 'speed-result';
        download.innerHTML = '<span>Download</span><strong>' + downloadSpeed + ' Mbps</strong>';

        const latencyEl = document.createElement('div');
        latencyEl.className = 'speed-result';
        latencyEl.innerHTML = '<span>Latency</span><strong>' + latency + ' ms</strong>';

        metrics.appendChild(download);
        metrics.appendChild(latencyEl);

        output.innerHTML = '';
        output.appendChild(metrics);
        this.logger?.success('Speed test completed');
      } else {
        output.textContent = result.message || 'Speed test failed to return results';
        this.logger?.warn('Speed test returned an error');
      }
    } catch (error) {
      output.textContent = error.message || 'Failed to run speed test';
      this.logger?.error(`Speed test failed: ${error.message || error}`);
    } finally {
      this.setRunning(button, false);
      button.textContent = originalText;
    }
  }
}
