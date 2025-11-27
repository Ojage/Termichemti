// === Theme Management ===
let currentTheme = 'auto';
let systemTheme = 'dark';

async function initializeTheme() {
  // Get saved preference
  const savedTheme = localStorage.getItem('theme-preference') || 'auto';
  currentTheme = savedTheme;

  // Get system theme
  try {
    systemTheme = await window.api.getSystemTheme();
  } catch (error) {
    console.error('Failed to get system theme:', error);
  }

  // Apply theme
  applyTheme(currentTheme === 'auto' ? systemTheme : currentTheme);

  // Update select
  const themeSelect = document.getElementById('theme-select');
  if (themeSelect) {
    themeSelect.value = currentTheme;
  }

  // Listen for system theme changes
  window.api.onThemeChanged((newSystemTheme) => {
    systemTheme = newSystemTheme;
    if (currentTheme === 'auto') {
      applyTheme(systemTheme);
    }
  });
}

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  logMessage(`Theme applied: ${theme}`, 'info');
}

function setTheme(newTheme) {
  currentTheme = newTheme;
  localStorage.setItem('theme-preference', newTheme);
  applyTheme(newTheme === 'auto' ? systemTheme : newTheme);
  logMessage(`Theme preference set to: ${newTheme}`, 'success');
}

// === Settings Panel ===
const settingsBtn = document.getElementById('settings-btn');
const settingsPanel = document.getElementById('settings-panel');
const closeSettingsBtn = document.getElementById('close-settings');
const themeSelect = document.getElementById('theme-select');

function openSettings() {
  settingsPanel.classList.add('open');
  logMessage('Settings panel opened', 'debug');
}

function closeSettings() {
  settingsPanel.classList.remove('open');
  logMessage('Settings panel closed', 'debug');
}

if (settingsBtn) {
  settingsBtn.addEventListener('click', openSettings);
}

if (closeSettingsBtn) {
  closeSettingsBtn.addEventListener('click', closeSettings);
}

if (themeSelect) {
  themeSelect.addEventListener('change', (e) => {
    setTheme(e.target.value);
  });
}

// === Activity Bar Navigation ===
const activityBarItems = document.querySelectorAll('.activity-bar-item[data-view]');
const sidebarViews = document.querySelectorAll('.sidebar-view');

activityBarItems.forEach(item => {
  item.addEventListener('click', () => {
    const targetView = item.getAttribute('data-view');

    // Update active activity bar item
    activityBarItems.forEach(nav => nav.classList.remove('active'));
    item.classList.add('active');

    // Update active sidebar view
    sidebarViews.forEach(view => view.classList.remove('active'));
    const activeView = document.getElementById(`${targetView}-view`);
    if (activeView) {
      activeView.classList.add('active');
      currentSection = targetView;
    }

    // Initialize view-specific functionality
    if (targetView === 'available') {
      // Auto-scan when switching to available networks
      setTimeout(() => {
        if (scanNetworksBtn && !availableTree.querySelector('.tree-item')) {
          scanForNetworks();
        }
      }, 100);
    } else if (targetView === 'diagnostics') {
      showDiagnosticsPanel();
    }

    logMessage(`Navigated to: ${targetView}`, 'info');
  });
});

// Settings button from activity bar
const settingsActivityBtn = document.getElementById('settings-activity-btn');
if (settingsActivityBtn) {
  settingsActivityBtn.addEventListener('click', openSettings);
}

// === Existing Code ===
// New HTML structure elements
const explorerTree = document.getElementById('explorer-tree');
const explorerSearch = document.getElementById('explorer-search');
const availableTree = document.getElementById('available-tree');
const availableSearch = document.getElementById('available-search');
const refreshSavedNetworksBtn = document.getElementById('refresh-saved-networks');
const scanNetworksBtn = document.getElementById('scan-networks-btn');
const diagnosticsList = document.getElementById('diagnostics-list');
const editorContent = document.getElementById('editor-content');
// const editorContent = document.getElementById('editor-content');

// Legacy variables removed - use explorerTree and explorerSearch directly

// Global variables for search
let allWifiData = [];
let filteredData = [];

// Available networks section variables
const scanBtn = scanNetworksBtn;
const availableNetworksContainer = availableTree;
const scanStatus = null; // Will need to be handled differently
const connectionModal = document.getElementById('connection-modal');
const connectionForm = document.getElementById('connection-form');
const modalClose = document.getElementById('modal-close');
const cancelConnection = document.getElementById('cancel-connection');
const togglePassword = document.getElementById('toggle-password');
const autoRefreshToggle = document.getElementById('auto-refresh-toggle');
let autoRefreshInterval = null;
let currentSection = 'saved';

function determineSecurityFromDetails(detailsText = '') {
  if (/WPA3/i.test(detailsText)) return 'WPA3';
  if (/WPA2/i.test(detailsText)) return 'WPA2';
  if (/WPA/i.test(detailsText)) return 'WPA';
  if (/WEP/i.test(detailsText)) return 'WEP';
  if (/Open|None/i.test(detailsText)) return 'Open';
  return 'WPA';
}

function getNetworkSecurityLabel(network = {}) {
  if (network.security) return network.security;
  if (network.details?.authType) return network.details.authType;
  return determineSecurityFromDetails(network.details?.fullDetails || '');
}

