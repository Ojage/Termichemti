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

// === Sidebar Navigation ===
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.section');

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const targetSection = item.getAttribute('data-section');

    // Cleanup before switching
    cleanup();

    // Update active nav item
    navItems.forEach(nav => nav.classList.remove('active'));
    item.classList.add('active');

    // Update active section
    sections.forEach(section => section.classList.remove('active'));
    const activeSection = document.getElementById(`${targetSection}-section`);
    if (activeSection) {
      activeSection.classList.add('active');
      currentSection = targetSection;
    }

    // Initialize section-specific functionality
    if (targetSection === 'available' && scanBtn) {
      initializeAvailableNetworksSection();
    }

    logMessage(`Navigated to: ${targetSection}`, 'info');
  });
});

// === Existing Code ===
const wifiListContainer = document.getElementById('wifi-list-container');
const headerSubtitle = document.getElementById('header-subtitle');
const loader = document.getElementById('loader');
const searchContainer = document.getElementById('search-container');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search');
const searchStats = document.getElementById('search-stats');

// Global variables for search
let allWifiData = [];
let filteredData = [];

// Available networks section variables
const scanBtn = document.getElementById('scan-btn');
const availableNetworksContainer = document.getElementById('available-networks-container');
const scanStatus = document.getElementById('scan-status');
const connectionModal = document.getElementById('connection-modal');
const connectionForm = document.getElementById('connection-form');
const modalClose = document.getElementById('modal-close');
const cancelConnection = document.getElementById('cancel-connection');
const togglePassword = document.getElementById('toggle-password');
const autoRefreshToggle = document.getElementById('auto-refresh-toggle');
let autoRefreshInterval = null;
let currentSection = 'saved';

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

// --- Search functionality ---
function filterNetworks(searchTerm) {
  const term = searchTerm.toLowerCase().trim();

  if (!term) {
    filteredData = [...allWifiData];
    updateSearchStats(allWifiData.length, allWifiData.length);
    return;
  }

  filteredData = allWifiData.filter(profile =>
    profile.name.toLowerCase().includes(term)
  );

  updateSearchStats(filteredData.length, allWifiData.length);
}

function updateSearchStats(showing, total) {
  if (showing === total) {
    searchStats.textContent = `Showing all ${total} networks`;
  } else if (showing === 0) {
    searchStats.textContent = `No networks found`;
  } else {
    searchStats.textContent = `Showing ${showing} of ${total} networks`;
  }
}

function renderFilteredResults() {
  if (filteredData.length === 0 && searchInput.value.trim()) {
    // Show no results message
    wifiListContainer.innerHTML = `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <h3>No networks found</h3>
                <p>No Wi-Fi networks match "${searchInput.value.trim()}"</p>
            </div>
        `;
    return;
  }

  // Render filtered results
  wifiListContainer.innerHTML = filteredData.map(profile => `
        <div class="wifi-item">
            <div class="wifi-item-header">
                <h2>${highlightSearchTerm(profile.name, searchInput.value)}</h2>
                <i class="fas fa-chevron-right arrow-icon"></i>
            </div>
            <div class="wifi-details">
                ${createDetailsHtml(profile)}
            </div>
        </div>
    `).join('');
}

