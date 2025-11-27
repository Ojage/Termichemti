const LEVEL_ICONS = {
  info: 'fa-info-circle',
  success: 'fa-check-circle',
  warning: 'fa-exclamation-triangle',
  error: 'fa-times-circle',
  debug: 'fa-bug'
};

export class Logger {
  constructor(container, toggleIcon) {
    this.container = container;
    this.toggleIcon = toggleIcon;
    this.panel = container?.closest('.log-panel-container') || null;

    const header = this.panel?.querySelector('#log-panel-header');
    if (header && this.panel) {
      header.addEventListener('click', () => {
        this.panel.classList.toggle('expanded');
        this.toggleIcon?.classList.toggle('open');
      });
    }
  }

  log(message, level = 'info') {
    if (!this.container) return;

    const row = document.createElement('div');
    row.className = `log-entry ${level}`;
    const timestamp = new Date().toLocaleTimeString();
    row.innerHTML = `
      <span class="log-timestamp">${timestamp}</span>
      <i class="fas ${LEVEL_ICONS[level] || LEVEL_ICONS.info}"></i>
      <span class="log-message">${message}</span>
    `;
    this.container.appendChild(row);
    this.container.scrollTop = this.container.scrollHeight;
  }

  info(msg) { this.log(msg, 'info'); }
  success(msg) { this.log(msg, 'success'); }
  warn(msg) { this.log(msg, 'warning'); }
  error(msg) { this.log(msg, 'error'); }
  debug(msg) { this.log(msg, 'debug'); }
}