function escapeWifiQrField(value = '') {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

function buildWifiQrPayload(network = {}) {
  const ssid = (network.name || network.ssid || '').trim();
  if (!ssid) return null;
  const password = (network.details?.password || '').trim();
  const securityLabel = getNetworkSecurityLabel(network);
  let qrSecurity = 'WPA';
  if (!password) {
    qrSecurity = 'nopass';
  } else if (/WEP/i.test(securityLabel)) {
    qrSecurity = 'WEP';
  }

  if (qrSecurity !== 'nopass' && !password) return null;

  const escapedSsid = escapeWifiQrField(ssid);
  const escapedPass = escapeWifiQrField(password);

  if (qrSecurity === 'nopass') {
    return `WIFI:T:nopass;S:${escapedSsid};H:false;;`;
  }

  return `WIFI:T:${qrSecurity};S:${escapedSsid};P:${escapedPass};H:false;;`;
}

function sanitizeFileName(input = '') {
  return input.replace(/[<>:"/\\|?*]+/g, '_').trim() || 'termichemti-network';
}

// --- Helper function to create the HTML for the details section ---
function createDetailsHtml(profile) {
  if (profile.error) {
    return `<p class="error-detail">Error: Could not load details.</p>`;
  }
  const details = profile.details;
  const passwordHtml = details.password
    ? `
        <div class="detail-password">
            <span class="detail-password-text">${details.password}</span>
            <button class="copy-btn" title="Copy password" data-password="${details.password}">
                <i class="far fa-copy"></i>
            </button>
        </div>
        `
    : `
        <div class="detail-password">
            <span>Password not found or not applicable.</span>
        </div>
        `;

  return `
        ${passwordHtml}
        <h4>Full Profile Information:</h4>
        <div class="detail-full-info">${details.fullDetails}</div>
    `;
}

// Old search functions removed - now using renderExplorerTree() instead
// --- Main function to load and render EVERYTHING ---
async function loadAndRenderAllData() {
  const explorerTreeEl = document.getElementById('explorer-tree');
  
  try {
    console.log('Starting to load networks...');
    logMessage('Loading saved networks...', 'info');
    
    // Show loading state in explorer tree
    if (explorerTreeEl) {
      explorerTreeEl.innerHTML = `
        <div class="tree-loading">
          <div class="loader-small"></div>
          <span>Loading networks...</span>
        </div>
      `;
    } else {
      console.error('explorer-tree element not found!');
      logMessage('Error: Explorer tree element not found', 'error');
      return;
    }

    // Check if API is available
    if (!window.api || !window.api.getAllWifiDetails) {
      throw new Error('API not available. window.api.getAllWifiDetails is missing.');
    }

    // Add timeout wrapper to the API call
    console.log('Calling getAllWifiDetails API...');
    const apiCall = window.api.getAllWifiDetails();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        console.error('API call timed out after 35 seconds!');
        reject(new Error('Network loading timed out after 35 seconds. The system command might be hanging.'));
      }, 35000);
    });

    let allProfilesData;
    try {
      allProfilesData = await Promise.race([apiCall, timeoutPromise]);
      console.log('API call completed, received data:', allProfilesData?.length || 0, 'networks');
    } catch (raceError) {
      console.error('Error in Promise.race:', raceError);
      throw raceError;
    }

    if (!allProfilesData || allProfilesData.length === 0) {
      console.log('No networks found');
      logMessage('No saved networks found', 'info');
      if (explorerTreeEl) {
        explorerTreeEl.innerHTML = `
          <div class="tree-empty">
            <i class="fas fa-wifi-slash"></i>
            <p>No saved networks found</p>
          </div>
        `;
      }
      return;
    }

    console.log(`Found ${allProfilesData.length} networks`);
    logMessage(`Loaded ${allProfilesData.length} saved networks`, 'success');

    // Store data globally for search
    allWifiData = allProfilesData;
    filteredData = [...allWifiData];

    // Render explorer tree with networks
    renderExplorerTree();

  } catch (error) {
    console.error('Error fetching all Wi-Fi details:', error);
    logMessage(`Error loading networks: ${error.message || error}`, 'error');
    
    if (explorerTreeEl) {
      explorerTreeEl.innerHTML = `
        <div class="tree-empty">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Failed to load networks</p>
          <p style="font-size: 11px; margin-top: 8px; color: #f48771;">${error.message || error}</p>
          <button class="btn-primary retry-load-btn" style="margin-top: 12px; padding: 6px 12px; font-size: 12px;">
            <i class="fas fa-sync-alt"></i>
            Try Again
          </button>
        </div>
      `;
      
      // Add retry button listener
      const retryBtn = explorerTreeEl.querySelector('.retry-load-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', loadAndRenderAllData);
      }
    }
  }
}

// Render networks in explorer tree view
function renderExplorerTree(searchTerm = '') {
  if (!explorerTree) return;
  
  const term = searchTerm.toLowerCase().trim();
  let networksToShow = allWifiData;
  
  if (term) {
    networksToShow = allWifiData.filter(profile => 
      profile.name.toLowerCase().includes(term)
    );
  }
  
  if (networksToShow.length === 0) {
    explorerTree.innerHTML = `
      <div class="tree-empty">
        <i class="fas fa-search"></i>
        <p>No networks match "${searchTerm}"</p>
      </div>
    `;
    return;
  }
  
  explorerTree.innerHTML = networksToShow.map(profile => `
    <div class="tree-item" data-network-name="${profile.name}" title="${profile.name}">
      <i class="fas fa-wifi"></i>
      <span>${profile.name}</span>
    </div>
  `).join('');
  
  // Add click handlers to tree items
  explorerTree.querySelectorAll('.tree-item').forEach(item => {
    item.addEventListener('click', () => {
      const networkName = item.dataset.networkName;
      const network = allWifiData.find(n => n.name === networkName);
      if (network) {
        openNetworkInEditor(network);
      }
    });
  });
}

// --- Search event listeners ---
if (explorerSearch) {
  explorerSearch.addEventListener('input', (e) => {
    const searchTerm = e.target.value;
    renderExplorerTree(searchTerm);
  });
}

if (availableSearch) {
  availableSearch.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    const items = availableTree.querySelectorAll('.tree-item');
    items.forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(searchTerm) ? '' : 'none';
    });
  });
}

