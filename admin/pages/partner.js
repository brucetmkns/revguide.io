/**
 * RevGuide - Partner Dashboard Page
 *
 * Manages the partner dashboard view including client portals,
 * libraries, and access requests.
 */

class PartnerDashboard {
  constructor() {
    this.clients = [];
    this.libraries = [];
    this.pendingRequests = [];
    this.activeTab = 'clients';
    this.init();
  }

  async init() {
    console.log('[PartnerDashboard] init() started');

    // Check authentication
    const isAuthenticated = await AdminShared.checkAuth();
    if (!isAuthenticated) return;

    // Render sidebar with partner active
    AdminShared.renderSidebar('partner');

    // Verify user is a partner
    const isPartner = await RevGuideDB.isPartner();

    if (!isPartner) {
      // Not a partner - show upgrade message
      document.getElementById('partnerLoadingState').style.display = 'none';
      document.getElementById('notPartnerState').style.display = 'block';
      return;
    }

    // Load partner data
    await this.loadData();

    // Hide loading, show content
    document.getElementById('partnerLoadingState').style.display = 'none';
    document.getElementById('partnerContent').style.display = 'block';

    // Render UI
    this.renderStats();
    this.renderClients();
    this.renderLibraries();
    this.renderRequests();

    // Bind events
    this.bindEvents();

    console.log('[PartnerDashboard] init() completed');
  }

  async loadData() {
    try {
      // Load all data in parallel
      const [statsResult, clientsResult, librariesResult, requestsResult] = await Promise.all([
        RevGuideDB.getPartnerStats(),
        RevGuideDB.getPartnerClients(),
        RevGuideDB.getMyLibraries(),
        RevGuideDB.getMyAccessRequests()
      ]);

      this.clients = clientsResult.data || [];
      this.libraries = librariesResult.data || [];

      // Filter for pending requests
      this.pendingRequests = (requestsResult.data || []).filter(r => r.status === 'pending');

      // Update stats from response or calculate from data
      if (statsResult.data) {
        this.stats = statsResult.data;
      } else {
        this.stats = {
          client_count: this.clients.length,
          library_count: this.libraries.length,
          pending_request_count: this.pendingRequests.length
        };
      }
    } catch (error) {
      console.error('[PartnerDashboard] Failed to load data:', error);
      AdminShared.showToast('Failed to load partner data', 'error');
    }
  }

  renderStats() {
    document.getElementById('clientCount').textContent = this.stats?.client_count || this.clients.length;
    document.getElementById('libraryCount').textContent = this.stats?.library_count || this.libraries.length;
    document.getElementById('pendingCount').textContent = this.stats?.pending_request_count || this.pendingRequests.length;
  }

