export class ActivityBarController {
  constructor(buttons, views, logger) {
    this.buttons = buttons;
    this.views = views;
    this.logger = logger;
    this.onChange = null;
    this.buttons.forEach((btn) => btn.addEventListener('click', () => this.activate(btn.dataset.view)));
  }

  activate(view) {
    this.buttons.forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
    this.views.forEach((panel) => panel.classList.toggle('active', panel.id === this.viewIdFor(view)));
    this.logger?.info(`Switched to ${view} view`);
    if (this.onChange) {
      this.onChange(view);
    }
  }

  setOnChange(callback) {
    this.onChange = callback;
  }

  viewIdFor(view) {
    return {
      explorer: 'explorer-view',
      available: 'available-view',
      diagnostics: 'diagnostics-view'
    }[view];
  }
}
