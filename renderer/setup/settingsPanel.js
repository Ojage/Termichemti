export function setupSettingsPanel() {
  const settingsBtn = document.getElementById('settings-btn');
  const activityBtn = document.getElementById('settings-activity-btn');
  const panel = document.getElementById('settings-panel');
  const closeBtn = document.getElementById('close-settings');

  const open = () => panel?.classList.add('open');
  const close = () => panel?.classList.remove('open');

  settingsBtn?.addEventListener('click', open);
  activityBtn?.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);

  return { open, close };
}