// Refresh button for saved networks
if (refreshSavedNetworksBtn) {
  refreshSavedNetworksBtn.addEventListener('click', () => {
    loadAndRenderAllData();
  });
}

// --- Keyboard shortcuts ---
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + F to focus search in active sidebar
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    const activeView = document.querySelector('.sidebar-view.active');
    if (activeView) {
      const searchInput = activeView.querySelector('input[type="text"]');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }
  }

  // Ctrl/Cmd + R to refresh
  if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
    e.preventDefault();
    loadAndRenderAllData();
  }
});

// --- Show keyboard hint on first load ---
function showKeyboardHint() {
  const hint = document.createElement('div');
  hint.className = 'keyboard-hint';
  hint.innerHTML = 'Press <strong>Ctrl+F</strong> to search';
  document.body.appendChild(hint);

  setTimeout(() => hint.classList.add('show'), 1000);
  setTimeout(() => {
    hint.classList.remove('show');
    setTimeout(() => hint.remove(), 300);
  }, 4000);
}

// Initialize available networks section
let availableNetworksInitialized = false;
function initializeAvailableNetworksSection() {
  if (availableNetworksInitialized) return; // Prevent duplicate initialization
  
  // Set up scan button
  if (scanBtn) {
    scanBtn.addEventListener('click', scanForNetworks);
  }

  // Set up auto-refresh toggle
  if (autoRefreshToggle) {
    autoRefreshToggle.addEventListener('change', (e) => {
      if (e.target.checked) {
        startAutoRefresh();
      } else {
        stopAutoRefresh();
      }
    });
  }

  // Set up modal functionality
  if (connectionModal) {
    setupConnectionModal();
  }
  
  availableNetworksInitialized = true;
}

