/**
 * HubSpot Helper - Settings Page
 */

class SettingsPage {
  constructor() {
    this.settings = {};
    this.init();
  }

  async init() {
    // Render sidebar
    AdminShared.renderSidebar('settings');

    // Load data
    const data = await AdminShared.loadStorageData();
    this.settings = data.settings;

    // Populate UI
    this.updateSettingsUI();

    // Bind events
    this.bindEvents();
  }

  updateSettingsUI() {
    // Load API token
    chrome.storage.local.get(['apiToken'], (data) => {
      if (data.apiToken) {
        document.getElementById('apiToken').value = data.apiToken;
      }
    });

    // Load display options
    document.getElementById('showBanners').checked = this.settings.showBanners !== false;
    document.getElementById('showBattleCards').checked = this.settings.showBattleCards !== false;
    document.getElementById('showPresentations').checked = this.settings.showPresentations !== false;
    document.getElementById('showAdminLinks').checked = this.settings.showAdminLinks !== false;
    document.getElementById('bannerPosition').value = this.settings.bannerPosition || 'top';
  }

  bindEvents() {
    // API Token
    document.getElementById('saveApiBtn').addEventListener('click', () => this.saveApiToken());
    document.getElementById('testApiBtn').addEventListener('click', () => this.testApiConnection());

    // Display options - auto-save on change
    document.getElementById('showBanners').addEventListener('change', (e) => {
      this.settings.showBanners = e.target.checked;
      this.saveSettings();
    });

    document.getElementById('showBattleCards').addEventListener('change', (e) => {
      this.settings.showBattleCards = e.target.checked;
      this.saveSettings();
    });

    document.getElementById('showPresentations').addEventListener('change', (e) => {
      this.settings.showPresentations = e.target.checked;
      this.saveSettings();
    });

    document.getElementById('showAdminLinks').addEventListener('change', (e) => {
      this.settings.showAdminLinks = e.target.checked;
      this.saveSettings();
    });

    document.getElementById('bannerPosition').addEventListener('change', (e) => {
      this.settings.bannerPosition = e.target.value;
      this.saveSettings();
    });

    // Import/Export
    document.getElementById('exportBtn').addEventListener('click', () => this.exportData());
    document.getElementById('importBtn').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', (e) => this.importData(e));
  }

  async saveSettings() {
    await AdminShared.saveStorageData({ settings: this.settings });
    AdminShared.showToast('Settings saved', 'success');
  }

  async saveApiToken() {
    const token = document.getElementById('apiToken').value.trim();
    if (!token) {
      this.showApiStatus('Please enter an API token', 'error');
      return;
    }

    await AdminShared.saveStorageData({ apiToken: token });
    this.showApiStatus('API token saved successfully', 'success');
  }

  async testApiConnection() {
    const token = document.getElementById('apiToken').value.trim();
    if (!token) {
      this.showApiStatus('Please enter an API token first', 'error');
      return;
    }

    this.showApiStatus('Testing connection...', '');

    try {
      const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        this.showApiStatus('Connection successful! API token is valid.', 'success');
      } else if (response.status === 401) {
        this.showApiStatus('Invalid API token. Please check your token.', 'error');
      } else if (response.status === 403) {
        this.showApiStatus('Token lacks required permissions. Need crm.objects.*.read scope.', 'error');
      } else {
        this.showApiStatus(`Connection failed: ${response.status} ${response.statusText}`, 'error');
      }
    } catch (error) {
      this.showApiStatus(`Connection error: ${error.message}`, 'error');
    }
  }

  showApiStatus(message, type) {
    const statusEl = document.getElementById('apiStatus');
    statusEl.textContent = message;
    statusEl.className = 'status-message' + (type ? ` ${type}` : '');
    statusEl.style.display = message ? 'block' : 'none';
  }

  async exportData() {
    const data = await AdminShared.loadStorageData();

    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      rules: data.rules,
      battleCards: data.battleCards,
      presentations: data.presentations,
      wikiEntries: data.wikiEntries,
      settings: data.settings
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hubspot-helper-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    AdminShared.showToast('Data exported successfully', 'success');
  }

  async importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      // Validate structure
      if (!importData.version) {
        throw new Error('Invalid backup file format');
      }

      // Confirm import
      const confirmMsg = `This will replace your current data with:\n` +
        `- ${importData.rules?.length || 0} rules\n` +
        `- ${importData.battleCards?.length || 0} plays\n` +
        `- ${importData.presentations?.length || 0} media items\n` +
        `- ${importData.wikiEntries?.length || 0} wiki entries\n\n` +
        `Continue?`;

      if (!confirm(confirmMsg)) {
        event.target.value = '';
        return;
      }

      // Import data
      await AdminShared.saveStorageData({
        rules: importData.rules || [],
        battleCards: importData.battleCards || [],
        presentations: importData.presentations || [],
        wikiEntries: importData.wikiEntries || [],
        settings: importData.settings || this.settings
      });

      AdminShared.showToast('Data imported successfully! Refreshing...', 'success');

      // Reload to show imported data
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      AdminShared.showToast(`Import failed: ${error.message}`, 'error');
    }

    event.target.value = '';
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new SettingsPage();
});
