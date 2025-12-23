/**
 * RevGuide - Side Panel
 * Displays plays and settings in Chrome's native side panel
 */

// Web app URL for authentication - use config if available
const WEB_APP_URL = (typeof RevGuideConfig !== 'undefined' && RevGuideConfig.ENV)
  ? RevGuideConfig.ENV.app.url
  : 'https://app.revguide.io';

// ============ HIDDEN DEV TOGGLE ============
// Press Ctrl+Shift+Alt+D five times within 3 seconds to toggle staging/production
(function initDevToggle() {
  let devToggleCount = 0;
  let devToggleTimer = null;

  document.addEventListener('keydown', async (e) => {
    // Check for Ctrl+Shift+Alt+D
    if (e.ctrlKey && e.shiftKey && e.altKey && (e.key === 'D' || e.key === 'd')) {
      devToggleCount++;
      clearTimeout(devToggleTimer);
      devToggleTimer = setTimeout(() => { devToggleCount = 0; }, 3000);

      if (devToggleCount >= 5) {
        devToggleCount = 0;
        await toggleDevEnvironment();
      }
    }
  });

  async function toggleDevEnvironment() {
    if (typeof RevGuideConfig === 'undefined') {
      console.warn('[RevGuide] Config not loaded, cannot toggle environment');
      return;
    }

    const newEnv = await RevGuideConfig.toggleEnvironment();
    const message = `Environment switched to: ${newEnv.toUpperCase()}\n\nPlease reload the extension for changes to take effect.\n\nCurrent Supabase: ${RevGuideConfig.ENV?.supabase?.url || 'unknown'}`;

    // Show a simple alert (hidden from normal users)
    alert(message);
    console.log('[RevGuide] Environment toggled to:', newEnv, RevGuideConfig.ENV);
  }
})();

class SidePanel {
  constructor() {
    this.cards = [];
    this.settings = {};
    this.properties = {};  // Current record properties
    this.context = {};     // Current record context (objectType, recordId, etc.)
    this.propertyMetadata = {}; // Property definitions from HubSpot API
    this.authState = { isAuthenticated: false };
    this.init();
  }