// Scan for available networks
async function scanForNetworks() {
  try {
    if (scanBtn) {
      scanBtn.disabled = true;
      scanBtn.classList.add('scanning');
    }
    if (scanStatus) scanStatus.textContent = 'Scanning for networks...';
    if (availableNetworksContainer) availableNetworksContainer.innerHTML = '<div class="loader"></div>';

    const networks = await window.api.scanAvailableNetworks();
    renderAvailableNetworks(networks);

    if (scanStatus) scanStatus.textContent = `Found ${networks.length} available networks`;
    logMessage(`Found ${networks.length} available networks`, 'info');

  } catch (error) {
    console.error('Error scanning networks:', error);
    logMessage(`Error scanning networks: ${error.message || error}`, 'error');
    if (scanStatus) scanStatus.textContent = `Error: ${error}`;
    if (availableNetworksContainer) {
      availableNetworksContainer.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Failed to scan for networks: ${error}</p>
                <button class="btn-primary retry-scan-btn">
                    <i class="fas fa-sync-alt"></i>
                    Try Again
                </button>
            </div>
        `;

      // Add event listener for retry button
      const retryBtn = availableNetworksContainer.querySelector('.retry-scan-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', scanForNetworks);
      }
    }
  } finally {
    if (scanBtn) {
      scanBtn.disabled = false;
      scanBtn.classList.remove('scanning');
    }
    logMessage('Network scan finished', 'info');
  }
}

// Render available networks
function renderAvailableNetworks(networks) {
  if (!availableNetworksContainer) return;

  if (networks.length === 0) {
    availableNetworksContainer.innerHTML = `
            <div class="no-results">
                <i class="fas fa-wifi"></i>
                <h3>No networks found</h3>
                <p>No Wi-Fi networks are currently available</p>
            </div>
        `;
    return;
  }

  availableNetworksContainer.innerHTML = networks.map(network => {
    const signalStrength = getSignalStrength(network.signal);
    const signalClass = signalStrength.toLowerCase();
    const securityLabel = network.security || 'Unknown';
    const isOpenNetwork = securityLabel.toLowerCase().includes('open');
    const channelLabel = network.channel && network.channel !== 'Unknown'
      ? `Channel ${network.channel}`
      : 'Channel N/A';
    const frequencyLabel = network.frequency && network.frequency !== 'Unknown'
      ? network.frequency
      : 'Unknown band';
    const signalValue = typeof network.signal === 'number' ? `${network.signal}%` : 'N/A';

    return `
        <div class="available-network-item ${signalClass}-signal ${isOpenNetwork ? 'open-network' : 'secure-network'}"
             data-ssid="${network.ssid}"
             data-security="${securityLabel}"
             data-signal="${network.signal}"
             data-channel="${network.channel || ''}"
             data-frequency="${network.frequency || ''}">
            <div class="network-main-info">
                <div class="signal-strength-badge">
                    <span class="signal-value">${signalValue}</span>
                    <span class="signal-label">${signalStrength}</span>
                </div>
                <div class="network-name-info">
                    <div class="network-name-row">
                        <h4>${network.ssid}</h4>
                        <span class="security-badge ${isOpenNetwork ? 'open' : 'secure'}">
                            ${securityLabel}
                        </span>
                    </div>
                    <div class="network-metadata">
                        <span class="meta-item">
                            <i class="fas fa-broadcast-tower"></i>
                            ${channelLabel}
                        </span>
                        <span class="meta-item">
                            <i class="fas fa-wave-square"></i>
                            ${frequencyLabel}
                        </span>
                        <span class="meta-item signal-breakdown">
                            <div class="signal-bars">
                                ${generateSignalBars(network.signal)}
                            </div>
                            <span>${signalStrength}</span>
                        </span>
                    </div>
                </div>
            </div>
            <button class="connect-btn" aria-label="Connect to ${network.ssid}">
                <i class="fas fa-plug"></i>
                Connect
            </button>
        </div>
    `;
  }).join('');
}

// Add event listener for available network clicks
if (availableNetworksContainer) {
  availableNetworksContainer.addEventListener('click', (event) => {
    const networkItem = event.target.closest('.available-network-item');
    if (networkItem) {
      const ssid = networkItem.dataset.ssid;
      const security = networkItem.dataset.security;
      const signal = parseInt(networkItem.dataset.signal);
      connectToNetwork(ssid, security, signal);
    }
  });
}

// Generate signal strength bars
function generateSignalBars(signal) {
  const bars = [];
  for (let i = 1; i <= 4; i++) {
    const isActive = signal >= (i * 25);
    bars.push(`<div class="signal-bar ${isActive ? 'active' : ''}"></div>`);
  }
  return bars.join('');
}

// Get signal strength text
function getSignalStrength(signal) {
  if (signal >= 75) return 'Excellent';
  if (signal >= 50) return 'Good';
  if (signal >= 25) return 'Fair';
  return 'Weak';
}

// Connect to network function
function connectToNetwork(ssid, security, signal) {
  logMessage(`Attempting to connect to network: ${ssid} (Security: ${security})`, 'info');
  // Show connection modal
  document.getElementById('modal-network-name').textContent = ssid;
  document.getElementById('modal-signal').innerHTML = `
        <i class="fas fa-signal"></i>
        <span>${getSignalStrength(signal)}</span>
    `;
  document.getElementById('modal-security').textContent = security;

  // Show/hide password field based on security
  const passwordGroup = document.querySelector('.form-group');
  if (security.toLowerCase().includes('open')) {
    passwordGroup.style.display = 'none';
    document.getElementById('network-password').required = false;
    logMessage(`Network ${ssid} is open, password field hidden.`, 'info');
  } else {
    passwordGroup.style.display = 'block';
    document.getElementById('network-password').required = true;
    logMessage(`Network ${ssid} requires password, password field shown.`, 'info');
  }

  connectionModal.classList.add('show');
}

// Setup connection modal
function setupConnectionModal() {
  // Close modal handlers
  modalClose.addEventListener('click', closeConnectionModal);
  cancelConnection.addEventListener('click', closeConnectionModal);

  // Click outside to close
  connectionModal.addEventListener('click', (e) => {
    if (e.target === connectionModal) {
      closeConnectionModal();
    }
  });

  // Password toggle
  togglePassword.addEventListener('click', () => {
    const passwordInput = document.getElementById('network-password');
    const icon = togglePassword.querySelector('i');

    if (passwordInput.type === 'password') {
      passwordInput.type = 'text';
      icon.classList.remove('fa-eye');
      icon.classList.add('fa-eye-slash');
      logMessage('Password visibility toggled to text.', 'debug');
    } else {
      passwordInput.type = 'password';
      icon.classList.remove('fa-eye-slash');
      icon.classList.add('fa-eye');
      logMessage('Password visibility toggled to password.', 'debug');
    }
  });

  // Form submission
  connectionForm.addEventListener('submit', handleNetworkConnection);
}

function closeConnectionModal() {
  connectionModal.classList.remove('show');
  connectionForm.reset();
  document.getElementById('connection-progress').classList.add('hidden');
  connectionForm.style.display = 'block';
  logMessage('Connection modal closed.', 'info');
}

// Handle network connection
async function handleNetworkConnection(e) {
  e.preventDefault();
  console.log('Submitting connection form...'); // Log form submission
  logMessage('Connection form submitted.', 'info');

  const formData = new FormData(connectionForm);
  const ssid = document.getElementById('modal-network-name').textContent;
  const password = document.getElementById('network-password').value;
  const saveNetwork = document.getElementById('save-network').checked;
  const autoConnect = document.getElementById('auto-connect').checked;

  console.log(`Attempting to connect to: ${ssid}`);
  console.log(`Save profile: ${saveNetwork}, Auto-connect: ${autoConnect}`);
  logMessage(`Attempting to connect to: ${ssid} (Save profile: ${saveNetwork}, Auto-connect: ${autoConnect})`, 'info');

  try {
    // Show progress
    connectionForm.style.display = 'none';
    document.getElementById('connection-progress').classList.remove('hidden');
    logMessage('Displaying connection progress...', 'info');

    console.log('Calling window.api.connectToNetwork...');
    const result = await window.api.connectToNetwork({
      ssid,
      password,
      saveProfile: saveNetwork,
      autoConnect
    });
    console.log('API call returned:', result); // Log the result from main process
    logMessage(`Connection API call returned: ${JSON.stringify(result)}`, 'info');

    // Success
    closeConnectionModal();
    if (scanStatus) scanStatus.textContent = `Successfully connected to ${ssid}`; // Update status on available networks tab
    logMessage(`Successfully connected to ${ssid}`, 'success');

    // Refresh the networks list on the available tab
    setTimeout(scanForNetworks, 1000);

  } catch (error) {
    console.error('Connection failed in renderer:', error); // Log error in renderer
    logMessage(`Connection failed for ${ssid}: ${error.message || error}`, 'error');

    // Show error and restore form
    document.getElementById('connection-progress').classList.add('hidden');
    connectionForm.style.display = 'block';

    // Show error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.color = '#ff4d4d';
    errorDiv.style.textAlign = 'center';
    errorDiv.style.marginTop = '10px';
    errorDiv.textContent = `Connection failed: ${error}`;

    connectionForm.appendChild(errorDiv);

    // Remove error message after 5 seconds
    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }
}

// Auto-refresh functionality
function startAutoRefresh() {
  autoRefreshInterval = setInterval(() => {
    if (currentSection === 'available') {
      logMessage('Auto-refreshing available networks...', 'debug');
      scanForNetworks();
    }
  }, 30000); // 30 seconds
  logMessage('Auto-refresh started (30s interval).', 'info');
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
    logMessage('Auto-refresh stopped.', 'info');
  }
}

// Cleanup on section switch
function cleanup() {
  stopAutoRefresh();
  logMessage('Performing cleanup before section switch.', 'debug');
}

// --- Logging Functionality ---
const logPanelHeader = document.getElementById('log-panel-header');
const logPanelContainer = document.querySelector('.log-panel-container');
const logContent = document.getElementById('log-content');
const logToggleIcon = document.getElementById('log-toggle-icon');

logPanelHeader.addEventListener('click', () => {
  logPanelContainer.classList.toggle('expanded');
  if (logPanelContainer.classList.contains('expanded')) {
    logToggleIcon.classList.remove('fa-chevron-up');
    logToggleIcon.classList.add('fa-chevron-down');
    logMessage('Log panel expanded.', 'debug');
  } else {
    logToggleIcon.classList.remove('fa-chevron-down');
    logToggleIcon.classList.add('fa-chevron-up');
    logMessage('Log panel collapsed.', 'debug');
  }
});

function logMessage(message, type = 'info') {
  const logContentEl = document.getElementById('log-content');
  if (!logContentEl) {
    console.log(`[${type.toUpperCase()}] ${message}`);
    return;
  }
  
  const now = new Date();
  const timeString = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `
        <span class="log-timestamp">[${timeString}]</span>
        <span class="log-message">${message}</span>
    `;

  logContentEl.appendChild(entry);
  logContentEl.scrollTop = logContentEl.scrollHeight; // Auto-scroll to bottom
}

// --- Diagnostics Functionality ---

function showDiagnosticsPanel(selectedTool = 'ping') {
  if (!editorContent) return;

  const diagnosticsPanel = editorContent.querySelector('.diagnostics-panel');
  if (!diagnosticsPanel) {
    renderDiagnosticsPanel(selectedTool);
    return;
  }

  highlightDiagnosticItem(selectedTool);
  const section = document.getElementById(`diagnostic-${selectedTool}`);
  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderDiagnosticsPanel(selectedTool = 'ping') {
  if (!editorContent) return;

  editorContent.innerHTML = `
    <div class="diagnostics-panel">
      <div class="diagnostics-header">
        <h2>Network Diagnostics</h2>
        <p>Run connectivity checks and gather quick troubleshooting information.</p>
      </div>

      <section id="diagnostic-ping" class="diagnostic-card">
        <div class="diagnostic-card-header">
          <div>
            <h3>Ping Test</h3>
            <p>Check latency and reachability for a hostname or IP address.</p>
          </div>
          <button class="btn-primary diagnostic-action" id="btn-ping">
            <i class="fas fa-play"></i>
            Run Ping
          </button>
        </div>
        <div class="diagnostic-inputs">
          <label for="ping-host">Host / IP</label>
          <input type="text" id="ping-host" placeholder="e.g. 8.8.8.8" value="8.8.8.8" />
        </div>
        <pre class="diagnostic-output" id="ping-output">Ready to run ping tests.</pre>
      </section>

      <section id="diagnostic-dns" class="diagnostic-card">
        <div class="diagnostic-card-header">
          <div>
            <h3>DNS Lookup</h3>
            <p>Resolve a hostname to verify DNS connectivity.</p>
          </div>
          <button class="btn-primary diagnostic-action" id="btn-dns">
            <i class="fas fa-search"></i>
            Lookup
          </button>
        </div>
        <div class="diagnostic-inputs">
          <label for="dns-host">Hostname</label>
          <input type="text" id="dns-host" placeholder="e.g. example.com" value="example.com" />
        </div>
        <pre class="diagnostic-output" id="dns-output">Ready for DNS lookups.</pre>
      </section>

      <section id="diagnostic-ipconfig" class="diagnostic-card">
        <div class="diagnostic-card-header">
          <div>
            <h3>IP Configuration</h3>
            <p>Gather adapter addresses, gateways, and DNS servers.</p>
          </div>
          <button class="btn-primary diagnostic-action" id="btn-ipconfig">
            <i class="fas fa-info-circle"></i>
            Get Info
          </button>
        </div>
        <pre class="diagnostic-output" id="ipconfig-output">IP configuration output will appear here.</pre>
      </section>

      <section id="diagnostic-speedtest" class="diagnostic-card">
        <div class="diagnostic-card-header">
          <div>
            <h3>Speed Test</h3>
            <p>Measure your connection speed and latency.</p>
          </div>
          <button class="btn-primary diagnostic-action" id="btn-speedtest">
            <i class="fas fa-tachometer-alt"></i>
            Run Test
          </button>
        </div>
        <pre class="diagnostic-output" id="speedtest-output">Speed test results will be shown here.</pre>
        <div class="speedtest-results hidden" id="speedtest-results">
          <div class="speed-result">
            <span>Download</span>
            <strong id="speed-download">0 Mbps</strong>
          </div>
          <div class="speed-result">
            <span>Latency</span>
            <strong id="speed-latency">0 ms</strong>
          </div>
        </div>
      </section>
    </div>
  `;

  highlightDiagnosticItem(selectedTool);
  initializeDiagnosticsSection();

  const section = document.getElementById(`diagnostic-${selectedTool}`);
  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function highlightDiagnosticItem(tool) {
  if (!diagnosticsList) return;
  diagnosticsList.querySelectorAll('.diagnostic-item').forEach(item => {
    if (item.dataset.diagnostic === tool) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

if (diagnosticsList) {
  diagnosticsList.addEventListener('click', (event) => {
    const item = event.target.closest('.diagnostic-item');
    if (!item) return;
    showDiagnosticsPanel(item.dataset.diagnostic);
  });
}

function initializeDiagnosticsSection() {
  const pingBtn = document.getElementById('btn-ping');
  const dnsBtn = document.getElementById('btn-dns');
  const ipconfigBtn = document.getElementById('btn-ipconfig');
  const speedtestBtn = document.getElementById('btn-speedtest');

  if (pingBtn) pingBtn.addEventListener('click', runPing);
  if (dnsBtn) dnsBtn.addEventListener('click', runDnsLookup);
  if (ipconfigBtn) ipconfigBtn.addEventListener('click', getIpConfig);
  if (speedtestBtn) speedtestBtn.addEventListener('click', runSpeedTest);
}

async function runPing() {
  const hostInput = document.getElementById('ping-host');
  const pingBtn = document.getElementById('btn-ping');
  const pingOutput = document.getElementById('ping-output');
  if (!hostInput || !pingBtn || !pingOutput) return;

  const host = hostInput.value.trim();
  if (!host) return;

  pingOutput.textContent = `Pinging ${host}...\n`;
  pingBtn.disabled = true;
  logMessage(`Starting ping test for ${host}`, 'info');

  try {
    const result = await window.api.runPing(host);
    pingOutput.textContent += result.output;
    logMessage(`Ping test finished for ${host}`, result.success ? 'success' : 'error');
  } catch (error) {
    pingOutput.textContent += `Error: ${error.message || error}`;
    logMessage(`Ping test failed: ${error}`, 'error');
  } finally {
    pingBtn.disabled = false;
  }
}

async function runDnsLookup() {
  const hostInput = document.getElementById('dns-host');
  const dnsBtn = document.getElementById('btn-dns');
  const dnsOutput = document.getElementById('dns-output');
  if (!hostInput || !dnsBtn || !dnsOutput) return;

  const host = hostInput.value.trim();
  if (!host) return;

  dnsOutput.textContent = `Looking up DNS for ${host}...\n`;
  dnsBtn.disabled = true;
  logMessage(`Starting DNS lookup for ${host}`, 'info');

  try {
    const result = await window.api.runDnsLookup(host);
    dnsOutput.textContent += result.output;
    logMessage(`DNS lookup finished for ${host}`, result.success ? 'success' : 'error');
  } catch (error) {
    dnsOutput.textContent += `Error: ${error.message || error}`;
    logMessage(`DNS lookup failed: ${error}`, 'error');
  } finally {
    dnsBtn.disabled = false;
  }
}

async function getIpConfig() {
  const ipconfigBtn = document.getElementById('btn-ipconfig');
  const ipconfigOutput = document.getElementById('ipconfig-output');
  if (!ipconfigBtn || !ipconfigOutput) return;

  ipconfigOutput.textContent = 'Fetching IP configuration...\n';
  ipconfigBtn.disabled = true;
  logMessage('Fetching IP configuration', 'info');

  try {
    const result = await window.api.getIpConfig();
    ipconfigOutput.textContent = result.output;
    logMessage('IP configuration fetched', 'success');
  } catch (error) {
    ipconfigOutput.textContent = `Error: ${error.message || error}`;
    logMessage(`Failed to get IP config: ${error}`, 'error');
  } finally {
    ipconfigBtn.disabled = false;
  }
}

async function runSpeedTest() {
  const speedtestBtn = document.getElementById('btn-speedtest');
  const speedtestOutput = document.getElementById('speedtest-output');
  const speedtestResults = document.getElementById('speedtest-results');
  const downloadEl = document.getElementById('speed-download');
  const latencyEl = document.getElementById('speed-latency');
  if (!speedtestBtn || !speedtestOutput || !speedtestResults || !downloadEl || !latencyEl) return;

  speedtestOutput.textContent = 'Running speed test (this may take a moment)...\n';
  speedtestBtn.disabled = true;
  speedtestResults.classList.add('hidden');
  logMessage('Starting speed test', 'info');

  try {
    const result = await window.api.runSpeedTest();
    if (result.success) {
      speedtestOutput.textContent = 'Speed test completed successfully.';
      downloadEl.textContent = `${result.result.downloadSpeed} Mbps`;
      latencyEl.textContent = `${result.result.latency} ms`;
      speedtestResults.classList.remove('hidden');
      logMessage(`Speed test result: ${result.result.downloadSpeed} Mbps, ${result.result.latency}ms`, 'success');
    } else {
      speedtestOutput.textContent = `Speed test failed: ${result.message}`;
      logMessage(`Speed test failed: ${result.message}`, 'error');
    }
  } catch (error) {
    speedtestOutput.textContent = `Error: ${error.message || error}`;
    logMessage(`Speed test error: ${error}`, 'error');
  } finally {
    speedtestBtn.disabled = false;
  }
}

function initializeQrShare(network) {
  if (!editorContent) return;
  const qrCanvas = editorContent.querySelector('#wifi-qr-canvas');
  const statusEl = editorContent.querySelector('#qr-share-status');
  const refreshBtn = editorContent.querySelector('#refresh-qr-btn');
  const downloadBtn = editorContent.querySelector('#download-qr-btn');

  if (!qrCanvas) return;

  const disableShare = (message) => {
    if (statusEl) statusEl.textContent = message;
    if (refreshBtn) refreshBtn.disabled = true;
    if (downloadBtn) downloadBtn.disabled = true;
  };

  let qrInstance = null;

  const renderQr = () => {
    const payload = buildWifiQrPayload(network);
    if (!payload) {
      disableShare('Missing password or SSID details to encode this network.');
      return null;
    }

    if (refreshBtn) refreshBtn.disabled = false;
    if (downloadBtn) downloadBtn.disabled = false;

    if (typeof QRious === 'undefined') {
      disableShare('QR engine unavailable. Please ensure the QR library is reachable.');
      return null;
    }

    if (!qrInstance) {
      qrInstance = new QRious({
        element: qrCanvas,
        value: payload,
        size: 220,
        background: '#ffffff',
        foreground: '#0f172a',
        level: 'H'
      });
    } else {
      qrInstance.value = payload;
    }

    qrCanvas.dataset.qrPayload = payload;
    if (statusEl) statusEl.textContent = 'QR ready to scan.';
    return qrInstance;
  };

  qrInstance = renderQr();

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const instance = renderQr();
      if (instance && statusEl) {
        statusEl.textContent = 'QR refreshed just now.';
      }
      logMessage(`QR code refreshed for ${network.name}`, 'info');
    });
  }

  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const instance = qrInstance || renderQr();
      if (!instance) return;
      const link = document.createElement('a');
      link.href = instance.toDataURL('image/png');
      link.download = `${sanitizeFileName(network.name || 'network')}-wifi-qr.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      logMessage(`QR code downloaded for ${network.name}`, 'success');
    });
  }
}

