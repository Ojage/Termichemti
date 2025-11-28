const TOAST_ICONS = {
  info: 'fa-info-circle',
  success: 'fa-check-circle',
  error: 'fa-times-circle',
  warning: 'fa-exclamation-triangle'
};

export class ToastManager {
  constructor(container) {
    this.container = container;
  }

  show(message, type = 'info', { duration = 4000, spinner = false } = {}) {
    if (!this.container) return null;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-icon">${spinner ? '<i class="fas fa-spinner fa-spin"></i>' : `<i class="fas ${TOAST_ICONS[type] || TOAST_ICONS.info}"></i>`}</div>
      <div class="toast-message">${message}</div>
      <button class="toast-close" aria-label="Dismiss notification">×</button>
    `;

    const close = () => {
      toast.classList.add('toast-hide');
      setTimeout(() => toast.remove(), 200);
    };

    toast.querySelector('.toast-close')?.addEventListener('click', close);

    if (duration > 0 && !spinner) {
      setTimeout(close, duration);
    }

    this.container.appendChild(toast);

    return {
      update: (newMessage, newType = type, options = {}) => {
        const { keepSpinner = false } = options;
        const icon = keepSpinner
          ? '<i class="fas fa-spinner fa-spin"></i>'
          : `<i class="fas ${TOAST_ICONS[newType] || TOAST_ICONS.info}"></i>`;
        toast.className = `toast toast-${newType}`;
        toast.querySelector('.toast-icon').innerHTML = icon;
        toast.querySelector('.toast-message').textContent = newMessage;
        if (!keepSpinner && options.duration !== 0) {
          setTimeout(close, options.duration || duration);
        }
      },
      dismiss: close
    };
  }
}
