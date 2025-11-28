import { Logger } from './renderer/logger.js';
import { ThemeManager } from './renderer/themeManager.js';
import { WifiService } from './renderer/services/wifiService.js';
import { QrCodeService } from './renderer/services/qrCodeService.js';
import { TabManager } from './renderer/ui/tabManager.js';
import { SavedNetworksController } from './renderer/controllers/savedNetworksController.js';
import { AvailableNetworksController } from './renderer/controllers/availableNetworksController.js';
import { ActivityBarController } from './renderer/controllers/activityBarController.js';
import { setupConnectionIndicator } from './renderer/setup/connectionIndicator.js';
import { setupSettingsPanel } from './renderer/setup/settingsPanel.js';
import { CommandPalette } from './renderer/ui/commandPalette.js';

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
    qrService: new QrCodeService(logger)
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

function buildSavedNetworksController(wifiService, tabs, logger) {
  return new SavedNetworksController({
    tree: document.getElementById('explorer-tree'),
    searchInput: document.getElementById('explorer-search'),
    refreshButton: document.getElementById('refresh-saved-networks'),
    status: document.getElementById('header-subtitle'),
    wifiService,
    tabs,
    logger
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

document.addEventListener('DOMContentLoaded', async () => {
  const logger = new Logger(
    document.getElementById('log-content'),
    document.getElementById('log-toggle-icon')
  );

  const themeManager = new ThemeManager(document.getElementById('theme-select'), logger);
  await themeManager.init();

  const settingsPanel = setupSettingsPanel();

  const { wifiService, qrService } = buildServices(logger);
  const tabManager = buildTabManager(qrService, logger);
  const savedNetworks = buildSavedNetworksController(wifiService, tabManager, logger);
  const availableNetworks = buildAvailableNetworksController(wifiService, logger);

  const activityBar = buildActivityBar([
    document.getElementById('explorer-view'),
    document.getElementById('available-view'),
    document.getElementById('diagnostics-view')
  ], logger);
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
