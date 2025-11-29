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

function buildSavedNetworksController(wifiService, bluetoothService, tabs, logger, toastManager, diagnostics, bluetoothShareUi) {
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
    diagnostics,
    bluetoothShareUi
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

function setupDecryptedProfileHandler(wifiService, savedNetworks, availableNetworks, logger) {
  window.handleDecryptedWifiPayload = async (payload) => {
    if (!payload?.ssid) {
      logger?.error('Missing SSID in decrypted payload');
      return;
    }

    const origin = payload.origin || 'bluetooth';
    const confirmed = window.confirm(`Apply network profile for ${payload.ssid} from ${origin}?`);
    if (!confirmed) {
      logger?.info('Profile application cancelled by user');
      return;
    }

    try {
      logger?.info(`Applying profile for ${payload.ssid} (${origin})...`);
      const result = await wifiService.applyNetworkProfile({ ...payload, origin });
      if (result?.success) {
        logger?.success(result.message || `Profile applied for ${payload.ssid}`);
        await savedNetworks?.load();
        await availableNetworks?.scan();
      } else {
        logger?.error(result?.message || 'Failed to apply network profile');
      }
    } catch (error) {
      logger?.error(error?.message || 'Failed to apply network profile');
    }
  };
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

function setupBluetoothShareFlow(bluetoothService, toastManager, logger, diagnostics) {
  const enableOverlay = document.getElementById('bluetooth-enable-overlay');
  const enableConfirm = document.getElementById('bluetooth-enable-confirm');
  const enableCancel = document.getElementById('bluetooth-enable-cancel');
  const enableClose = document.getElementById('bluetooth-enable-close');
  const sendOverlay = document.getElementById('bluetooth-send-overlay');
  const peerList = document.getElementById('bluetooth-peer-list');
  const rescanBtn = document.getElementById('bluetooth-rescan-peers');
  const sendBtn = document.getElementById('bluetooth-send-btn');
  const cancelSendBtn = document.getElementById('bluetooth-send-cancel');
  const closeSendBtn = document.getElementById('bluetooth-send-close');
  const scanStatus = document.getElementById('bluetooth-scan-status');

  const toggle = (el, show) => el?.classList[show ? 'add' : 'remove']('show');

  const waitForEnable = () =>
    new Promise((resolve) => {
      if (!enableOverlay) return resolve(true);
      const handleConfirm = async () => {
        cleanup();
        try {
          const result = await bluetoothService.enable();
          resolve(Boolean(result?.enabled));
        } catch (error) {
          logger?.error(error?.message || 'Failed to enable Bluetooth');
          resolve(false);
        }
      };
      const handleCancel = () => {
        cleanup();
        resolve(false);
      };
      const cleanup = () => {
        enableConfirm?.removeEventListener('click', handleConfirm);
        enableCancel?.removeEventListener('click', handleCancel);
        enableClose?.removeEventListener('click', handleCancel);
        toggle(enableOverlay, false);
      };
      enableConfirm?.addEventListener('click', handleConfirm);
      enableCancel?.addEventListener('click', handleCancel);
      enableClose?.addEventListener('click', handleCancel);
      toggle(enableOverlay, true);
    });

  const renderPeers = (peers = []) => {
    if (!peerList) return;
    if (!peers.length) {
      peerList.innerHTML = '<li class="peer-empty">No nearby Termichemti devices found.</li>';
      return;
    }
    peerList.innerHTML = peers
      .map(
        (peer, index) => `
        <li class="peer-item">
          <label>
            <input type="radio" name="peer" value="${peer.id}" data-name="${peer.name || 'Unknown device'}" ${index === 0 ? 'checked' : ''}/>
            <span class="peer-meta">
              <i class="fas fa-bluetooth-b"></i>
              <span class="peer-name">${peer.name || 'Unknown device'}</span>
              <span class="peer-strength">${peer.strength ? `${peer.strength}%` : ''}</span>
            </span>
          </label>
        </li>`
      )
      .join('');
  };

  const pickPeer = async () => {
    if (!sendOverlay) return null;
    toggle(sendOverlay, true);
    scanStatus.textContent = 'Scanning nearby devices...';
    sendBtn.disabled = true;

    const runScan = async () => {
      try {
        const result = await bluetoothService.scanPeers();
        if (result?.success) {
          const count = result.peers?.length || 0;
          scanStatus.textContent = count > 0 ? `Found ${count} device(s).` : (result.message || 'No devices found.');
          renderPeers(result.peers || []);
          sendBtn.disabled = count === 0;
        } else {
          scanStatus.textContent = result?.message || 'Scan failed.';
          renderPeers([]);
          sendBtn.disabled = true;
        }
      } catch (error) {
        scanStatus.textContent = error?.message || 'Scan failed.';
        renderPeers([]);
        sendBtn.disabled = true;
      }
    };

    await runScan();

    const peersPromise = new Promise((resolve) => {
      const handleSend = () => {
        const selected = sendOverlay.querySelector('input[name="peer"]:checked');
        cleanup();
        resolve(selected ? { id: selected.value, name: selected.dataset?.name } : null);
      };
      const handleCancel = () => {
        cleanup();
        resolve(null);
      };
      const handleRescan = async () => {
        sendBtn.disabled = true;
        scanStatus.textContent = 'Rescanning...';
        await runScan();
      };

      const cleanup = () => {
        sendBtn?.removeEventListener('click', handleSend);
        cancelSendBtn?.removeEventListener('click', handleCancel);
        closeSendBtn?.removeEventListener('click', handleCancel);
        rescanBtn?.removeEventListener('click', handleRescan);
        toggle(sendOverlay, false);
      };

      sendBtn?.addEventListener('click', handleSend);
      cancelSendBtn?.addEventListener('click', handleCancel);
      closeSendBtn?.addEventListener('click', handleCancel);
      rescanBtn?.addEventListener('click', handleRescan);
    });

    return peersPromise;
  };

  return {
    share: async (network) => {
      const state = await bluetoothService.getState();
      if (!state?.supported) {
        toastManager?.show('Bluetooth is not available on this device.', 'error');
        return;
      }

      if (!state.enabled) {
        const enabled = await waitForEnable();
        if (!enabled) {
          toastManager?.show('Bluetooth sharing cancelled (Bluetooth off).', 'warning');
          return;
        }
      }

      const peer = await pickPeer();
      if (!peer) return;

      const toast = toastManager?.show(`Sending ${network.name} via Bluetooth...`, 'info', { spinner: true, duration: 0 });
      diagnostics?.recordBluetoothEvent?.({
        type: 'share',
        ssid: network.name,
        security: network.security,
        encrypted: Boolean(network.password),
        status: 'pending'
      });

      try {
        const result = await bluetoothService.shareNetwork(network, peer.id);
        if (result?.success) {
          toast?.update(`Sent to ${peer.name || 'device'}`, 'success');
          diagnostics?.recordBluetoothEvent?.({
            type: 'share',
            ssid: network.name,
            security: network.security,
            encrypted: Boolean(network.password),
            status: 'success'
          });
        } else {
          toast?.update(result?.message || 'Bluetooth send failed', 'error');
          diagnostics?.recordBluetoothEvent?.({
            type: 'share',
            ssid: network.name,
            security: network.security,
            encrypted: Boolean(network.password),
            status: 'failed'
          });
        }
      } catch (error) {
        toast?.update(error?.message || 'Bluetooth send failed', 'error');
        diagnostics?.recordBluetoothEvent?.({
          type: 'share',
          ssid: network.name,
          security: network.security,
          encrypted: Boolean(network.password),
          status: 'failed'
        });
      }
    }
  };
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
  const bluetoothShareUi = setupBluetoothShareFlow(bluetoothService, toastManager, logger, diagnostics);
  const savedNetworks = buildSavedNetworksController(wifiService, bluetoothService, tabManager, logger, toastManager, diagnostics, bluetoothShareUi);
  const availableNetworks = buildAvailableNetworksController(wifiService, logger);
  setupDecryptedProfileHandler(wifiService, savedNetworks, availableNetworks, logger);

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