// --- Connection Indicator Functionality ---
const connectionIndicator = document.getElementById('connection-indicator');
const connectionStatusText = document.getElementById('connection-status-text');
const connectionDetailsModal = document.getElementById('connection-details-modal');
const connectionModalClose = document.getElementById('connection-modal-close');
const closeConnectionDetails = document.getElementById('close-connection-details');
const disconnectBtn = document.getElementById('disconnect-btn');
const currentNetworkName = document.getElementById('current-network-name');
const currentNetworkStatus = document.getElementById('current-network-status');

let currentConnection = null;
let connectionRefreshInterval = null;

// Update connection indicator
async function updateConnectionIndicator() {
  try {
    // Set timeout for connection status check
    const statusPromise = window.api.getConnectionStatus();
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve({ connected: false, ssid: null }), 5000);
    });
    
    const status = await Promise.race([statusPromise, timeoutPromise]);
    currentConnection = status;

    if (status && status.connected) {
      const networkName = status.ssid || 'Connected';
      if (connectionIndicator) {
        connectionIndicator.classList.remove('disconnected');
        connectionIndicator.classList.add('connected');
      }
      if (connectionStatusText) {
        connectionStatusText.textContent = networkName;
      }
      logMessage(`Connected to: ${networkName}`, 'success');
    } else {
      if (connectionIndicator) {
        connectionIndicator.classList.remove('connected');
        connectionIndicator.classList.add('disconnected');
      }
      if (connectionStatusText) {
        connectionStatusText.textContent = 'Not Connected';
      }
      logMessage('No active connection', 'info');
    }
  } catch (error) {
    console.error('Failed to get connection status:', error);
    if (connectionIndicator) {
      connectionIndicator.classList.remove('connected');
      connectionIndicator.classList.add('disconnected');
    }
    if (connectionStatusText) {
      connectionStatusText.textContent = 'Not Connected';
    }
    logMessage(`Failed to get connection status: ${error}`, 'error');
  }
}

