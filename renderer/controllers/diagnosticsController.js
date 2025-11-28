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
    this.results = {};

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
        key: 'latency',
        title: 'Latency / Jitter Analyzer',
        icon: 'fa-wave-square',
        description: 'Run multiple pings to calculate average latency, jitter, and packet loss.',
        placeholder: 'Hostname or IP (default 8.8.8.8)',
        action: (host, output, button) => this.runLatencyAnalyzer(host, output, button)
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
        key: 'dns-benchmark',
        title: 'DNS Benchmark',
        icon: 'fa-bolt',
        description: 'Compare multiple DNS providers and recommend the fastest.',
        placeholder: 'Hostname (default example.com)',
        action: (host, output, button) => this.runDnsBenchmark(host, output, button)
      },
      {
        key: 'ipconfig',
        title: 'IP Configuration',
        icon: 'fa-laptop-code',
        description: 'Inspect your current IP configuration and adapters.',
        action: (_host, output, button) => this.runIpConfig(output, button)
      },
      {
        key: 'ip-health',
        title: 'IP Health Check',
        icon: 'fa-stethoscope',
        description: 'Detect common IP configuration issues like duplicate gateways.',
        action: (_host, output, button) => this.runIpHealthCheck(output, button)
      },
      {
        key: 'speedtest',
        title: 'Speed Test',
        icon: 'fa-tachometer-alt',
        description: 'Measure download speed and latency with a quick test.',
        action: (_host, output, button) => this.runSpeedTest(output, button)
      },
      {
        key: 'speed-estimate',
        title: 'Speed Estimator',
        icon: 'fa-gauge-high',
        description: 'Lightweight multi-threaded burst to approximate bandwidth.',
        action: (_host, output, button) => this.runSpeedEstimator(output, button)
      },
      {
        key: 'channel',
        title: 'Channel Congestion',
        icon: 'fa-signal',
        description: 'See how many APs compete on each common channel.',
        action: (_host, output, button) => this.runChannelScan(output, button)
      },
      {
        key: 'band-detect',
        title: 'Frequency Band',
        icon: 'fa-wifi',
        description: 'Detect whether you are on 2.4, 5, or 6 GHz and show pros/cons.',
        action: (_host, output, button) => this.runBandDetection(output, button)
      },
      {
        key: 'signal',
        title: 'Signal Stability',
        icon: 'fa-chart-area',
        description: 'Graph 10 samples of Wi-Fi signal to catch fluctuations.',
        action: (_host, output, button) => this.runSignalStability(output, button)
      },
      {
        key: 'captive',
        title: 'Captive Portal Check',
        icon: 'fa-unlock-alt',
        description: 'Detect hotel/airport login redirects on HTTP/HTTPS.',
        action: (_host, output, button) => this.runCaptivePortalCheck(output, button)
      },
      {
        key: 'router',
        title: 'Router Details',
        icon: 'fa-route',
        description: 'Surface BSSID, link speed, and PHY hints from system tools.',
        action: (_host, output, button) => this.runRouterInfo(output, button)
      },
      {
        key: 'traceroute',
        title: 'Mini Traceroute',
        icon: 'fa-shoe-prints',
        description: 'Five-hop trace to spot where latency spikes first appear.',
        placeholder: 'Hostname or IP (default 8.8.8.8)',
        action: (host, output, button) => this.runTraceroute(host, output, button)
      },
      {
        key: 'mtu',
        title: 'MTU Test',
        icon: 'fa-arrows-alt-v',
        description: 'Check fragmentation threshold to detect VPN/PPPoE MTU issues.',
        placeholder: 'Hostname or IP (default 8.8.8.8)',
        action: (host, output, button) => this.runMtuTest(host, output, button)
      },
      {
        key: 'local-scan',
        title: 'Local Network Scan',
        icon: 'fa-network-wired',
        description: 'List peers discovered in the ARP table.',
        action: (_host, output, button) => this.runLocalScan(output, button)
      },
      {
        key: 'port-check',
        title: 'Port Reachability',
        icon: 'fa-plug',
        description: 'Test DNS/HTTP/HTTPS/SSH/8080 reachability.',
        placeholder: 'Remote host (default 8.8.8.8)',
        action: (host, output, button) => this.runPortCheck(host, output, button)
      },
      {
        key: 'profile',
        title: 'Wi-Fi Profile Integrity',
        icon: 'fa-id-card-alt',
        description: 'Check for duplicate/malformed Wi-Fi profiles.',
        action: (_host, output, button) => this.runWifiProfileCheck(output, button)
      },
      {
        key: 'smart',
        title: 'Smart Diagnosis Summary',
        icon: 'fa-brain',
        description: 'Human-readable summary that mixes all latest results.',
        action: (_host, output, button) => this.runSmartSummary(output, button)
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

  renderCondition(value, thresholds) {
    if (value === null || value === undefined || Number.isNaN(value)) return 'gray';
    if (value <= thresholds.good) return 'green';
    if (value <= thresholds.warn) return 'yellow';
    return 'red';
  }

  renderList(items) {
    const list = document.createElement('ul');
    list.className = 'diagnostic-list';
    items.forEach((item) => {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${item.label}:</strong> ${item.value}`;
      if (item.badge) {
        const badge = document.createElement('span');
        badge.className = `badge badge-${item.badge}`;
        badge.textContent = item.badge.toUpperCase();
        li.appendChild(badge);
      }
      list.appendChild(li);
    });
    return list;
  }

  updateResult(key, payload) {
    this.results[key] = payload;
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

  async runLatencyAnalyzer(host, output, button) {
    if (!output || !button) return;
    const originalText = button.textContent;
    button.dataset.originalText = originalText;
    this.setRunning(button, true);
    output.textContent = 'Measuring latency...';
    try {
      const result = await this.diagnosticsService.latencyAnalyzer(host);
      this.updateResult('latency', result);
      const { avgLatency, maxLatency, jitter, packetLoss } = result.stats || {};
      const condition = this.renderCondition(packetLoss, { good: 1, warn: 5 });
      const list = this.renderList([
        { label: 'Avg latency', value: avgLatency ? `${avgLatency.toFixed(2)} ms` : 'n/a', badge: this.renderCondition(avgLatency || 0, { good: 40, warn: 80 }) },
        { label: 'Max latency', value: maxLatency ? `${maxLatency.toFixed(2)} ms` : 'n/a' },
        { label: 'Jitter', value: jitter ? `${jitter.toFixed(2)} ms` : 'n/a', badge: this.renderCondition(jitter || 0, { good: 10, warn: 25 }) },
        { label: 'Packet loss', value: `${packetLoss?.toFixed ? packetLoss.toFixed(1) : packetLoss || 0}%`, badge: condition }
      ]);
      output.innerHTML = '';
      output.appendChild(list);
    } catch (error) {
      output.textContent = error.message || 'Failed to analyze latency';
      this.logger?.error(`Latency analyzer failed: ${error.message || error}`);
    } finally {
      this.setRunning(button, false);
      button.textContent = originalText;
    }
  }

  async runSpeedEstimator(output, button) {
    if (!output || !button) return;
    const originalText = button.textContent;
    button.dataset.originalText = originalText;
    this.setRunning(button, true);
    output.textContent = 'Probing speed...';
    try {
      const result = await this.diagnosticsService.speedEstimator();
      this.updateResult('speed-estimate', result);
      const items = [];
      if (result.averageMbps) {
        items.push({ label: 'Estimated download', value: `${result.averageMbps.toFixed(2)} Mbps`, badge: this.renderCondition(result.averageMbps, { good: 50, warn: 15 }) });
      }
      if (result.results) {
        result.results.forEach((r, idx) => items.push({ label: `Burst ${idx + 1}`, value: r.success ? `${r.mbps?.toFixed?.(2) || '0'} Mbps` : r.error || 'Failed' }));
      }
      output.innerHTML = '';
      output.appendChild(this.renderList(items));
    } catch (error) {
      output.textContent = error.message || 'Speed estimator failed';
      this.logger?.error(`Speed estimator failed: ${error.message || error}`);
    } finally {
      this.setRunning(button, false);
      button.textContent = originalText;
    }
  }

  async runChannelScan(output, button) {
    if (!output || !button) return;
    const originalText = button.textContent;
    button.dataset.originalText = originalText;
    this.setRunning(button, true);
    output.textContent = 'Scanning Wi-Fi environment...';
    try {
      const result = await this.diagnosticsService.channelScan();
      this.updateResult('channel', result);
      const { c1, c6, c11, band5, band6 } = result.counts || {};
      output.innerHTML = '';
      output.appendChild(
        this.renderList([
          { label: 'Channel 1', value: c1 ?? 0 },
          { label: 'Channel 6', value: c6 ?? 0 },
          { label: 'Channel 11', value: c11 ?? 0 },
          { label: '5 GHz APs', value: band5 ?? 0 },
          { label: '6 GHz APs', value: band6 ?? 0 }
        ])
      );
    } catch (error) {
      output.textContent = error.message || 'Channel scan failed';
      this.logger?.error(`Channel scan failed: ${error.message || error}`);
    } finally {
      this.setRunning(button, false);
      button.textContent = originalText;
    }
  }

  async runBandDetection(output, button) {
    if (!output || !button) return;
    const originalText = button.textContent;
    button.dataset.originalText = originalText;
    this.setRunning(button, true);
    output.textContent = 'Detecting active band...';
    try {
      const result = await this.diagnosticsService.bandDetection();
      this.updateResult('band-detect', result);
      const pros =
        result.band === '2.4 GHz'
          ? 'Best range, slower speeds.'
          : result.band === '5 GHz'
          ? 'Great speed at short range.'
          : result.band === '6 GHz'
          ? 'Fastest speeds, shortest range.'
          : 'Band could not be detected.';
      const items = [
        { label: 'Band', value: result.band || 'Unknown' },
        { label: 'Frequency', value: result.details?.frequency ? `${result.details.frequency} GHz` : 'n/a' },
        { label: 'Signal', value: result.details?.signal ? `${result.details.signal}%` : 'n/a' },
        { label: 'Link speed', value: result.details?.linkSpeed ? `${result.details.linkSpeed} Mbps` : 'n/a' },
        { label: 'Pros/Cons', value: pros }
      ];
      output.innerHTML = '';
      output.appendChild(this.renderList(items));
    } catch (error) {
      output.textContent = error.message || 'Band detection failed';
      this.logger?.error(`Band detection failed: ${error.message || error}`);
    } finally {
      this.setRunning(button, false);
      button.textContent = originalText;
    }
  }

  async runSignalStability(output, button) {
    if (!output || !button) return;
    const originalText = button.textContent;
    button.dataset.originalText = originalText;
    this.setRunning(button, true);
    output.textContent = 'Sampling signal strength...';
    try {
      const result = await this.diagnosticsService.signalStability();
      this.updateResult('signal', result);
      const list = document.createElement('ol');
      result.samples?.forEach((sample) => {
        const li = document.createElement('li');
        li.textContent = sample.signal !== null ? `${sample.signal}%` : 'n/a';
        list.appendChild(li);
      });
      output.innerHTML = '';
      output.appendChild(list);
    } catch (error) {
      output.textContent = error.message || 'Signal stability failed';
      this.logger?.error(`Signal stability failed: ${error.message || error}`);
    } finally {
      this.setRunning(button, false);
      button.textContent = originalText;
    }
  }

  async runCaptivePortalCheck(output, button) {
    if (!output || !button) return;
    const originalText = button.textContent;
    button.dataset.originalText = originalText;
    this.setRunning(button, true);
    output.textContent = 'Looking for captive portals...';
    try {
      const result = await this.diagnosticsService.captivePortalCheck();
      this.updateResult('captive', result);
      const captive = result.captivePortalDetected ? 'Detected potential captive portal' : 'No captive portal detected';
      output.innerHTML = '';
      output.appendChild(
        this.renderList([
          { label: 'HTTP status', value: result.httpResult?.status || result.httpResult?.error || 'n/a' },
          { label: 'HTTPS status', value: result.httpsResult?.status || result.httpsResult?.error || 'n/a' },
          { label: 'Result', value: captive, badge: result.captivePortalDetected ? 'red' : 'green' }
        ])
      );
    } catch (error) {
      output.textContent = error.message || 'Captive portal detection failed';
      this.logger?.error(`Captive portal detection failed: ${error.message || error}`);
    } finally {
      this.setRunning(button, false);
      button.textContent = originalText;
    }
  }

  async runDnsBenchmark(host, output, button) {
    if (!output || !button) return;
    const originalText = button.textContent;
    button.dataset.originalText = originalText;
    this.setRunning(button, true);
    output.textContent = 'Benchmarking DNS servers...';
    try {
      const result = await this.diagnosticsService.dnsBenchmark(host);
      this.updateResult('dns-benchmark', result);
      const list = document.createElement('ol');
      result.results?.forEach((r) => {
        const li = document.createElement('li');
        li.textContent = `${r.name} (${r.server}) - ${r.duration} ms ${r.success ? '' : '(error)'}`;
        list.appendChild(li);
      });
      if (result.fastest) {
        const fastest = document.createElement('p');
        fastest.textContent = `Fastest: ${result.fastest.name} (${result.fastest.duration} ms)`;
        output.innerHTML = '';
        output.appendChild(fastest);
        output.appendChild(list);
      } else {
        output.innerHTML = '';
        output.appendChild(list);
      }
    } catch (error) {
      output.textContent = error.message || 'DNS benchmark failed';
      this.logger?.error(`DNS benchmark failed: ${error.message || error}`);
    } finally {
      this.setRunning(button, false);
      button.textContent = originalText;
    }
  }

  async runIpHealthCheck(output, button) {
    if (!output || !button) return;
    const originalText = button.textContent;
    button.dataset.originalText = originalText;
    this.setRunning(button, true);
    output.textContent = 'Evaluating IP configuration...';
    try {
      const result = await this.diagnosticsService.ipHealthCheck();
      this.updateResult('ip-health', result);
      const warnings = result.warnings?.length ? result.warnings.join('; ') : 'Your IP configuration is healthy.';
      output.innerHTML = '';
      output.appendChild(this.renderList([{ label: 'Status', value: warnings, badge: result.warnings?.length ? 'yellow' : 'green' }]));
    } catch (error) {
      output.textContent = error.message || 'IP health check failed';
      this.logger?.error(`IP health check failed: ${error.message || error}`);
    } finally {
      this.setRunning(button, false);
      button.textContent = originalText;
    }
  }

  async runRouterInfo(output, button) {
    if (!output || !button) return;
    const originalText = button.textContent;
    button.dataset.originalText = originalText;
    this.setRunning(button, true);
    output.textContent = 'Gathering router info...';
    try {
      const result = await this.diagnosticsService.routerInfo();
      this.updateResult('router', result);
      output.innerHTML = '';
      output.appendChild(
        this.renderList([
          { label: 'BSSID', value: result.bssid || 'n/a' },
          { label: 'Link speed', value: result.rate ? `${result.rate} Mbps` : 'n/a' },
          { label: 'Signal', value: result.signal ? `${result.signal}%` : 'n/a' },
          { label: 'Frequency', value: result.frequency ? `${result.frequency} GHz` : 'n/a' }
        ])
      );
    } catch (error) {
      output.textContent = error.message || 'Router information failed';
      this.logger?.error(`Router info failed: ${error.message || error}`);
    } finally {
      this.setRunning(button, false);
      button.textContent = originalText;
    }
  }

  async runTraceroute(host, output, button) {
    if (!output || !button) return;
    const originalText = button.textContent;
    button.dataset.originalText = originalText;
    this.setRunning(button, true);
    output.textContent = 'Tracing route...';
    try {
      const result = await this.diagnosticsService.miniTraceroute(host);
      this.updateResult('traceroute', result);
      output.textContent = result.output || 'No output';
    } catch (error) {
      output.textContent = error.message || 'Traceroute failed';
      this.logger?.error(`Traceroute failed: ${error.message || error}`);
    } finally {
      this.setRunning(button, false);
      button.textContent = originalText;
    }
  }

  async runMtuTest(host, output, button) {
    if (!output || !button) return;
    const originalText = button.textContent;
    button.dataset.originalText = originalText;
    this.setRunning(button, true);
    output.textContent = 'Probing MTU...';
    try {
      const result = await this.diagnosticsService.mtuTest(host);
      this.updateResult('mtu', result);
      const text = result.success
        ? `MTU appears healthy (tested up to ${result.breakpoint} bytes)`
        : `MTU may be limited around ${result.breakpoint} bytes`;
      output.textContent = text;
    } catch (error) {
      output.textContent = error.message || 'MTU test failed';
      this.logger?.error(`MTU test failed: ${error.message || error}`);
    } finally {
      this.setRunning(button, false);
      button.textContent = originalText;
    }
  }

  async runLocalScan(output, button) {
    if (!output || !button) return;
    const originalText = button.textContent;
    button.dataset.originalText = originalText;
    this.setRunning(button, true);
    output.textContent = 'Scanning LAN...';
    try {
      const result = await this.diagnosticsService.localScan();
      this.updateResult('local-scan', result);
      output.innerHTML = '';
      output.appendChild(
        this.renderList([
          { label: 'Devices detected', value: result.devices ?? 0 },
          { label: 'Raw table', value: `<pre>${result.output}</pre>` }
        ])
      );
    } catch (error) {
      output.textContent = error.message || 'Local scan failed';
      this.logger?.error(`Local scan failed: ${error.message || error}`);
    } finally {
      this.setRunning(button, false);
      button.textContent = originalText;
    }
  }

  async runPortCheck(host, output, button) {
    if (!output || !button) return;
    const originalText = button.textContent;
    button.dataset.originalText = originalText;
    this.setRunning(button, true);
    output.textContent = 'Testing ports...';
    try {
      const result = await this.diagnosticsService.portCheck(host);
      this.updateResult('port-check', result);
      const list = document.createElement('ul');
      result.results?.forEach((r) => {
        const li = document.createElement('li');
        li.textContent = `${r.port}: ${r.reachable ? 'reachable' : 'blocked (' + (r.reason || 'error') + ')'}`;
        li.className = r.reachable ? 'text-success' : 'text-warning';
        list.appendChild(li);
      });
      output.innerHTML = '';
      output.appendChild(list);
    } catch (error) {
      output.textContent = error.message || 'Port check failed';
      this.logger?.error(`Port check failed: ${error.message || error}`);
    } finally {
      this.setRunning(button, false);
      button.textContent = originalText;
    }
  }

  async runWifiProfileCheck(output, button) {
    if (!output || !button) return;
    const originalText = button.textContent;
    button.dataset.originalText = originalText;
    this.setRunning(button, true);
    output.textContent = 'Validating profiles...';
    try {
      const result = await this.diagnosticsService.wifiProfileCheck();
      this.updateResult('profile', result);
      output.innerHTML = '';
      output.appendChild(
        this.renderList([
          { label: 'Duplicate profiles', value: result.duplicateProfiles ? 'Yes' : 'No', badge: result.duplicateProfiles ? 'yellow' : 'green' },
          { label: 'Raw output', value: `<pre>${result.output}</pre>` }
        ])
      );
    } catch (error) {
      output.textContent = error.message || 'Profile integrity check failed';
      this.logger?.error(`Profile integrity failed: ${error.message || error}`);
    } finally {
      this.setRunning(button, false);
      button.textContent = originalText;
    }
  }

  async runSmartSummary(output, button) {
    if (!output || !button) return;
    const originalText = button.textContent;
    button.dataset.originalText = originalText;
    this.setRunning(button, true);
    output.textContent = 'Building summary...';
    try {
      await this.diagnosticsService.smartSummary();
      const latency = this.results['latency']?.stats;
      const speed = this.results['speed-estimate'];
      const signal = this.results['signal'];
      const ipHealth = this.results['ip-health'];
      const summary = [];
      if (latency) {
        summary.push(`Latency avg ${latency.avgLatency?.toFixed?.(1) || 'n/a'} ms with ${latency.packetLoss?.toFixed?.(1) || 0}% loss.`);
      }
      if (speed?.averageMbps) {
        summary.push(`Lightweight speed suggests ~${speed.averageMbps.toFixed(1)} Mbps down.`);
      }
      if (signal?.samples?.length) {
        const min = Math.min(...signal.samples.map((s) => s.signal || 0));
        const max = Math.max(...signal.samples.map((s) => s.signal || 0));
        summary.push(`Signal varied between ${min}% and ${max}% across 10 seconds.`);
      }
      if (ipHealth && ipHealth.warnings) {
        summary.push(ipHealth.warnings.length ? `Warnings: ${ipHealth.warnings.join('; ')}` : 'IP configuration looks healthy.');
      }
      output.innerHTML = '';
      const text = summary.length
        ? summary.join(' ')
        : 'Run diagnostics first to populate the summary.';
      output.textContent = text;
    } catch (error) {
      output.textContent = error.message || 'Smart summary failed';
      this.logger?.error(`Smart summary failed: ${error.message || error}`);
    } finally {
      this.setRunning(button, false);
      button.textContent = originalText;
    }
  }
}