  renderClients() {
    const grid = document.getElementById('clientsGrid');
    const emptyState = document.getElementById('clientsEmptyState');

    if (!this.clients.length) {
      grid.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    grid.style.display = 'grid';
    emptyState.style.display = 'none';

    grid.innerHTML = this.clients.map(client => `
      <div class="client-card" data-org-id="${client.organization_id}">
        <div class="client-card-header">
          <span class="client-color" style="background: ${this.getPortalColor(client.organization_id)}"></span>
          <h4>${AdminShared.escapeHtml(client.organization_name)}</h4>
        </div>
        <div class="client-card-meta">
          ${client.portal_id ? `<span>Portal: ${AdminShared.escapeHtml(client.portal_id)}</span>` : '<span>No HubSpot connected</span>'}
          <span class="role-badge partner">Partner</span>
        </div>
        <div class="client-card-actions">
          <button class="btn btn-primary switch-portal-btn" data-org-id="${client.organization_id}">
            Manage Portal
          </button>
        </div>
      </div>
    `).join('');
  }

  renderLibraries() {
    const grid = document.getElementById('librariesGrid');
    const emptyState = document.getElementById('librariesEmptyState');

    if (!this.libraries.length) {
      grid.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    grid.style.display = 'grid';
    emptyState.style.display = 'none';

    grid.innerHTML = this.libraries.map(library => `
      <div class="library-card" data-library-id="${library.id}">
        <h4>${AdminShared.escapeHtml(library.name)}</h4>
        <p>${AdminShared.escapeHtml(library.description || 'No description')}</p>
        <div class="library-stats">
          <span>v${library.version || '1.0.0'}</span>
          <span>${library.is_public ? 'Public' : 'Private'}</span>
        </div>
        <div class="client-card-actions">
          <a href="/libraries?edit=${library.id}" class="btn btn-secondary">Edit</a>
        </div>
      </div>
    `).join('');
  }

  renderRequests() {
    const list = document.getElementById('requestsList');
    const emptyState = document.getElementById('requestsEmptyState');

    if (!this.pendingRequests.length) {
      list.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    list.style.display = 'block';
    emptyState.style.display = 'none';

    list.innerHTML = this.pendingRequests.map(request => `
      <div class="request-item" data-request-id="${request.id}">
        <div class="request-info">
          <strong>${AdminShared.escapeHtml(request.organization_name || 'Unknown Organization')}</strong>
          <span>Requested ${this.formatDate(request.requested_at)}</span>
        </div>
        <span class="badge-pending">Pending</span>
        <button class="btn btn-secondary btn-sm cancel-request-btn" data-request-id="${request.id}">
          Cancel
        </button>
      </div>
    `).join('');
  }

  bindEvents() {
    // Tab switching
    document.querySelectorAll('.partner-tab').forEach(tab => {
      tab.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });

    // Switch portal buttons (delegated)
    document.getElementById('clientsGrid').addEventListener('click', async (e) => {
      const switchBtn = e.target.closest('.switch-portal-btn');
      if (switchBtn) {
        const orgId = switchBtn.dataset.orgId;
        await this.switchToPortal(orgId);
      }
    });

    // Cancel request buttons (delegated)
    document.getElementById('requestsList')?.addEventListener('click', async (e) => {
      const cancelBtn = e.target.closest('.cancel-request-btn');
      if (cancelBtn) {
        const requestId = cancelBtn.dataset.requestId;
        await this.cancelRequest(requestId);
      }
    });
  }

  switchTab(tabId) {
    // Update tab buttons
    document.querySelectorAll('.partner-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });

    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `${tabId}Tab`);
    });

    this.activeTab = tabId;
  }

  async switchToPortal(organizationId) {
    try {
      const { success, error } = await RevGuideDB.switchOrganization(organizationId);

      if (!success || error) {
        throw new Error(error?.message || 'Failed to switch portal');
      }

      AdminShared.showToast('Switched to client portal', 'success');

      // Redirect to home page of the new portal
      setTimeout(() => {
        window.location.href = '/home';
      }, 500);

    } catch (error) {
      console.error('[PartnerDashboard] Switch portal error:', error);
      AdminShared.showToast(error.message || 'Failed to switch portal', 'error');
    }
  }

  async cancelRequest(requestId) {
    const confirmed = await AdminShared.showConfirmDialog({
      title: 'Cancel Access Request',
      message: 'Are you sure you want to cancel this access request?',
      primaryLabel: 'Cancel Request',
      secondaryLabel: 'Keep Request',
      showCancel: false
    });

    if (confirmed !== 'primary') return;

    try {
      const { error } = await RevGuideDB.cancelAccessRequest(requestId);

      if (error) {
        throw new Error(error.message);
      }

      AdminShared.showToast('Request cancelled', 'success');

      // Remove from local list and re-render
      this.pendingRequests = this.pendingRequests.filter(r => r.id !== requestId);
      this.renderRequests();
      this.renderStats();

    } catch (error) {
      console.error('[PartnerDashboard] Cancel request error:', error);
      AdminShared.showToast(error.message || 'Failed to cancel request', 'error');
    }
  }

  // Helper to generate consistent colors for portals
  getPortalColor(orgId) {
    const colors = [
      '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
      '#f97316', '#eab308', '#22c55e', '#14b8a6',
      '#06b6d4', '#3b82f6'
    ];

    // Simple hash of org ID to pick a color
    let hash = 0;
    const str = orgId || '';
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
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
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PartnerDashboard();
});
