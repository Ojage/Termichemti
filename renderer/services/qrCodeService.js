const DEFAULT_ENDPOINT = 'https://quickchart.io/qr';
const QR_IMAGE_CONFIG = { margin: '2', size: '240', ecLevel: 'M' };

export class QrCodeService {
  constructor(logger, endpoint = DEFAULT_ENDPOINT) {
    this.logger = logger;
    this.endpoint = endpoint;
  }

  buildPayload({ ssid, password, security }) {
    const escapedSsid = this.escapeField(ssid);
    const escapedPassword = password ? this.escapeField(password) : '';
    const sec = security && security.toUpperCase() !== 'OPEN' ? security : 'nopass';
    return `WIFI:T:${sec};S:${escapedSsid};${password ? `P:${escapedPassword};` : ''};`;
  }

  escapeField(value) {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/:/g, '\\:');
  }

  getImageUrl(config) {
    const payload = this.buildPayload(config);
    const url = new URL(this.endpoint);
    url.searchParams.set('text', payload);
    Object.entries(QR_IMAGE_CONFIG).forEach(([key, value]) => url.searchParams.set(key, value));
    this.logger?.debug('Generated QR payload');
    return url.toString();
  }
}
