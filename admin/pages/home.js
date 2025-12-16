/**
 * RevGuide - Home Page
 */

class HomePage {
  constructor() {
    this.data = {};
    this.init();
  }

  async init() {
    // Check authentication (redirects to login if not authenticated)
    const isAuthenticated = await AdminShared.checkAuth();
    if (!isAuthenticated) return;

    // Render sidebar
    AdminShared.renderSidebar('home');

    // Load data
    this.data = await AdminShared.loadStorageData();

    // Check HubSpot connection status (web context only)
    await this.checkHubSpotConnection();

    // Update UI
    this.updateHomeStats();
    this.updateOnboardingProgress();

    // Bind events
    this.bindEvents();
  }

  async checkHubSpotConnection() {
    // Only check in web context
    if (AdminShared.isExtensionContext) return;

    const connectBanner = document.getElementById('connectHubSpotBanner');
    if (!connectBanner) return;

    try {
      const hasConnection = await RevGuideDB.hasHubSpotConnection();

      if (!hasConnection) {
        // Show connect banner
        connectBanner.style.display = 'block';

        // Update Step 2 (API) status
        const stepApi = document.getElementById('stepApi');
        if (stepApi) {
          stepApi.classList.remove('completed');
          document.getElementById('stepApiStatus').textContent = 'Not connected';
          document.getElementById('stepApiStatus').classList.remove('completed');
        }
      } else {
        // Hide connect banner
        connectBanner.style.display = 'none';

        // Mark Step 2 as completed
        const stepApi = document.getElementById('stepApi');
        if (stepApi) {
          stepApi.classList.add('completed');
          document.getElementById('stepApiStatus').textContent = 'Connected';
          document.getElementById('stepApiStatus').classList.add('completed');
        }
      }
    } catch (error) {
      console.error('Error checking HubSpot connection:', error);
      // Show banner on error (safer to prompt connection)
      connectBanner.style.display = 'block';
    }
  }

  updateHomeStats() {
    document.getElementById('homeWikiCount').textContent = this.data.wikiEntries?.length || 0;
    document.getElementById('homeRulesCount').textContent = this.data.rules?.length || 0;
    document.getElementById('homeCardsCount').textContent = this.data.battleCards?.length || 0;
  }

  updateOnboardingProgress() {
    let completed = 1; // Install is always complete

    // In web context, use different logic
    if (!AdminShared.isExtensionContext) {
      // Check wiki entries
      if (this.data.wikiEntries?.length > 0) {
        completed++;
        document.getElementById('stepWiki').classList.add('completed');
        document.getElementById('stepWikiStatus').textContent = 'Completed';
        document.getElementById('stepWikiStatus').classList.add('completed');
      }

      // Check rules
      if (this.data.rules?.length > 0) {
        completed++;
        document.getElementById('stepRules').classList.add('completed');
        document.getElementById('stepRulesStatus').textContent = 'Completed';
        document.getElementById('stepRulesStatus').classList.add('completed');
      }

      // Check plays
      if (this.data.battleCards?.length > 0) {
        completed++;
        document.getElementById('stepCards').classList.add('completed');
        document.getElementById('stepCardsStatus').textContent = 'Completed';
        document.getElementById('stepCardsStatus').classList.add('completed');
      }

      // In web context, team members are fetched from Supabase
      // For now, mark as complete if user has organization
      if (AdminShared.currentOrganization) {
        completed++;
        document.getElementById('stepTeam').classList.add('completed');
        document.getElementById('stepTeamStatus').textContent = 'Completed';
        document.getElementById('stepTeamStatus').classList.add('completed');
      }

      // Update progress bar (6 steps total now)
      const percentage = Math.round((completed / 6) * 100);
      document.getElementById('onboardingProgressFill').style.width = `${percentage}%`;
      document.getElementById('onboardingProgressText').textContent = completed;
      return;
    }

    // In extension context, check Chrome storage
    chrome.storage.local.get(['apiToken', 'invitedUsers'], (storageData) => {
      if (storageData.apiToken) {
        completed++;
        document.getElementById('stepApi').classList.add('completed');
        document.getElementById('stepApiStatus').textContent = 'Completed';
        document.getElementById('stepApiStatus').classList.add('completed');
      }

      // Check wiki entries
      if (this.data.wikiEntries?.length > 0) {
        completed++;
        document.getElementById('stepWiki').classList.add('completed');
        document.getElementById('stepWikiStatus').textContent = 'Completed';
        document.getElementById('stepWikiStatus').classList.add('completed');
      }

      // Check rules
      if (this.data.rules?.length > 0) {
        completed++;
        document.getElementById('stepRules').classList.add('completed');
        document.getElementById('stepRulesStatus').textContent = 'Completed';
        document.getElementById('stepRulesStatus').classList.add('completed');
      }

      // Check plays
      if (this.data.battleCards?.length > 0) {
        completed++;
        document.getElementById('stepCards').classList.add('completed');
        document.getElementById('stepCardsStatus').textContent = 'Completed';
        document.getElementById('stepCardsStatus').classList.add('completed');
      }

      // Check invited users
      const invitedUsers = storageData.invitedUsers || [];
      if (invitedUsers.length > 0) {
        completed++;
        document.getElementById('stepTeam').classList.add('completed');
        document.getElementById('stepTeamStatus').textContent = 'Completed';
        document.getElementById('stepTeamStatus').classList.add('completed');
      }

      // Update progress bar (6 steps total now)
      const percentage = Math.round((completed / 6) * 100);
      document.getElementById('onboardingProgressFill').style.width = `${percentage}%`;
      document.getElementById('onboardingProgressText').textContent = completed;
    });
  }

