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
}
