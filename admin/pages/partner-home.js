/**
 * RevGuide - Partner Home Page
 * Simplified onboarding for partner accounts
 */

class PartnerHomePage {
  constructor() {
    this.clients = [];
    this.libraries = [];
    this.init();
  }

  /**
   * Update SVG progress ring stroke-dashoffset
   * @param {HTMLElement} element - The SVG circle element
   * @param {number} percentage - Progress percentage (0-100)
   */
  updateProgressRing(element, percentage) {
    if (!element) return;
    // Circle has r=36, so circumference = 2 * PI * 36 = ~226
    const circumference = 226;
    const offset = circumference - (circumference * percentage / 100);
    element.setAttribute('stroke-dashoffset', offset);
  }

  /**
   * Highlight the first incomplete step as active
   */
  highlightNextStep() {
    const steps = ['partnerStepInstall', 'partnerStepClient', 'partnerStepDeploy'];

    // Remove active class from all steps first
    steps.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });

    // Find first non-completed step and mark as active
    for (const id of steps) {
      const el = document.getElementById(id);
      if (el && !el.classList.contains('completed')) {
        el.classList.add('active');
        break;
      }
    }
  }

  async init() {
    // Check authentication
    const isAuthenticated = await AdminShared.checkAuth();
    if (!isAuthenticated) return;

    // Verify user is a partner - redirect to regular home if not
    const isPartner = await this.checkPartnerStatus();
    if (!isPartner) {
      window.location.href = '/home';
      return;
    }

    // Render sidebar with partner home active
    AdminShared.renderSidebar('home');

    // Load partner data
    await this.loadPartnerData();

    // Update UI
    this.updateStats();
    this.updateOnboardingProgress();
    this.renderClientList();

    // Bind events
    this.bindEvents();
  }

  /**
   * Check if current user is a partner
   */
  async checkPartnerStatus() {
    if (typeof RevGuideDB === 'undefined') return false;

    try {
      // Check if user is a partner
      const isPartner = await RevGuideDB.isPartner();
      const isPartnerUser = AdminShared.isPartnerUser;
      const hasMultipleOrgs = AdminShared.userOrganizations?.length > 1;

      return isPartner || isPartnerUser || hasMultipleOrgs;
    } catch (error) {
      console.error('Error checking partner status:', error);
      return false;
    }
  }

  /**
   * Load partner-specific data
   */
  async loadPartnerData() {
    if (typeof RevGuideDB === 'undefined') return;

    try {
      // Get client portals (organizations where user is a partner/consultant)
      this.clients = AdminShared.userOrganizations || [];

      // Filter to only show client portals (not the user's home org)
      // For now, show all orgs - can refine later based on role

      // Get library count (from the libraries the partner has access to)
      // This would need a specific query - for now use a placeholder
      this.libraries = [];

    } catch (error) {
      console.error('Error loading partner data:', error);
    }
  }

  /**
   * Update the stats display
   */
  updateStats() {
    const clientCount = this.clients.length;
    const libraryCount = this.libraries.length;
    const deploymentCount = 0; // Would need to track deployments

    document.getElementById('partnerClientCount').textContent = clientCount;
    document.getElementById('partnerLibraryCount').textContent = libraryCount;
    document.getElementById('partnerDeploymentCount').textContent = deploymentCount;
  }

  /**
   * Update the onboarding progress
   */
  updateOnboardingProgress() {
    let completed = 1; // Install is always complete (they're logged in)

    const hasClients = this.clients.length > 0;
    const hasDeployments = false; // Would need to track deployments

    // Step 2: Connect to Client
    const stepClient = document.getElementById('partnerStepClient');
    const stepClientStatus = document.getElementById('partnerStepClientStatus');
    if (hasClients) {
      completed++;
      stepClient.classList.add('completed');
      stepClientStatus.textContent = `${this.clients.length} connected`;
      stepClientStatus.classList.add('completed');
    } else {
      stepClientStatus.textContent = 'Not started';
    }

    // Step 3: Deploy Content
    const stepDeploy = document.getElementById('partnerStepDeploy');
    const stepDeployStatus = document.getElementById('partnerStepDeployStatus');
    const browseLibrariesBtn = document.getElementById('partnerBrowseLibrariesBtn');

    if (hasDeployments) {
      completed++;
      stepDeploy.classList.add('completed');
      stepDeployStatus.textContent = 'Deployed';
      stepDeployStatus.classList.add('completed');
    } else if (hasClients) {
      // Enable the browse libraries button if they have clients
      stepDeployStatus.textContent = 'Ready';
      if (browseLibrariesBtn) {
        browseLibrariesBtn.disabled = false;
        browseLibrariesBtn.classList.remove('btn-ghost');
        browseLibrariesBtn.classList.add('btn-primary');
      }
    }

    // Update progress ring (3 steps total)
    const percentage = Math.round((completed / 3) * 100);
    this.updateProgressRing(document.getElementById('partnerProgressFill'), percentage);
    document.getElementById('partnerProgressText').textContent = completed;

    // Update progress description
    const progressDesc = document.getElementById('partnerProgressDesc');
    if (completed === 3) {
      progressDesc.textContent = 'Setup complete!';
    } else if (completed === 2) {
      progressDesc.textContent = 'Deploy content to complete setup';
    } else if (completed === 1) {
      progressDesc.textContent = 'Connect to a client portal to continue';
    }

    // Highlight next step
    this.highlightNextStep();

    // Show/hide all-set message vs onboarding
    const allSetMessage = document.getElementById('partnerAllSetMessage');
    const onboardingSteps = document.getElementById('partnerOnboardingSteps');
    const progressHero = document.getElementById('partnerProgressHero');

    if (completed === 3) {
      // All done - show success message, hide onboarding
      if (allSetMessage) allSetMessage.style.display = 'block';
      if (onboardingSteps) onboardingSteps.style.display = 'none';
      if (progressHero) progressHero.style.display = 'none';
    } else {
      // Still onboarding
      if (allSetMessage) allSetMessage.style.display = 'none';
      if (onboardingSteps) onboardingSteps.style.display = 'block';
      if (progressHero) progressHero.style.display = 'flex';
    }
  }

  /**
   * Render the client quick list
   */
  renderClientList() {
    const listContainer = document.getElementById('partnerClientList');
    const emptyState = document.getElementById('partnerClientsEmptyState');

    if (!listContainer) return;

    if (this.clients.length === 0) {
      listContainer.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    // Show up to 5 clients
    const clientsToShow = this.clients.slice(0, 5);

    listContainer.innerHTML = clientsToShow.map((client, index) => {
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
      const color = colors[index % colors.length];
      const name = client.organization_name || 'Unnamed Portal';
      const role = client.role || 'partner';

      return `
        <a href="/partner/accounts" class="client-quick-item" data-org-id="${client.organization_id}">
          <span class="client-color" style="background: ${color};"></span>
          <h4>${this.escapeHtml(name)}</h4>
          <div class="client-quick-stats">
            <span>${role}</span>
          </div>
          <svg class="arrow-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </a>
      `;
    }).join('');
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Bind event handlers
   */
  bindEvents() {
    // View Clients button
    const viewClientsBtn = document.getElementById('partnerViewClientsBtn');
    if (viewClientsBtn) {
      viewClientsBtn.addEventListener('click', () => {
        window.location.href = '/partner/accounts';
      });
    }

    // Browse Libraries button
    const browseLibrariesBtn = document.getElementById('partnerBrowseLibrariesBtn');
    if (browseLibrariesBtn) {
      browseLibrariesBtn.addEventListener('click', () => {
        window.location.href = '/libraries';
      });
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PartnerHomePage();
});