// Show connection details modal
function showConnectionDetails() {
  if (currentConnection && currentConnection.connected) {
    currentNetworkName.textContent = currentConnection.ssid || 'Connected';
    currentNetworkStatus.textContent = 'Connected';
    disconnectBtn.style.display = 'flex';
  } else {
    currentNetworkName.textContent = 'Not Connected';
    currentNetworkStatus.textContent = 'No active Wi-Fi connection';
    disconnectBtn.style.display = 'none';
  }
  connectionDetailsModal.classList.add('show');
  logMessage('Opened connection details modal', 'debug');
}

// Close connection details modal
function closeConnectionDetailsModal() {
  connectionDetailsModal.classList.remove('show');
  logMessage('Closed connection details modal', 'debug');
}

// Handle disconnect
async function handleDisconnect() {
  if (!currentConnection || !currentConnection.connected) {
    logMessage('No active connection to disconnect', 'warning');
    return;
  }

  const networkName = currentConnection.ssid;
  disconnectBtn.disabled = true;
  disconnectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Disconnecting...';
  logMessage(`Disconnecting from ${networkName}...`, 'info');

  try {
    await window.api.disconnectNetwork();
    logMessage(`Successfully disconnected from ${networkName}`, 'success');

    // Update UI
    closeConnectionDetailsModal();
    await updateConnectionIndicator();

    // Show success message
    const successMsg = document.createElement('div');
    successMsg.className = 'keyboard-hint show';
    successMsg.textContent = `Disconnected from ${networkName}`;
    successMsg.style.backgroundColor = '#28a745';
    successMsg.style.color = 'white';
    document.body.appendChild(successMsg);

    setTimeout(() => {
      successMsg.classList.remove('show');
      setTimeout(() => successMsg.remove(), 300);
    }, 3000);

  } catch (error) {
    console.error('Disconnect failed:', error);
    logMessage(`Failed to disconnect: ${error}`, 'error');

    // Show error message
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #ff4d4d; color: white; padding: 12px 20px; border-radius: 8px; z-index: 10000;';
    errorDiv.textContent = `Failed to disconnect: ${error}`;
    document.body.appendChild(errorDiv);

    setTimeout(() => errorDiv.remove(), 5000);
  } finally {
    disconnectBtn.disabled = false;
    disconnectBtn.innerHTML = '<i class="fas fa-unlink"></i> Disconnect';
  }
}

