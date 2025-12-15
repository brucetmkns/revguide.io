/**
 * RevGuide - Settings Page
 */

class SettingsPage {
  constructor() {
    this.settings = {};
    this.invitedUsers = [];
    this.init();
  }

  async init() {
    // Check authentication (redirects to login if not authenticated)
    const isAuthenticated = await AdminShared.checkAuth();
    if (!isAuthenticated) return;

    // Render sidebar
    AdminShared.renderSidebar('settings');

    // Load data
    const data = await AdminShared.loadStorageData();
    this.settings = data.settings;
    this.invitedUsers = data.invitedUsers || [];

    // Populate UI
    this.updateSettingsUI();
    this.renderUsersTable();

    // Bind events
    this.bindEvents();
  }

  updateSettingsUI() {
    // Load API token (only in extension context)
    if (AdminShared.isExtensionContext) {
      chrome.storage.local.get(['apiToken'], (data) => {
        if (data.apiToken) {
          document.getElementById('apiToken').value = data.apiToken;
        }
      });
    }

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

    // User Management
    document.getElementById('inviteUserBtn').addEventListener('click', () => this.openInviteModal());
    document.getElementById('inviteUserEmptyBtn').addEventListener('click', () => this.openInviteModal());
    document.getElementById('closeInviteModal').addEventListener('click', () => this.closeInviteModal());
    document.getElementById('cancelInviteBtn').addEventListener('click', () => this.closeInviteModal());
    document.getElementById('sendInviteBtn').addEventListener('click', () => this.sendInvitation());

    // Close modal on backdrop click
    document.getElementById('inviteModal').addEventListener('click', (e) => {
      if (e.target.id === 'inviteModal') {
        this.closeInviteModal();
      }
    });

    // Delete user buttons (delegated)
    document.getElementById('usersTableBody').addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('.delete-user-btn');
      if (deleteBtn) {
        const userId = deleteBtn.dataset.id;
        this.deleteUser(userId);
      }
    });
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

    // In web context, API tokens will be handled via Nango OAuth (future)
    if (!AdminShared.isExtensionContext) {
      this.showApiStatus('API configuration will use OAuth in the web app (coming soon)', 'info');
      return;
    }

    // In extension context, save to Chrome storage
    return new Promise((resolve) => {
      chrome.storage.local.set({ apiToken: token }, () => {
        this.showApiStatus('API token saved successfully', 'success');
        resolve();
      });
    });
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
    a.download = `revguide-backup-${new Date().toISOString().split('T')[0]}.json`;
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

  // ================================
  // User Management Methods
  // ================================

  renderUsersTable() {
    const tbody = document.getElementById('usersTableBody');
    const tableContainer = document.getElementById('usersTableContainer');
    const emptyState = document.getElementById('usersEmptyState');

    if (this.invitedUsers.length === 0) {
      tableContainer.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    tableContainer.style.display = 'block';
    emptyState.style.display = 'none';

    tbody.innerHTML = this.invitedUsers.map(user => `
      <tr data-id="${user.id}">
        <td><strong>${AdminShared.escapeHtml(user.email)}</strong></td>
        <td><span class="role-badge ${user.role}">${user.role}</span></td>
        <td><span class="badge badge-${user.status}">${user.status === 'active' ? 'Active' : 'Pending'}</span></td>
        <td>${this.formatDate(user.invitedAt)}</td>
        <td>
          <div class="action-buttons">
            <button class="btn-icon-sm btn-danger-icon delete-user-btn" data-id="${user.id}" title="Remove user">
              <span class="icon icon-trash icon--sm"></span>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  openInviteModal() {
    document.getElementById('inviteEmail').value = '';
    document.getElementById('inviteRole').value = 'user';
    document.getElementById('inviteModal').classList.add('open');
    document.getElementById('inviteEmail').focus();
  }

  closeInviteModal() {
    document.getElementById('inviteModal').classList.remove('open');
  }

  async sendInvitation() {
    const email = document.getElementById('inviteEmail').value.trim();
    const role = document.getElementById('inviteRole').value;

    // Validate email
    if (!email) {
      AdminShared.showToast('Please enter an email address', 'error');
      return;
    }

    if (!this.isValidEmail(email)) {
      AdminShared.showToast('Please enter a valid email address', 'error');
      return;
    }

    // Check for duplicates
    if (this.invitedUsers.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      AdminShared.showToast('This user has already been invited', 'error');
      return;
    }

    // Show loading state
    const sendBtn = document.getElementById('sendInviteBtn');
    const originalText = sendBtn.innerHTML;
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="icon icon-refresh icon--sm"></span> Sending...';

    try {
      // Send invitation via API
      await this.sendInviteViaAPI(email, role);

      // Create user object
      const user = {
        id: AdminShared.generateId(),
        email: email,
        role: role,
        status: 'pending',
        invitedAt: Date.now()
      };

      // Add to list
      this.invitedUsers.push(user);

      // Save to storage
      await AdminShared.saveStorageData({ invitedUsers: this.invitedUsers });

      // Close modal and refresh table
      this.closeInviteModal();
      this.renderUsersTable();

      AdminShared.showToast(`Invitation sent to ${email}`, 'success');
    } catch (error) {
      console.error('Failed to send invitation:', error);
      AdminShared.showToast(`Failed to send email: ${error.message}`, 'error');
    } finally {
      // Restore button state
      sendBtn.disabled = false;
      sendBtn.innerHTML = originalText;
    }
  }

  async sendInviteViaAPI(email, role) {
    // In web context, use Supabase to create invitation
    if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
      const { data, error } = await RevGuideDB.createInvitation(email, role);
      if (error) {
        throw new Error(error.message);
      }
      return data;
    }

    // In extension context, send via background script
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'sendInviteEmail',
        email: email,
        role: role
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (response?.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Failed to send email'));
        }
      });
    });
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async deleteUser(userId) {
    const user = this.invitedUsers.find(u => u.id === userId);
    if (!user) return;

    const confirmed = await AdminShared.showConfirmDialog({
      title: 'Remove User',
      message: `Are you sure you want to remove ${user.email} from your team?`,
      primaryLabel: 'Remove',
      secondaryLabel: 'Cancel',
      showCancel: false
    });

    if (confirmed !== 'primary') return;

    // Remove from list
    this.invitedUsers = this.invitedUsers.filter(u => u.id !== userId);

    // Save to storage
    await AdminShared.saveStorageData({ invitedUsers: this.invitedUsers });

    // Refresh table
    this.renderUsersTable();

    AdminShared.showToast('User removed', 'success');
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new SettingsPage();
});
