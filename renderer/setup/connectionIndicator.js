export function setupConnectionIndicator(wifiService, logger) {
  const indicator = document.getElementById('connection-indicator');
  const text = document.getElementById('connection-status-text');
  if (!indicator || !text) return;

  const refresh = async () => {
    const status = await wifiService.fetchConnectionStatus();
    indicator.classList.toggle('connected', status.connected);
    text.textContent = status.connected ? `Connected to ${status.ssid}` : 'Not connected';
  };

  indicator.addEventListener('click', refresh);
  refresh().catch(() => logger?.warn('Unable to refresh connection indicator'));
}