// Event listeners for connection indicator (if elements exist)
if (connectionIndicator) {
  connectionIndicator.addEventListener('click', showConnectionDetails);
}
// const connectionModalClose = document.getElementById('connection-modal-close');
// const closeConnectionDetails = document.getElementById('close-connection-details');
// const disconnectBtn = document.getElementById('disconnect-btn');
if (connectionModalClose) {
  connectionModalClose.addEventListener('click', closeConnectionDetailsModal);
}
if (closeConnectionDetails) {
  closeConnectionDetails.addEventListener('click', closeConnectionDetailsModal);
}
if (disconnectBtn) {
  disconnectBtn.addEventListener('click', handleDisconnect);
}

// Close modal on outside click
connectionDetailsModal.addEventListener('click', (e) => {
  if (e.target === connectionDetailsModal) {
    closeConnectionDetailsModal();
  }
});

// Start auto-refresh for connection status
function startConnectionRefresh() {
  // Initial update
  updateConnectionIndicator();

  // Refresh every 10 seconds
  connectionRefreshInterval = setInterval(updateConnectionIndicator, 10000);
  logMessage('Connection status auto-refresh started (10s interval)', 'info');
}

// Stop auto-refresh
function stopConnectionRefresh() {
  if (connectionRefreshInterval) {
    clearInterval(connectionRefreshInterval);
    connectionRefreshInterval = null;
    logMessage('Connection status auto-refresh stopped', 'info');
  }
}

