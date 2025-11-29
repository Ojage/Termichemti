export class DiagnosticsService {
  constructor(logger) {
    this.logger = logger;
  }

  async ping(host) {
    const target = host?.trim();
    if (!target) {
      throw new Error('Please provide a host to ping');
    }
    this.logger?.info(`Running ping for ${target}`);
    return window.api.runPing(target);
  }

  async dnsLookup(host) {
    const target = host?.trim();
    if (!target) {
      throw new Error('Please provide a host for DNS lookup');
    }
    this.logger?.info(`Running DNS lookup for ${target}`);
    return window.api.runDnsLookup(target);
  }

  async ipConfig() {
    this.logger?.info('Fetching IP configuration');
    return window.api.getIpConfig();
  }

  async speedTest() {
    this.logger?.info('Running speed test');
    return window.api.runSpeedTest();
  }

  async latencyAnalyzer(host) {
    const target = host?.trim() || '8.8.8.8';
    this.logger?.info(`Running latency analyzer for ${target}`);
    return window.api.runLatencyAnalyzer(target);
  }

  async speedEstimator() {
    this.logger?.info('Running lightweight speed estimator');
    return window.api.runSpeedEstimator();
  }

  async channelScan() {
    this.logger?.info('Scanning Wi-Fi channel congestion');
    return window.api.runChannelScan();
  }

  async bandDetection() {
    this.logger?.info('Detecting active Wi-Fi band');
    return window.api.runBandDetection();
  }

  async signalStability() {
    this.logger?.info('Measuring signal stability');
    return window.api.runSignalStability();
  }

  async captivePortalCheck() {
    this.logger?.info('Checking for captive portal');
    return window.api.runCaptivePortalCheck();
  }

  async dnsBenchmark(host) {
    const target = host?.trim() || 'example.com';
    this.logger?.info(`Benchmarking DNS for ${target}`);
    return window.api.runDnsBenchmark(target);
  }

  async ipHealthCheck() {
    this.logger?.info('Running IP configuration health check');
    return window.api.runIpHealthCheck();
  }

  async routerInfo() {
    this.logger?.info('Collecting router information');
    return window.api.runRouterInfo();
  }

  async miniTraceroute(host) {
    const target = host?.trim() || '8.8.8.8';
    this.logger?.info(`Tracing route to ${target}`);
    return window.api.runMiniTraceroute(target);
  }

  async mtuTest(host) {
    const target = host?.trim() || '8.8.8.8';
    this.logger?.info(`Testing MTU towards ${target}`);
    return window.api.runMtuTest(target);
  }

  async localScan() {
    this.logger?.info('Scanning local network');
    return window.api.runLocalScan();
  }

  async portCheck(host) {
    const target = host?.trim() || '8.8.8.8';
    this.logger?.info(`Checking essential ports to ${target}`);
    return window.api.runPortCheck(target);
  }

  async wifiProfileCheck() {
    this.logger?.info('Validating Wi-Fi profiles');
    return window.api.runWifiProfileCheck();
  }

  async smartSummary() {
    this.logger?.info('Building smart diagnosis summary');
    return window.api.runSmartSummary();
  }
}