function highlightSearchTerm(text, searchTerm) {
  if (!searchTerm.trim()) return text;

  const regex = new RegExp(`(${searchTerm.trim()})`, 'gi');
  return text.replace(regex, '<mark class="search-highlight">$1</mark>');
}
// --- Main function to load and render EVERYTHING ---
async function loadAndRenderAllData() {
  try {
    // Show loader if it exists
    if (loader) loader.style.display = 'block';
    if (headerSubtitle) headerSubtitle.textContent = 'Loading network data...';

    const allProfilesData = await window.api.getAllWifiDetails();
    
    // Hide loader
    if (loader) loader.style.display = 'none';

    if (allProfilesData.length === 0) {
      if (headerSubtitle) headerSubtitle.textContent = 'No saved Wi-Fi networks found.';
      if (wifiListContainer) {
        wifiListContainer.innerHTML = `
          <div class="no-results">
            <i class="fas fa-wifi-slash"></i>
            <h3>No saved networks</h3>
            <p>No Wi-Fi networks are currently saved on this device</p>
          </div>
        `;
      }
      return;
    }

    // Store data globally for search
    allWifiData = allProfilesData;
    filteredData = [...allWifiData];

    if (headerSubtitle) {
      headerSubtitle.textContent = `Found ${allProfilesData.length} saved networks.`;
      headerSubtitle.style.color = '';
    }

    // Show search container with animation
    if (searchContainer) {
      searchContainer.style.display = 'block';
      setTimeout(() => {
        searchContainer.classList.add('show');
      }, 100);
    }

    // Initial render
    renderFilteredResults();
    updateSearchStats(allWifiData.length, allWifiData.length);

  } catch (error) {
    // Always hide loader on error
    if (loader) loader.style.display = 'none';
    console.error('Error fetching all Wi-Fi details:', error);
    
    if (headerSubtitle) {
      headerSubtitle.textContent = `Error loading networks: ${error.message || error}`;
      headerSubtitle.style.color = '#ff4d4d';
    }
    
    if (wifiListContainer) {
      wifiListContainer.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-triangle"></i>
          <h3>Failed to load networks</h3>
          <p>${error.message || error}</p>
          <button class="btn-primary retry-load-btn" style="margin-top: 10px;">
            <i class="fas fa-sync-alt"></i>
            Try Again
          </button>
        </div>
      `;
      
      // Add retry button listener
      const retryBtn = wifiListContainer.querySelector('.retry-load-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', loadAndRenderAllData);
      }
    }
  }
}

// --- Search event listeners ---
searchInput.addEventListener('input', (e) => {
  const searchTerm = e.target.value;

  // Show/hide clear button
  if (searchTerm.trim()) {
    clearSearchBtn.classList.add('show');
  } else {
    clearSearchBtn.classList.remove('show');
  }

  // Filter and render results
  filterNetworks(searchTerm);
  renderFilteredResults();
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  clearSearchBtn.classList.remove('show');
  filterNetworks('');
  renderFilteredResults();
  searchInput.focus();
});

// --- Keyboard shortcuts ---
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + F to focus search
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    if (searchContainer.style.display !== 'none') {
      searchInput.focus();
      searchInput.select();
    }
  }

  // Escape to clear search
  if (e.key === 'Escape' && document.activeElement === searchInput) {
    if (searchInput.value.trim()) {
      searchInput.value = '';
      clearSearchBtn.classList.remove('show');
      filterNetworks('');
      renderFilteredResults();
    } else {
      searchInput.blur();
    }
  }

  // Ctrl/Cmd + R to refresh
  if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
    e.preventDefault();
    loadAndRenderAllData();
  }
});

// --- Click handler for toggling visibility ---
wifiListContainer.addEventListener('click', (event) => {
  const header = event.target.closest('.wifi-item-header');
  if (header) {
    header.parentElement.classList.toggle('expanded');
  }
});

// --- Click handler for the copy button ---
wifiListContainer.addEventListener('click', (event) => {
  const copyButton = event.target.closest('.copy-btn');
  if (!copyButton) return;

  const password = copyButton.dataset.password;
  navigator.clipboard.writeText(password).then(() => {
    const icon = copyButton.querySelector('i');
    icon.classList.remove('fa-copy');
    icon.classList.add('fa-check');
    copyButton.title = 'Copied!';
    setTimeout(() => {
      icon.classList.remove('fa-check');
      icon.classList.add('fa-copy');
      copyButton.title = 'Copy password';
    }, 2000);
  });
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

  availableNetworksContainer.innerHTML = networks.map(network => `
        <div class="available-network-item" data-ssid="${network.ssid}" data-security="${network.security}" data-signal="${network.signal}">
            <div class="network-main-info">
                <div class="network-icon-container">
                    <i class="fas fa-wifi"></i>
                </div>
                <div class="network-name-info">
                    <h4>${network.ssid}</h4>
                    <div class="network-metadata">
                        <span class="signal-indicator">
                            <div class="signal-bars">
                                ${generateSignalBars(network.signal)}
                            </div>
                            <span>${getSignalStrength(network.signal)}</span>
                        </span>
                        <span class="security-badge ${network.security.toLowerCase().includes('open') ? 'open' : 'secure'}">
                            ${network.security}
                        </span>
                        <span>Channel: ${network.channel}</span>
                    </div>
                </div>
            </div>
            <button class="connect-btn">
                <i class="fas fa-link"></i>
                Connect
            </button>
        </div>
    `).join('');
}

// Add event listener for available network clicks
availableNetworksContainer.addEventListener('click', (event) => {
  const networkItem = event.target.closest('.available-network-item');
  if (networkItem) {
    const ssid = networkItem.dataset.ssid;
    const security = networkItem.dataset.security;
    const signal = parseInt(networkItem.dataset.signal);
    connectToNetwork(ssid, security, signal);
  }
});

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
  const now = new Date();
  const timeString = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `
        <span class="log-timestamp">[${timeString}]</span>
        <span class="log-message">${message}</span>
    `;

  logContent.appendChild(entry);
  logContent.scrollTop = logContent.scrollHeight; // Auto-scroll to bottom
}

// --- Diagnostics Functionality ---

const pingBtn = document.getElementById('btn-ping');
const dnsBtn = document.getElementById('btn-dns');
const ipconfigBtn = document.getElementById('btn-ipconfig');
const speedtestBtn = document.getElementById('btn-speedtest');

const pingOutput = document.getElementById('ping-output');
const dnsOutput = document.getElementById('dns-output');
const ipconfigOutput = document.getElementById('ipconfig-output');
const speedtestOutput = document.getElementById('speedtest-output');
const speedtestResults = document.getElementById('speedtest-results');

function initializeDiagnosticsSection() {
  if (pingBtn) pingBtn.addEventListener('click', runPing);
  if (dnsBtn) dnsBtn.addEventListener('click', runDnsLookup);
  if (ipconfigBtn) ipconfigBtn.addEventListener('click', getIpConfig);
  if (speedtestBtn) speedtestBtn.addEventListener('click', runSpeedTest);
}

async function runPing() {
  const host = document.getElementById('ping-host').value;
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
  const host = document.getElementById('dns-host').value;
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
  speedtestOutput.textContent = 'Running speed test (this may take a moment)...\n';
  speedtestBtn.disabled = true;
  speedtestResults.classList.add('hidden');
  logMessage('Starting speed test', 'info');

  try {
    const result = await window.api.runSpeedTest();
    if (result.success) {
      speedtestOutput.textContent = 'Speed test completed successfully.';
      document.getElementById('speed-download').textContent = `${result.result.downloadSpeed} Mbps`;
      document.getElementById('speed-latency').textContent = `${result.result.latency} ms`;
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

    if (status && status.connected && status.ssid) {
      if (connectionIndicator) {
        connectionIndicator.classList.remove('disconnected');
        connectionIndicator.classList.add('connected');
      }
      if (connectionStatusText) {
        connectionStatusText.textContent = status.ssid;
      }
      logMessage(`Connected to: ${status.ssid}`, 'success');
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
    currentNetworkName.textContent = currentConnection.ssid;
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

// Event listeners for connection indicator
connectionIndicator.addEventListener('click', showConnectionDetails);
connectionModalClose.addEventListener('click', closeConnectionDetailsModal);
closeConnectionDetails.addEventListener('click', closeConnectionDetailsModal);
disconnectBtn.addEventListener('click', handleDisconnect);

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

document.addEventListener('DOMContentLoaded', async () => {
  initializeDiagnosticsSection();
  await loadAndRenderAllData();

  // Start connection status monitoring
  startConnectionRefresh();

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