  bindEvents() {
    // Connect HubSpot button in banner
    const connectHubSpotBtn = document.getElementById('connectHubSpotBtn');
    if (connectHubSpotBtn) {
      connectHubSpotBtn.addEventListener('click', () => this.connectHubSpot());
    }

    // Navigate to Settings > Team Members to invite users
    document.getElementById('stepInstallBtn').addEventListener('click', () => {
      window.location.href = 'settings.html#team-members';
    });

    // Navigate to settings (or trigger HubSpot connect in web context)
    document.getElementById('stepApiBtn').addEventListener('click', () => {
      if (!AdminShared.isExtensionContext) {
        this.connectHubSpot();
      } else {
        window.location.href = 'settings.html';
      }
    });

    // Navigate to wiki with import
    document.getElementById('stepWikiImportBtn').addEventListener('click', () => {
      window.location.href = 'wiki.html?action=import';
    });

    // Navigate to wiki with add
    document.getElementById('stepWikiAddBtn').addEventListener('click', () => {
      window.location.href = 'wiki.html?action=add';
    });

    // Navigate to banners
    document.getElementById('stepRulesBtn').addEventListener('click', () => {
      window.location.href = 'banners.html?action=add';
    });

    // Navigate to plays
    document.getElementById('stepCardsBtn').addEventListener('click', () => {
      window.location.href = 'plays.html?action=add';
    });

    // Navigate to team members
    document.getElementById('stepTeamBtn').addEventListener('click', () => {
      window.location.href = 'settings.html#team-members';
    });
  }

  async connectHubSpot() {
    const connectBtn = document.getElementById('connectHubSpotBtn');
    const stepApiBtn = document.getElementById('stepApiBtn');

    // Disable buttons and show loading
    if (connectBtn) {
      connectBtn.disabled = true;
      connectBtn.innerHTML = `
        <svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
          <circle cx="12" cy="12" r="10"/>
        </svg>
        Connecting...
      `;
    }
    if (stepApiBtn) {
      stepApiBtn.disabled = true;
      stepApiBtn.textContent = 'Connecting...';
    }

    try {
      // Generate unique connection ID
      const connectionId = 'conn_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

      // Get current organization ID
      const orgId = await RevGuideDB.getOrganizationId();

      // Start Nango OAuth flow
      const result = await RevGuideNango.connectHubSpot(connectionId);

      if (result.success) {
        // Get portal info
        const portalInfo = await RevGuideNango.getPortalInfo(connectionId);

        if (portalInfo && orgId) {
          // Create HubSpot connection record
          await RevGuideDB.createHubSpotConnection({
            organization_id: orgId,
            portal_id: portalInfo.portalId,
            portal_domain: portalInfo.portalDomain,
            portal_name: portalInfo.portalName,
            nango_connection_id: connectionId
          });

          // Update organization with portal info
          await RevGuideDB.updateOrganization({
            hubspot_portal_id: portalInfo.portalId,
            hubspot_portal_domain: portalInfo.portalDomain,
            nango_connection_id: connectionId
          });

          // Success - hide banner and update UI
          const connectBanner = document.getElementById('connectHubSpotBanner');
          if (connectBanner) {
            connectBanner.style.display = 'none';
          }

          // Mark API step as completed
          const stepApi = document.getElementById('stepApi');
          if (stepApi) {
            stepApi.classList.add('completed');
            document.getElementById('stepApiStatus').textContent = 'Connected';
            document.getElementById('stepApiStatus').classList.add('completed');
          }

          AdminShared.showToast('HubSpot connected successfully!', 'success');

          // Recalculate onboarding progress
          this.updateOnboardingProgress();
        }
      } else {
        AdminShared.showToast(result.error || 'Failed to connect HubSpot', 'error');
        this.resetConnectButtons();
      }
    } catch (error) {
      console.error('HubSpot connection error:', error);
      AdminShared.showToast('Failed to connect HubSpot. Please try again.', 'error');
      this.resetConnectButtons();
    }
  }

  resetConnectButtons() {
    const connectBtn = document.getElementById('connectHubSpotBtn');
    const stepApiBtn = document.getElementById('stepApiBtn');

    if (connectBtn) {
      connectBtn.disabled = false;
      connectBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M18.164 7.93V5.084a2.198 2.198 0 001.267-1.984 2.21 2.21 0 00-2.212-2.212 2.21 2.21 0 00-2.212 2.212c0 .863.502 1.609 1.227 1.968v2.879a5.197 5.197 0 00-2.382 1.193l-6.376-4.96a2.567 2.567 0 00.09-.62 2.453 2.453 0 00-2.455-2.456A2.453 2.453 0 002.656 3.56a2.453 2.453 0 002.455 2.456c.405 0 .784-.103 1.12-.28l6.272 4.879a5.19 5.19 0 00-.701 2.605 5.222 5.222 0 005.222 5.222 5.222 5.222 0 005.222-5.222 5.207 5.207 0 00-4.082-5.089zm-1.14 7.526a2.637 2.637 0 01-2.639-2.639 2.637 2.637 0 012.639-2.639 2.637 2.637 0 012.639 2.639 2.637 2.637 0 01-2.639 2.639z"/>
        </svg>
        Connect HubSpot
      `;
    }
    if (stepApiBtn) {
      stepApiBtn.disabled = false;
      stepApiBtn.textContent = 'Connect HubSpot';
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new HomePage();
});
