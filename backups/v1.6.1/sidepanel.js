/**
 * HubSpot Helper - Side Panel
 * Displays plays and settings in Chrome's native side panel
 */

class SidePanel {
  constructor() {
    this.cards = [];
    this.settings = {};
    this.init();
  }

  async init() {
    // Set up tab switching
    this.setupTabs();

    // Load settings
    await this.loadSettings();

    // Set up settings event handlers
    this.setupSettingsHandlers();

    // Check if we should open to settings tab (from extension icon click)
    await this.checkOpenTab();

    // Listen for messages from content script or background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'updateSidePanel' || message.action === 'updateSidePanelCards') {
        console.log('[HubSpot Helper] Received card update:', message.cards?.length, 'cards');
        this.updateCards(message.cards);
      }
      if (message.action === 'showNotHubspot') {
        this.showNotHubspotState();
      }
    });

    // Listen for tab URL changes to refresh cards when navigating
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      // Only refresh if URL changed and it's a HubSpot page
      if (changeInfo.url && tab.url?.includes('hubspot.com')) {
        console.log('[HubSpot Helper] Tab URL changed, refreshing cards');
        // Small delay to let content script re-initialize
        setTimeout(() => this.requestCardsFromContentScript(), 1000);
      }
    });

    // Listen for tab activation (switching tabs)
    chrome.tabs.onActivated.addListener((activeInfo) => {
      console.log('[HubSpot Helper] Tab activated, refreshing cards');
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
    const { sidepanelOpenTab } = await chrome.storage.local.get('sidepanelOpenTab');
    if (sidepanelOpenTab) {
      this.switchTab(sidepanelOpenTab);
      // Clear the flag
      await chrome.storage.local.remove('sidepanelOpenTab');
    }
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
        hubspotApiToken: ''
      }
    });
    this.settings = data.settings;

    // Update UI
    document.getElementById('enabledToggle').checked = this.settings.enabled !== false;
    document.getElementById('showBanners').checked = this.settings.showBanners !== false;
    document.getElementById('showBattleCards').checked = this.settings.showBattleCards !== false;
    document.getElementById('showPresentations').checked = this.settings.showPresentations !== false;
    document.getElementById('showWiki').checked = this.settings.showWiki !== false;
    document.getElementById('hubspotApiToken').value = this.settings.hubspotApiToken || '';
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

    // API Token
    document.getElementById('saveApiToken').addEventListener('click', () => {
      const token = document.getElementById('hubspotApiToken').value.trim();
      this.updateSetting('hubspotApiToken', token);
      const status = document.getElementById('apiTokenStatus');
      status.textContent = 'Saved!';
      status.className = 'status-text success';
      setTimeout(() => { status.textContent = ''; }, 2000);
    });

    // Admin Panel button
    document.getElementById('openAdminBtn').addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('admin/admin.html') });
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
    a.download = `hubspot-helper-backup-${new Date().toISOString().split('T')[0]}.json`;
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

    notHubspotState.style.display = 'none';

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
  }

  showEmptyState() {
    document.getElementById('cardsContainer').style.display = 'none';
    document.getElementById('notHubspotState').style.display = 'none';
    document.getElementById('emptyState').style.display = 'flex';
  }

  showNotHubspotState() {
    document.getElementById('cardsContainer').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('notHubspotState').style.display = 'flex';
  }

  renderCard(card) {
    const typeIcons = {
      competitor: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/></svg>',
      objection: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      tip: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
      process: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" x2="21" y1="6" y2="6"/><line x1="10" x2="21" y1="12" y2="12"/><line x1="10" x2="21" y1="18" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>'
    };

    const sectionsHtml = card.sections ? card.sections.map(section => `
      <div class="card-section">
        <div class="section-title">${this.escapeHtml(section.title)}</div>
        <div class="section-content">${this.formatContent(section.content)}</div>
      </div>
    `).join('') : '';

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
        </div>
      </div>
    `;
  }

  formatContent(content) {
    if (!content) return '';
    let html = this.escapeHtml(content);

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

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => new SidePanel());
