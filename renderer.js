import { Logger } from './renderer/logger.js';
import { ThemeManager } from './renderer/themeManager.js';
import { WifiService } from './renderer/services/wifiService.js';
import { QrCodeService } from './renderer/services/qrCodeService.js';
import { DiagnosticsService } from './renderer/services/diagnosticsService.js';
import { BluetoothService } from './renderer/services/bluetoothService.js';
import { TabManager } from './renderer/ui/tabManager.js';
import { SavedNetworksController } from './renderer/controllers/savedNetworksController.js';
import { AvailableNetworksController } from './renderer/controllers/availableNetworksController.js';
import { DiagnosticsController } from './renderer/controllers/diagnosticsController.js';
import { ActivityBarController } from './renderer/controllers/activityBarController.js';
import { setupConnectionIndicator } from './renderer/setup/connectionIndicator.js';
import { setupSettingsPanel } from './renderer/setup/settingsPanel.js';
import { CommandPalette } from './renderer/ui/commandPalette.js';
import { ToastManager } from './renderer/ui/toastManager.js';

function buildActivityBar(views, logger) {
  return new ActivityBarController(
    Array.from(document.querySelectorAll('.activity-bar-item[data-view]')),
    views,
    logger
  );
}

function buildServices(logger) {
  return {
    wifiService: new WifiService(logger),
    qrService: new QrCodeService(logger),
    diagnosticsService: new DiagnosticsService(logger),
    bluetoothService: new BluetoothService(logger)
  };
}

function buildTabManager(qrService, logger) {
  const tabs = new TabManager(
    document.querySelector('.editor-tabs'),
    document.getElementById('editor-content'),
    qrService,
    logger
  );
  tabs.showEmptyState();
  return tabs;
}

function buildSavedNetworksController(wifiService, bluetoothService, tabs, logger, toastManager, diagnostics) {
  return new SavedNetworksController({
    tree: document.getElementById('explorer-tree'),
    searchInput: document.getElementById('explorer-search'),
    refreshButton: document.getElementById('refresh-saved-networks'),
    status: document.getElementById('header-subtitle'),
    wifiService,
    bluetoothService,
    tabs,
    logger,
    toastManager,
    diagnostics
  });
}

function buildAvailableNetworksController(wifiService, logger) {
  return new AvailableNetworksController({
    tree: document.getElementById('available-tree'),
    searchInput: document.getElementById('available-search'),
    scanButton: document.getElementById('scan-networks-btn'),
    wifiService,
    logger
  });
}

function buildDiagnosticsController(diagnosticsService, tabManager, logger) {
  return new DiagnosticsController({
    list: document.getElementById('diagnostics-list'),
    searchInput: document.getElementById('diagnostics-search'),
    content: document.getElementById('editor-content'),
    tabsContainer: document.querySelector('.editor-tabs'),
    tabManager,
    diagnosticsService,
    logger
  });
}

function setupBluetoothApprovals(bluetoothService, logger, diagnostics, toastManager) {
  const modal = document.getElementById('bluetooth-modal');
  const overlay = document.getElementById('bluetooth-modal-overlay');
  const acceptBtn = document.getElementById('bluetooth-accept');
  const declineBtn = document.getElementById('bluetooth-decline');
  const closeBtn = document.getElementById('bluetooth-close');
  const ssidField = document.getElementById('bluetooth-ssid');
  const securityField = document.getElementById('bluetooth-security');
  const encryptionField = document.getElementById('bluetooth-encryption');
  let pendingOffer = null;

  const hideModal = () => {
    modal?.classList.remove('show');
    overlay?.classList.remove('show');
    pendingOffer = null;
  };

  const handleDecision = async (approved) => {
    if (!pendingOffer) return;
    acceptBtn.disabled = true;
    declineBtn.disabled = true;
    const toast = toastManager?.show(approved ? 'Accepting Bluetooth credentials...' : 'Rejecting Bluetooth credentials...', 'info', { spinner: true, duration: 0 });
    diagnostics?.recordBluetoothEvent?.({
      type: 'receive',
      ssid: pendingOffer.ssid,
      security: pendingOffer.security,
      encrypted: pendingOffer.encrypted,
      status: approved ? 'approved' : 'rejected'
    });
    try {
      await bluetoothService.respondToOffer(pendingOffer, approved);
      toast?.update(approved ? 'Bluetooth credentials accepted' : 'Bluetooth credentials rejected', approved ? 'success' : 'warning');
      logger?.info(`${approved ? 'Approved' : 'Rejected'} incoming Bluetooth credentials for ${pendingOffer.ssid}`);
    } catch (error) {
      toast?.update(`Bluetooth response failed: ${error.message || error}`, 'error');
      logger?.error(`Failed to respond to Bluetooth offer: ${error.message || error}`);
    } finally {
      acceptBtn.disabled = false;
      declineBtn.disabled = false;
      hideModal();
    }
  };

  acceptBtn?.addEventListener('click', () => handleDecision(true));
  declineBtn?.addEventListener('click', () => handleDecision(false));
  closeBtn?.addEventListener('click', hideModal);
  overlay?.addEventListener('click', (event) => {
    if (event.target === overlay) hideModal();
  });

  bluetoothService.startListening((offer) => {
    pendingOffer = offer;
    ssidField.textContent = offer.ssid || 'Unknown SSID';
    securityField.textContent = offer.security || 'Unknown';
    encryptionField.textContent = offer.encrypted ? 'Encrypted credentials' : 'Unencrypted payload';
    modal?.classList.add('show');
    overlay?.classList.add('show');
    logger?.info(`Incoming Bluetooth credentials for ${offer.ssid || 'unknown SSID'} (${offer.security || 'Unknown'}; encrypted=${offer.encrypted ? 'yes' : 'no'})`);
    diagnostics?.recordBluetoothEvent?.({
      type: 'receive',
      ssid: offer.ssid,
      security: offer.security,
      encrypted: offer.encrypted,
      status: 'pending'
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const logger = new Logger(
    document.getElementById('log-content'),
    document.getElementById('log-toggle-icon')
  );

  const toastManager = new ToastManager(document.getElementById('toast-container'));

  const themeManager = new ThemeManager(document.getElementById('theme-select'), logger);
  await themeManager.init();

  const settingsPanel = setupSettingsPanel();

  const { wifiService, qrService, diagnosticsService, bluetoothService } = buildServices(logger);
  const tabManager = buildTabManager(qrService, logger);
  const diagnostics = buildDiagnosticsController(diagnosticsService, tabManager, logger);
  const savedNetworks = buildSavedNetworksController(wifiService, bluetoothService, tabManager, logger, toastManager, diagnostics);
  const availableNetworks = buildAvailableNetworksController(wifiService, logger);

  setupBluetoothApprovals(bluetoothService, logger, diagnostics, toastManager);

  const activityBar = buildActivityBar([
    document.getElementById('explorer-view'),
    document.getElementById('available-view'),
    document.getElementById('diagnostics-view')
  ], logger);
  activityBar.setOnChange((view) => {
    if (view === 'diagnostics') {
      diagnostics.enter();
    } else {
      diagnostics.exit();
    }
  });
  activityBar.activate('explorer');

  setupConnectionIndicator(wifiService, logger);

  new CommandPalette({
    savedNetworks,
    availableNetworks,
    tabManager,
    wifiService,
    openSettings: settingsPanel?.open,
    logger
  });

  await savedNetworks.load();
  await availableNetworks.scan();
});