  async init() {
    // Set up tab switching
    this.setupTabs();

    // Load settings
    await this.loadSettings();

    // Check auth state
    await this.checkAuthState();

    // Set up settings event handlers
    this.setupSettingsHandlers();

    // Set up auth handlers
    this.setupAuthHandlers();

    // Check if we should open to settings tab (from extension icon click)
    await this.checkOpenTab();

    // Listen for messages from content script or background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'updateSidePanel' || message.action === 'updateSidePanelCards') {
        console.log('[RevGuide] Received card update:', message.cards?.length, 'cards');
        // Store properties and context for field editing
        if (message.properties) this.properties = message.properties;
        if (message.context) this.context = message.context;
        this.updateCards(message.cards);
      }
      if (message.action === 'showNotHubspot') {
        this.showNotHubspotState();
      }
      if (message.action === 'authStateChanged') {
        // Re-check auth state when it changes
        this.checkAuthState();
      }
      if (message.action === 'focusOnPlay') {
        console.log('[RevGuide] Received focusOnPlay message:', message.playId, 'playData:', !!message.playData);
        // Apply record context if provided
        if (message.recordContext) {
          this.context = {
            objectType: message.recordContext.objectType,
            recordId: message.recordContext.recordId
          };
          this.properties = message.recordContext.properties || {};
        }
        // Switch to plays tab
        this.switchTab('plays');

        // If playData was provided, use it directly
        if (message.playData) {
          this.focusOnPlay(message.playId, message.playData);
        } else if (message.playId) {
          // Try to fetch play data, with storage fallback
          console.log('[RevGuide] No playData provided, checking storage then content...');
          chrome.storage.local.get(['sidepanelFocusPlayData'], (result) => {
            if (result.sidepanelFocusPlayData) {
              console.log('[RevGuide] Using play data from storage');
              this.focusOnPlay(message.playId, result.sidepanelFocusPlayData);
              chrome.storage.local.remove('sidepanelFocusPlayData');
            } else {
              // Fetch from content as last resort
              chrome.runtime.sendMessage({ action: 'getContent' }, (response) => {
                const battleCards = response?.content?.battleCards || [];
                const play = battleCards.find(p => p.id === message.playId);
                console.log('[RevGuide] Fetched play from content:', play?.name || 'not found');
                this.focusOnPlay(message.playId, play || null);
              });
            }
          });
        }
        // Send acknowledgment so background knows message was received
        sendResponse && sendResponse({ received: true });
      }
    });

    // Poll for pending play focus (fallback when messages don't arrive)
    setInterval(() => this.checkPendingPlayFocus(), 1000);

    // Listen for tab URL changes to refresh cards when navigating
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      // Only refresh if URL changed and it's a HubSpot page
      if (changeInfo.url && tab.url?.includes('hubspot.com')) {
        console.log('[RevGuide] Tab URL changed, refreshing cards');
        // Small delay to let content script re-initialize
        setTimeout(() => this.requestCardsFromContentScript(), 1000);
      }
    });

    // Listen for tab activation (switching tabs)
    chrome.tabs.onActivated.addListener((activeInfo) => {
      console.log('[RevGuide] Tab activated, refreshing cards');
      setTimeout(() => this.requestCardsFromContentScript(), 500);
    });

    // Request current cards from the active tab's content script
    this.requestCardsFromContentScript();
  }

  // ============ TAB MANAGEMENT ============

  setupTabs() {
    const tabs = document.querySelectorAll('.sidepanel-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        this.switchTab(tabName);
      });
    });
  }

  switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.sidepanel-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabName);
    });

    // Update tab content
    document.querySelectorAll('.sidepanel-tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `${tabName}Tab`);
    });
  }

  async checkOpenTab() {
    // Check if we should open to a specific tab
    const { sidepanelOpenTab, sidepanelFocusPlayId, sidepanelFocusPlayData, sidepanelRecordContext } = await chrome.storage.local.get(['sidepanelOpenTab', 'sidepanelFocusPlayId', 'sidepanelFocusPlayData', 'sidepanelRecordContext']);
    if (sidepanelOpenTab) {
      this.switchTab(sidepanelOpenTab);
      // Clear the flag
      await chrome.storage.local.remove('sidepanelOpenTab');
    }

    // If we should focus on a specific play, store it for when cards load
    if (sidepanelFocusPlayId) {
      this.pendingFocusPlayId = sidepanelFocusPlayId;
      this.pendingFocusPlayData = sidepanelFocusPlayData || null;
      // Store record context so editable fields work with the correct record
      this.pendingRecordContext = sidepanelRecordContext || null;
      await chrome.storage.local.remove(['sidepanelFocusPlayId', 'sidepanelFocusPlayData', 'sidepanelRecordContext']);
    }
  }

  /**
   * Poll for pending play focus requests (fallback for when messages don't arrive)
   * This handles the case when sidepanel is already open and message delivery fails
   */
  async checkPendingPlayFocus() {
    const { sidepanelFocusPlayId, sidepanelFocusPlayData, sidepanelRecordContext } =
      await chrome.storage.local.get(['sidepanelFocusPlayId', 'sidepanelFocusPlayData', 'sidepanelRecordContext']);

    if (sidepanelFocusPlayId) {
      console.log('[RevGuide] Found pending play focus in storage:', sidepanelFocusPlayId);

      // Apply record context if provided
      if (sidepanelRecordContext) {
        this.context = {
          objectType: sidepanelRecordContext.objectType,
          recordId: sidepanelRecordContext.recordId
        };
        this.properties = sidepanelRecordContext.properties || {};
      }

      // Clear storage before processing
      await chrome.storage.local.remove(['sidepanelFocusPlayId', 'sidepanelFocusPlayData', 'sidepanelRecordContext']);

      // Switch to plays tab and focus
      this.switchTab('plays');
      this.focusOnPlay(sidepanelFocusPlayId, sidepanelFocusPlayData || null);
    }
  }

  // ============ AUTHENTICATION ============

  async checkAuthState() {
    try {
      this.authState = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'getAuthState' }, (response) => {
          resolve(response || { isAuthenticated: false });
        });
      });

      console.log('[RevGuide] Auth state:', this.authState.isAuthenticated ? 'authenticated' : 'not authenticated');

      // Update UI based on auth state
      this.updateAuthUI();

      // If not authenticated, show logged out state
      if (!this.authState.isAuthenticated) {
        this.showLoggedOutState();
      }
    } catch (e) {
      console.error('[RevGuide] Error checking auth state:', e);
      this.authState = { isAuthenticated: false };
    }
  }

  updateAuthUI() {
    // Update settings section with auth status if authenticated
    const settingsContainer = document.querySelector('.settings-container');
    if (!settingsContainer) return;

    // Remove existing auth status if any
    const existingStatus = settingsContainer.querySelector('.auth-status');
    if (existingStatus) {
      existingStatus.remove();
    }

    // Update admin hint text
    const adminHint = document.getElementById('adminHint');
    if (adminHint) {
      adminHint.textContent = this.authState.isAuthenticated
        ? 'Opens app.revguide.io to manage your content'
        : 'Manage rules, plays, wiki entries, and media';
    }

    // Hide Export/Import for viewer role
    const isViewer = this.authState.profile?.role === 'viewer';
    const dataSection = document.querySelector('.settings-section:has(#exportBtn)');
    if (dataSection && isViewer) {
      dataSection.style.display = 'none';
    }

    if (this.authState.isAuthenticated) {
      const authStatusHtml = `
        <div class="auth-status authenticated">
          <div class="auth-status-info">
            <div class="auth-status-email">${this.escapeHtml(this.authState.user?.email || 'Signed in')}</div>
            ${this.authState.profile?.name ? `<div class="auth-status-org">${this.escapeHtml(this.authState.profile.name)}</div>` : ''}
          </div>
          <button class="btn btn-secondary btn-sm" id="logoutBtn">Sign Out</button>
        </div>
      `;
      settingsContainer.insertAdjacentHTML('afterbegin', authStatusHtml);

      // Add logout handler
      document.getElementById('logoutBtn')?.addEventListener('click', () => this.handleLogout());
    }
  }

  setupAuthHandlers() {
    // Login button in logged out state (email login)
    document.getElementById('loginBtn')?.addEventListener('click', () => {
      this.openLoginPage();
    });

    // Google SSO button
    document.getElementById('googleSsoBtn')?.addEventListener('click', () => {
      this.openLoginPage('google');
    });

    // Microsoft SSO button
    document.getElementById('microsoftSsoBtn')?.addEventListener('click', () => {
      this.openLoginPage('azure');
    });

    // Signup link
    document.getElementById('signupLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: `${WEB_APP_URL}/signup` });
    });
  }

  openLoginPage(provider = null) {
    // Get extension ID and construct login URL with callback
    const extensionId = chrome.runtime.id;
    const callbackPath = `/extension/logged-in?eid=${extensionId}`;
    let loginUrl = `${WEB_APP_URL}/login?request_path=${encodeURIComponent(callbackPath)}`;

    // If a provider is specified, add it to auto-start OAuth
    if (provider) {
      loginUrl += `&provider=${provider}`;
    }

    chrome.tabs.create({ url: loginUrl });
  }

  async handleLogout() {
    try {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'logout' }, resolve);
      });

      this.authState = { isAuthenticated: false };
      this.updateAuthUI();
      this.showLoggedOutState();
    } catch (e) {
      console.error('[RevGuide] Logout error:', e);
    }
  }

  showLoggedOutState() {
    const container = document.getElementById('cardsContainer');
    const emptyState = document.getElementById('emptyState');
    const notHubspotState = document.getElementById('notHubspotState');
    const loggedOutState = document.getElementById('loggedOutState');

    if (container) container.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';
    if (notHubspotState) notHubspotState.style.display = 'none';
    if (loggedOutState) loggedOutState.style.display = 'flex';
  }

  // ============ SETTINGS ============

  async loadSettings() {
    const data = await chrome.storage.local.get({
      settings: {
        enabled: true,
        showBanners: true,
        showBattleCards: true,
        showPresentations: true,
        showWiki: true,
        showAdminLinks: true
      }
    });
    this.settings = data.settings;

    // Update UI
    document.getElementById('enabledToggle').checked = this.settings.enabled !== false;
    document.getElementById('showBanners').checked = this.settings.showBanners !== false;
    document.getElementById('showBattleCards').checked = this.settings.showBattleCards !== false;
    document.getElementById('showPresentations').checked = this.settings.showPresentations !== false;
    document.getElementById('showWiki').checked = this.settings.showWiki !== false;
  }

  setupSettingsHandlers() {
    // Toggle switches
    document.getElementById('enabledToggle').addEventListener('change', (e) => {
      this.updateSetting('enabled', e.target.checked);
    });

    document.getElementById('showBanners').addEventListener('change', (e) => {
      this.updateSetting('showBanners', e.target.checked);
    });

    document.getElementById('showBattleCards').addEventListener('change', (e) => {
      this.updateSetting('showBattleCards', e.target.checked);
    });

    document.getElementById('showPresentations').addEventListener('change', (e) => {
      this.updateSetting('showPresentations', e.target.checked);
    });

    document.getElementById('showWiki').addEventListener('change', (e) => {
      this.updateSetting('showWiki', e.target.checked);
    });

    // Admin Panel button - open web app if authenticated, local if not
    document.getElementById('openAdminBtn').addEventListener('click', () => {
      if (this.authState.isAuthenticated) {
        chrome.tabs.create({ url: `${WEB_APP_URL}/home` });
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL('admin/pages/home.html') });
      }
    });

    // Export
    document.getElementById('exportBtn').addEventListener('click', () => this.exportData());

    // Import
    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });

    document.getElementById('importFile').addEventListener('change', (e) => {
      this.importData(e.target.files[0]);
      e.target.value = '';
    });

    // "Not a HubSpot Page" state buttons
    document.getElementById('notHubspotAdminBtn')?.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('admin/pages/home.html') });
    });

    document.getElementById('notHubspotSettingsBtn')?.addEventListener('click', () => {
      this.switchTab('settings');
    });
  }

  async updateSetting(key, value) {
    this.settings[key] = value;
    await chrome.storage.local.set({ settings: this.settings });

    // Notify content scripts to refresh
    chrome.runtime.sendMessage({ action: 'refreshUI' });
  }

  async exportData() {
    const data = await chrome.storage.local.get(['rules', 'battleCards', 'presentations', 'wikiEntries', 'settings']);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `revguide-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async importData(file) {
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate structure
      if (!data.rules && !data.battleCards && !data.wikiEntries && !data.settings) {
        alert('Invalid backup file format');
        return;
      }

      // Import data
      await chrome.storage.local.set(data);

      // Reload settings
      await this.loadSettings();

      // Notify content scripts
      chrome.runtime.sendMessage({ action: 'refreshUI' });

      alert('Data imported successfully!');
    } catch (error) {
      console.error('Import error:', error);
      alert('Failed to import data. Please check the file format.');
    }
  }

  // ============ PLAYS ============

  async requestCardsFromContentScript(retryCount = 0) {
    // If not authenticated, show logged out state
    if (!this.authState.isAuthenticated) {
      this.showLoggedOutState();
      return;
    }

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url || !tab.url.includes('hubspot.com')) {
        this.showNotHubspotState();
        return;
      }

      // Send message to content script to get matching cards
      chrome.tabs.sendMessage(tab.id, { action: 'getMatchingCards' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Content script not ready, error:', chrome.runtime.lastError.message);
          // Content script might not be loaded yet, retry a few times
          if (retryCount < 3) {
            setTimeout(() => this.requestCardsFromContentScript(retryCount + 1), 500);
          } else {
            this.showNotHubspotState();
          }
          return;
        }

        if (response && response.cards) {
          // Store properties and context for field editing
          if (response.properties) this.properties = response.properties;
          if (response.context) this.context = response.context;
          this.updateCards(response.cards);
        } else {
          this.showEmptyState();
        }
      });
    } catch (error) {
      console.error('Error requesting cards:', error);
      this.showNotHubspotState();
    }
  }

  updateCards(cards) {
    this.cards = cards || [];

    const container = document.getElementById('cardsContainer');
    const emptyState = document.getElementById('emptyState');
    const notHubspotState = document.getElementById('notHubspotState');
    const loggedOutState = document.getElementById('loggedOutState');

    notHubspotState.style.display = 'none';
    loggedOutState.style.display = 'none';

    if (this.cards.length === 0) {
      container.style.display = 'none';
      emptyState.style.display = 'flex';
      return;
    }

    emptyState.style.display = 'none';
    container.style.display = 'block';
    container.innerHTML = this.cards.map(card => this.renderCard(card)).join('');

    // Add click handlers for expand/collapse
    container.querySelectorAll('.card-header').forEach(header => {
      header.addEventListener('click', () => {
        header.closest('.battle-card').classList.toggle('expanded');
      });
    });

    // Add click handlers for admin edit links
    container.querySelectorAll('.admin-edit-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const cardId = link.dataset.cardId;
        // Use web app if authenticated, otherwise local extension
        const adminUrl = this.authState.isAuthenticated
          ? `${WEB_APP_URL}/plays?edit=${cardId}`
          : chrome.runtime.getURL(`admin/pages/plays.html?edit=${cardId}`);
        chrome.tabs.create({ url: adminUrl });
      });
    });

    // Add click handlers for media open-in-new-tab buttons
    container.querySelectorAll('.media-open-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const originalUrl = btn.dataset.originalUrl;

        // Pause the video by reloading the iframe
        const iframe = btn.closest('.section-media').querySelector('iframe');
        if (iframe) {
          const src = iframe.src;
          iframe.src = '';
          iframe.src = src;
        }

        chrome.tabs.create({ url: originalUrl });
      });
    });

    // Initialize editable field section events
    this.initFieldSectionEvents();

    // Check if we need to focus on a specific play
    if (this.pendingFocusPlayId) {
      this.focusOnPlay(this.pendingFocusPlayId, this.pendingFocusPlayData);
      this.pendingFocusPlayId = null;
      this.pendingFocusPlayData = null;
    }
  }

  /**
   * Scroll to and expand a specific play card
   * If the play is not in the current list, add it temporarily
   * @param {string} playId - The ID of the play to focus on
   * @param {Object} playData - Optional play data if not in current cards
   */
  focusOnPlay(playId, playData = null) {
    // Apply pending record context if available (from banner/tag click)
    if (this.pendingRecordContext) {
      console.log('[RevGuide] Applying record context for play:', playId, this.pendingRecordContext);
      this.context = {
        objectType: this.pendingRecordContext.objectType,
        recordId: this.pendingRecordContext.recordId
      };
      this.properties = this.pendingRecordContext.properties || {};
      this.pendingRecordContext = null;
    }

    let cardElement = document.querySelector(`.battle-card[data-card-id="${playId}"]`);

    // If the play isn't in the current list and we don't have playData, try fetching it
    if (!cardElement && !playData) {
      console.log('[RevGuide] Play not found and no data, fetching from content...');
      chrome.runtime.sendMessage({ action: 'getContent' }, (response) => {
        const battleCards = response?.content?.battleCards || [];
        const play = battleCards.find(p => p.id === playId);
        if (play) {
          console.log('[RevGuide] Found play in content, adding it');
          this.focusOnPlay(playId, play); // Recursive call with data
        } else {
          console.log('[RevGuide] Play not found in content either');
        }
      });
      return;
    }

    // If the play isn't in the current list, we need to add it
    if (!cardElement && playData) {
      console.log('[RevGuide] Play not in current list, adding it:', playId);

      const container = document.getElementById('cardsContainer');
      const emptyState = document.getElementById('emptyState');

      // Hide empty state if showing
      if (emptyState) {
        emptyState.style.display = 'none';
      }
      if (container) {
        container.style.display = 'block';
      }

      // Add a "Related Play" header if this is the first/only card
      const isOnlyCard = container && container.querySelectorAll('.battle-card').length === 0;

      // Create the card HTML and add it
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = this.renderCard(playData, true); // true = fromBanner flag
      const newCard = tempDiv.firstElementChild;

      if (container) {
        if (isOnlyCard) {
          // Clear any loading state or other content
          container.innerHTML = '';
          // Add a section header for related plays
          const header = document.createElement('div');
          header.className = 'related-play-header';
          header.innerHTML = '<span class="related-play-label">Related Play from Banner</span>';
          container.appendChild(header);
        }
        container.appendChild(newCard);

        // Add click handler for expand/collapse
        const cardHeader = newCard.querySelector('.card-header');
        if (cardHeader) {
          cardHeader.addEventListener('click', () => {
            newCard.classList.toggle('expanded');
          });
        }

        // Add click handler for admin edit link
        const editLink = newCard.querySelector('.admin-edit-link');
        if (editLink) {
          editLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const cardId = editLink.dataset.cardId;
            // Use web app if authenticated, otherwise local extension
            const adminUrl = this.authState.isAuthenticated
              ? `${WEB_APP_URL}/plays?edit=${cardId}`
              : chrome.runtime.getURL(`admin/pages/plays.html?edit=${cardId}`);
            chrome.tabs.create({ url: adminUrl });
          });
        }

        // Add click handler for save buttons in editable field sections
        newCard.querySelectorAll('.save-fields-btn').forEach(btn => {
          btn.addEventListener('click', (e) => this.handleSaveFields(e));
        });

        cardElement = newCard;
      }
    }

    if (cardElement) {
      // Expand the card
      cardElement.classList.add('expanded');

      // Scroll it into view with some offset
      setTimeout(() => {
        cardElement.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Add a highlight animation
        cardElement.classList.add('highlight');
        setTimeout(() => cardElement.classList.remove('highlight'), 2000);
      }, 100);
    }
  }

  showEmptyState() {
    document.getElementById('cardsContainer').style.display = 'none';
    document.getElementById('notHubspotState').style.display = 'none';
    document.getElementById('loggedOutState').style.display = 'none';
    document.getElementById('emptyState').style.display = 'flex';
  }

  showNotHubspotState() {
    document.getElementById('cardsContainer').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('loggedOutState').style.display = 'none';
    document.getElementById('notHubspotState').style.display = 'flex';
  }

  renderCard(card) {
    const typeIcons = {
      competitor: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/></svg>',
      objection: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      tip: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
      process: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>'
    };

    const sectionsHtml = card.sections ? card.sections.map(section => {
      // Interpolate variables in section title
      const sectionTitle = section.title ? this.escapeHtml(this.interpolateVariables(section.title)) : '';

      if (section.type === 'media' && section.mediaUrl) {
        const embedUrl = this.convertToEmbedUrl(section.mediaUrl);
        // Get the original URL for opening in new tab (not the embed URL)
        const originalUrl = section.mediaUrl;
        return `
          <div class="card-section card-section-media">
            ${sectionTitle ? `<div class="section-title">${sectionTitle}</div>` : ''}
            <div class="section-media">
              <button class="media-open-btn" data-original-url="${this.escapeHtml(originalUrl)}" title="Open in new tab">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </button>
              <iframe src="${this.escapeHtml(embedUrl || section.mediaUrl)}" frameborder="0" allowfullscreen allow="autoplay; encrypted-media"></iframe>
            </div>
          </div>
        `;
      } else if (section.type === 'fields' && section.fields?.length > 0) {
        return this.renderFieldsSection(section, card);
      } else {
        return `
          <div class="card-section">
            ${sectionTitle ? `<div class="section-title">${sectionTitle}</div>` : ''}
            <div class="section-content">${this.formatContent(section.content)}</div>
          </div>
        `;
      }
    }).join('') : '';

    const linkHtml = card.link ? `
      <div class="card-link">
        <a href="${this.escapeHtml(card.link)}" target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          View Full Play
        </a>
      </div>
    ` : '';

    // Admin edit link - only show for users who can edit content (owner, admin, editor)
    const role = this.authState.profile?.role;
    const canEditContent = role === 'owner' || role === 'admin' || role === 'editor';
    const showAdminLinks = this.settings.showAdminLinks !== false && canEditContent;
    const adminEditHtml = showAdminLinks ? `
      <div class="card-admin-edit">
        <a href="#" class="admin-edit-link" data-card-id="${card.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Edit in Admin Panel
        </a>
      </div>
    ` : '';

    return `
      <div class="battle-card" data-card-id="${card.id}">
        <div class="card-header">
          <div class="card-icon ${card.cardType || 'tip'}">
            ${typeIcons[card.cardType] || typeIcons.tip}
          </div>
          <div class="card-info">
            <div class="card-name">${this.escapeHtml(card.name)}</div>
            ${card.subtitle ? `<div class="card-subtitle">${this.escapeHtml(card.subtitle)}</div>` : ''}
          </div>
          <span class="card-expand">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </span>
        </div>
        <div class="card-body">
          ${sectionsHtml}
          ${linkHtml}
          ${adminEditHtml}
        </div>
      </div>
    `;
  }

  formatContent(content) {
    if (!content) return '';

    // Check if content is already HTML (from Tiptap rich text editor)
    const isHtml = /<[a-z][\s\S]*>/i.test(content);

    if (isHtml) {
      // For HTML content: interpolate variables within the HTML
      // The variable values are escaped, but the HTML structure is preserved
      return this.interpolateVariablesInHtml(content);
    }

    // For plain text content: escape and format
    let text = this.interpolateVariables(content);
    let html = this.escapeHtml(text);

    // Convert bullet points to list items
    html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');

    // Wrap consecutive list items in <ul> and remove newlines between them
    if (html.includes('<li>')) {
      // Remove newlines between list items (they cause <br> issues)
      html = html.replace(/<\/li>\n<li>/g, '</li><li>');
      // Wrap in <ul>
      html = html.replace(/(<li>.*?<\/li>)+/gs, '<ul>$&</ul>');
    }

    // Convert remaining line breaks (not inside lists)
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  /**
   * Interpolate variables within HTML content
   * Preserves HTML structure while escaping variable values
   */
  interpolateVariablesInHtml(html) {
    if (!html || typeof html !== 'string') return html;

    // Replace {{variableName}} with escaped, formatted values
    return html.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, propertyName) => {
      const value = this.getPropertyValue(propertyName);
      if (value !== null && value !== undefined && value !== '') {
        const formatted = this.formatVariableValue(value, propertyName);
        return this.escapeHtml(formatted); // Escape the value for safety
      }
      return this.escapeHtml(`[${propertyName}: not set]`);
    });
  }

  /**
   * Interpolate {{variable}} placeholders with property values
   * Supports: {{propertyName}}, {{property_name}}, and case-insensitive matching
   * Shows placeholder with "not set" message if property not found
   * Auto-formats dates and currency values
   */
  interpolateVariables(text) {
    if (!text || typeof text !== 'string') return text;

    // Match {{variableName}} pattern - allows letters, numbers, underscores
    return text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, propertyName) => {
      const value = this.getPropertyValue(propertyName);
      if (value !== null && value !== undefined && value !== '') {
        return this.formatVariableValue(value, propertyName);
      }
      // Show a styled placeholder when value is not set
      return `[${propertyName}: not set]`;
    });
  }

  /**
   * Format a variable value based on its type/name
   * - ISO dates → readable format (Dec 31, 2025)
   * - Unix timestamps → readable format
   * - Amount/currency fields → formatted number ($30,000)
   */
  formatVariableValue(value, propertyName) {
    const strValue = String(value);
    const lowerName = propertyName.toLowerCase();

    // Check if it's an ISO date (e.g., 2025-12-31T23:33:15.036Z)
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(strValue)) {
      try {
        const date = new Date(strValue);
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          });
        }
      } catch (e) { /* fall through to return raw value */ }
    }

    // Check if it's a Unix timestamp (13-digit milliseconds or 10-digit seconds)
    if (/^\d{10,13}$/.test(strValue)) {
      try {
        const timestamp = strValue.length === 13 ? parseInt(strValue) : parseInt(strValue) * 1000;
        const date = new Date(timestamp);
        if (!isNaN(date.getTime()) && date.getFullYear() > 1990 && date.getFullYear() < 2100) {
          return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          });
        }
      } catch (e) { /* fall through to return raw value */ }
    }

    // Check if it's an amount/currency field (by name pattern)
    const currencyFields = ['amount', 'price', 'value', 'revenue', 'cost', 'budget', 'arr', 'mrr', 'acv', 'tcv'];
    const isCurrencyField = currencyFields.some(f => lowerName.includes(f));

    if (isCurrencyField && /^-?\d+(\.\d+)?$/.test(strValue)) {
      const num = parseFloat(strValue);
      if (!isNaN(num)) {
        // Format with commas and optional decimals
        return num.toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        });
      }
    }

    return strValue;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  convertToEmbedUrl(url) {
    if (!url) return null;

    // YouTube
    const youtubeMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (youtubeMatch) {
      return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
    }

    // Loom
    const loomMatch = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
    if (loomMatch) {
      return `https://www.loom.com/embed/${loomMatch[1]}`;
    }

    // Vimeo
    const vimeoMatch = url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/);
    if (vimeoMatch) {
      return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    }

    // Google Drive video
    const driveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch) {
      return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
    }

    // Already an embed URL or direct link
    if (url.includes('/embed') || url.includes('/preview')) {
      return url;
    }

    return url;
  }

  // ============ EDITABLE FIELDS ============

  getPropertyValue(propertyName) {
    // Try exact match first
    if (this.properties[propertyName] !== undefined) {
      return this.properties[propertyName];
    }

    // Try lowercase version
    const lowerName = propertyName.toLowerCase();
    if (this.properties[lowerName] !== undefined) {
      return this.properties[lowerName];
    }

    // Try with underscores replaced by spaces and vice versa
    const withUnderscores = propertyName.replace(/\s+/g, '_').toLowerCase();
    if (this.properties[withUnderscores] !== undefined) {
      return this.properties[withUnderscores];
    }

    // Try finding a case-insensitive match in properties
    const propKeys = Object.keys(this.properties);
    const matchingKey = propKeys.find(key => key.toLowerCase() === lowerName);
    if (matchingKey) {
      return this.properties[matchingKey];
    }

    return '';
  }

  renderFieldsSection(section, card) {
    const sectionId = `fields-section-${card.id}-${Math.random().toString(36).substr(2, 9)}`;
    // Interpolate variables in section title
    const sectionTitle = section.title ? this.escapeHtml(this.interpolateVariables(section.title)) : '';

    const fieldsHtml = section.fields.map(field => {
      const currentValue = this.getPropertyValue(field.property);
      const displayLabel = field.label || field.property.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

      return `
        <div class="field-input-row" data-property="${this.escapeHtml(field.property)}">
          <label class="field-label">
            ${this.escapeHtml(displayLabel)}
            ${field.required ? '<span class="field-required">*</span>' : ''}
          </label>
          ${this.renderFieldInput(field, currentValue)}
        </div>
      `;
    }).join('');

    return `
      <div class="card-section card-section-fields" data-section-id="${sectionId}">
        ${sectionTitle ? `<div class="section-title">${sectionTitle}</div>` : ''}
        <div class="fields-form">
          ${fieldsHtml}
          <div class="fields-actions">
            <button type="button" class="btn btn-primary btn-sm save-fields-btn" data-card-id="${card.id}" data-section-id="${sectionId}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Save to HubSpot
            </button>
            <span class="fields-status"></span>
          </div>
        </div>
      </div>
    `;
  }

  renderFieldInput(field, currentValue) {
    const displayLabel = field.label || field.property;
    const fieldType = field.fieldType || '';
    const type = field.type || 'string';
    const options = field.options || [];

    // Normalize current value for comparison (lowercase, trimmed)
    const normalizedCurrentValue = String(currentValue || '').toLowerCase().trim();

    // Dropdown/select fields - enumeration, checkbox (multi-select), radio, select
    if (options.length > 0 || fieldType === 'select' || fieldType === 'radio' || fieldType === 'checkbox') {
      const optionsHtml = options.map(opt => {
        const optValue = opt.value !== undefined ? opt.value : opt;
        const optLabel = opt.label || opt;
        // Compare normalized values (case-insensitive)
        const normalizedOptValue = String(optValue || '').toLowerCase().trim();
        const selected = normalizedCurrentValue && normalizedCurrentValue === normalizedOptValue ? 'selected' : '';
        return `<option value="${this.escapeHtml(String(optValue))}" ${selected}>${this.escapeHtml(optLabel)}</option>`;
      }).join('');

      return `
        <select
          class="field-input field-select"
          data-property="${this.escapeHtml(field.property)}"
          data-required="${field.required ? 'true' : 'false'}">
          <option value="">Select ${this.escapeHtml(displayLabel)}...</option>
          ${optionsHtml}
        </select>
      `;
    }

    // Boolean/checkbox fields
    if (type === 'bool' || fieldType === 'booleancheckbox') {
      const checked = currentValue === 'true' || currentValue === true ? 'checked' : '';
      return `
        <label class="field-checkbox-label">
          <input
            type="checkbox"
            class="field-input field-checkbox"
            data-property="${this.escapeHtml(field.property)}"
            data-required="${field.required ? 'true' : 'false'}"
            data-type="boolean"
            ${checked}
          >
          <span>Yes</span>
        </label>
      `;
    }

    // Date fields
    if (type === 'date' || fieldType === 'date') {
      // HubSpot stores dates as timestamps (ms) or YYYY-MM-DD
      let dateValue = '';
      if (currentValue) {
        try {
          // Handle both timestamp and date string formats
          const date = new Date(isNaN(currentValue) ? currentValue : parseInt(currentValue));
          if (!isNaN(date.getTime())) {
            dateValue = date.toISOString().split('T')[0];
          }
        } catch (e) {
          dateValue = currentValue;
        }
      }
      return `
        <input
          type="date"
          class="field-input field-date"
          data-property="${this.escapeHtml(field.property)}"
          data-required="${field.required ? 'true' : 'false'}"
          data-type="date"
          value="${this.escapeHtml(dateValue)}"
        >
      `;
    }

    // Number fields
    if (type === 'number' || fieldType === 'number') {
      return `
        <input
          type="number"
          class="field-input field-number"
          data-property="${this.escapeHtml(field.property)}"
          data-required="${field.required ? 'true' : 'false'}"
          data-type="number"
          value="${this.escapeHtml(currentValue)}"
          placeholder="Enter ${this.escapeHtml(displayLabel.toLowerCase())}"
        >
      `;
    }

    // Textarea for multi-line text
    if (fieldType === 'textarea') {
      return `
        <textarea
          class="field-input field-textarea"
          data-property="${this.escapeHtml(field.property)}"
          data-required="${field.required ? 'true' : 'false'}"
          placeholder="Enter ${this.escapeHtml(displayLabel.toLowerCase())}"
          rows="3"
        >${this.escapeHtml(currentValue)}</textarea>
      `;
    }

    // Default: text input
    return `
      <input
        type="text"
        class="field-input"
        data-property="${this.escapeHtml(field.property)}"
        data-required="${field.required ? 'true' : 'false'}"
        value="${this.escapeHtml(currentValue)}"
        placeholder="Enter ${this.escapeHtml(displayLabel.toLowerCase())}"
      >
    `;
  }

  initFieldSectionEvents() {
    // Set up click handlers for save buttons in field sections
    document.querySelectorAll('.save-fields-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleSaveFields(e));
    });
  }

  async handleSaveFields(e) {
    const btn = e.target.closest('.save-fields-btn');
    const sectionEl = btn.closest('.card-section-fields');
    const statusEl = sectionEl.querySelector('.fields-status');

    // Get all field values
    const updates = {};
    let hasValidationError = false;

    sectionEl.querySelectorAll('.field-input').forEach(input => {
      const property = input.dataset.property;
      const required = input.dataset.required === 'true';
      const dataType = input.dataset.type || '';
      let value;

      // Handle different input types
      if (input.type === 'checkbox' && dataType === 'boolean') {
        value = input.checked ? 'true' : 'false';
      } else if (input.tagName === 'SELECT') {
        value = input.value;
      } else if (dataType === 'date' && input.value) {
        // Convert date to HubSpot timestamp format (midnight UTC)
        const date = new Date(input.value + 'T00:00:00Z');
        value = date.getTime().toString();
      } else {
        value = input.value.trim();
      }

      if (required && !value) {
        input.classList.add('field-error');
        hasValidationError = true;
      } else {
        input.classList.remove('field-error');
        updates[property] = value;
      }
    });

    if (hasValidationError) {
      statusEl.textContent = 'Please fill in required fields';
      statusEl.className = 'fields-status error';
      return;
    }

    // Disable button and show loading state
    btn.disabled = true;
    btn.innerHTML = `
      <svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
      Saving...
    `;
    statusEl.textContent = '';
    statusEl.className = 'fields-status';

    try {
      // Send update request to background script
      const response = await this.updateHubSpotProperties(updates);

      if (response.success) {
        // Update local properties cache
        Object.assign(this.properties, updates);

        btn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Saved!
        `;
        statusEl.textContent = 'Refreshing...';
        statusEl.className = 'fields-status success';

        // Refresh the HubSpot page to show updated values
        setTimeout(() => {
          this.refreshHubSpotPage();

          // Reset button state
          btn.disabled = false;
          btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Save to HubSpot
          `;
          statusEl.textContent = '';
        }, 800);
      } else {
        throw new Error(response.error || 'Failed to save');
      }
    } catch (error) {
      console.error('Error saving fields:', error);
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Save to HubSpot
      `;

      // Parse and display user-friendly error message
      const errorMessage = this.parseHubSpotError(error.message);
      statusEl.innerHTML = errorMessage;
      statusEl.className = 'fields-status error';
    }
  }

  parseHubSpotError(errorMessage) {
    if (!errorMessage) return 'Error saving changes';

    // Check for missing scopes error
    if (errorMessage.includes('MISSING_SCOPES') || errorMessage.includes('required scopes')) {
      // Extract object type from error if possible
      const objectMatch = errorMessage.match(/crm\.objects\.(\w+)\.write/);
      const objectType = objectMatch ? objectMatch[1] : 'records';

      return `
        <span class="error-title">Missing Permissions</span>
        <span class="error-detail">Your HubSpot API token needs write access for ${objectType}.
        <a href="https://developers.hubspot.com/docs/api/private-apps#scopes" target="_blank" rel="noopener">Update token scopes</a></span>
      `;
    }

    // Check for 403 forbidden
    if (errorMessage.includes('403')) {
      return `
        <span class="error-title">Access Denied</span>
        <span class="error-detail">Check your API token permissions in HubSpot Private Apps settings.</span>
      `;
    }

    // Check for 401 unauthorized
    if (errorMessage.includes('401')) {
      return `
        <span class="error-title">Invalid Token</span>
        <span class="error-detail">Your HubSpot API token may be expired or invalid. Update it in Settings.</span>
      `;
    }

    // Check for no token configured
    if (errorMessage.includes('not configured')) {
      return `
        <span class="error-title">API Token Required</span>
        <span class="error-detail">Add your HubSpot API token in the Settings tab.</span>
      `;
    }

    // Default error
    return errorMessage;
  }

  async updateHubSpotProperties(properties) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'updateHubSpotProperties',
        objectType: this.context.objectType,
        recordId: this.context.recordId,
        properties: properties
      }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { success: false, error: 'No response' });
        }
      });
    });
  }

  async refreshHubSpotPage() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        // Use scripting API to refresh the page
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => window.location.reload()
        });
      }
    } catch (e) {
      // Fallback to tabs.reload if scripting fails
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await chrome.tabs.reload(tab.id);
        }
      } catch (e2) {
        console.error('Failed to refresh page:', e2);
      }
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => new SidePanel());