// Function to open network details in editor
function openNetworkInEditor(network) {
  // Create or update tab
  const tabId = `tab-${network.name}`;
  let tab = document.querySelector(`.editor-tab[data-tab-id="${tabId}"]`);
  
  if (!tab) {
    // Create new tab
    const editorTabs = document.querySelector('.editor-tabs');
    tab = document.createElement('div');
    tab.className = 'editor-tab active';
    tab.dataset.tabId = tabId;
    tab.innerHTML = `
      <i class="fas fa-wifi"></i>
      <span>${network.name}</span>
      <i class="fas fa-times editor-tab-close"></i>
    `;
    
    // Remove active from other tabs
    editorTabs.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
    
    editorTabs.appendChild(tab);
    
    // Close tab handler
    const closeBtn = tab.querySelector('.editor-tab-close');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      tab.remove();
      // Show empty state if no tabs
      if (editorTabs.querySelectorAll('.editor-tab').length === 0) {
        if (editorContent) {
          editorContent.innerHTML = `
          <div class="editor-empty-state">
            <i class="fas fa-folder-open"></i>
            <h2>No Network Selected</h2>
            <p>Select a network from the explorer to view details</p>
          </div>
        `;
        }
      }
    });
  }
  
  // Activate tab
  document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  
  // Render network details
  renderNetworkDetails(network);
}

// Render network details in editor
function renderNetworkDetails(network) {
  if (!editorContent) return;
  
  const details = network.details || {};
  const password = details.password || 'Not available';
  const securityLabel = getNetworkSecurityLabel(network);
  
  editorContent.innerHTML = `
    <div class="network-details-view">
      <div class="network-header">
        <div class="network-header-icon">
          <i class="fas fa-wifi"></i>
        </div>
        <div class="network-header-info">
          <h2>${network.name}</h2>
          <p>Saved Wi-Fi Network</p>
        </div>
      </div>
      <div class="network-content">
        <div class="detail-section">
          <h3>Password</h3>
          <div class="detail-row password-row">
            <div class="detail-value" style="font-family: 'Fira Code', monospace; word-break: break-all;">${password}</div>
            <button class="copy-btn" data-password="${password}">
              <i class="fas fa-copy"></i> Copy
            </button>
          </div>
        </div>
        <div class="detail-section qr-share-section">
          <div class="qr-share-header">
            <div>
              <h3>Share via QR Code</h3>
              <p>Scan to connect instantly using any modern device camera.</p>
            </div>
            <button class="btn-secondary" id="download-qr-btn">
              <i class="fas fa-download"></i>
              Download PNG
            </button>
          </div>
          <div class="qr-share-body">
            <canvas id="wifi-qr-canvas" width="220" height="220" aria-label="Wi-Fi QR code preview"></canvas>
            <div class="qr-share-info">
              <p><strong>SSID:</strong> ${network.name}</p>
              <p><strong>Security:</strong> ${securityLabel}</p>
              <button class="btn-primary" id="refresh-qr-btn">
                <i class="fas fa-sync-alt"></i>
                Refresh QR
              </button>
              <p class="qr-share-note" id="qr-share-status">Preparing secure QR payload...</p>
            </div>
          </div>
        </div>
        <div class="detail-section">
          <h3>Full Profile Details</h3>
          <div class="full-details">${details.fullDetails || 'No additional details available'}</div>
        </div>
      </div>
    </div>
  `;
  
  // Add copy button handler
  const copyBtn = editorContent.querySelector('.copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const password = copyBtn.dataset.password;
      navigator.clipboard.writeText(password).then(() => {
        const icon = copyBtn.querySelector('i');
        icon.className = 'fas fa-check';
        setTimeout(() => {
          icon.className = 'fas fa-copy';
        }, 2000);
      });
    });
  }

  initializeQrShare(network);
}

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM Content Loaded - initializing app...');
  
  // Make sure elements exist
  if (!explorerTree) {
    console.error('ERROR: explorer-tree element not found in DOM!');
    logMessage('Critical error: Explorer tree element not found', 'error');
    return;
  }

  initializeAvailableNetworksSection();
  
  // Initialize connection status monitoring first
  startConnectionRefresh();
  
  console.log('Starting to load networks...');
  // Load saved networks
  await loadAndRenderAllData();

  logMessage('Application started', 'info');
  logMessage('Initializing components...', 'info');

  // Apply OS Branding
  try {
    const osInfo = await window.api.getOsInfo();
    logMessage(`Detected OS: ${osInfo.distro} (${osInfo.platform})`, 'info');
    logMessage(`Desktop Environment: ${osInfo.desktopEnv}`, 'info');

    document.body.dataset.platform = osInfo.platform;

    // Simple heuristic for theming based on distro/OS
    if (osInfo.platform === 'win32') {
      document.body.classList.add('theme-windows');
    } else if (osInfo.platform === 'linux') {
      if (osInfo.distro.toLowerCase().includes('ubuntu')) {
        document.body.classList.add('theme-ubuntu');
      } else if (osInfo.distro.toLowerCase().includes('mint')) {
        document.body.classList.add('theme-mint');
      } else {
        document.body.classList.add('theme-linux-generic');
      }
    }
  } catch (error) {
    console.error('Failed to get OS info:', error);
    logMessage(`Failed to apply OS branding: ${error}`, 'error');
  }

  // Initialize theme system
  await initializeTheme();
});

