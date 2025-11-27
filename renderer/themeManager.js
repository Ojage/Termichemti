export class ThemeManager {
  constructor(selectEl, logger, themeStorage = window.localStorage) {
    this.selectEl = selectEl;
    this.logger = logger;
    this.storage = themeStorage;
    this.current = this.storage.getItem('theme-preference') || 'auto';
  }

  async init() {
    const system = await this.getSystemTheme();
    this.applyTheme(this.current === 'auto' ? system : this.current);
    if (this.selectEl) {
      this.selectEl.value = this.current;
      this.selectEl.addEventListener('change', (e) => this.setTheme(e.target.value));
    }

    window.api.onThemeChanged((theme) => {
      if (this.current === 'auto') {
        this.applyTheme(theme);
      }
    });
  }

  async getSystemTheme() {
    try {
      return await window.api.getSystemTheme();
    } catch (error) {
      this.logger?.warn('Unable to read system theme');
      return 'dark';
    }
  }

  setTheme(theme) {
    this.current = theme;
    this.storage.setItem('theme-preference', theme);
    this.applyTheme(theme);
    this.logger?.info(`Theme changed to ${theme}`);
  }

  applyTheme(theme) {
    const resolved = theme === 'auto' ? 'dark' : theme;
    document.body.setAttribute('data-theme', resolved);
  }
}
