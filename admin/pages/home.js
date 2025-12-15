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

    // Update UI
    this.updateHomeStats();
    this.updateOnboardingProgress();

    // Bind events
    this.bindEvents();
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
    // Navigate to Settings > Team Members to invite users
    document.getElementById('stepInstallBtn').addEventListener('click', () => {
      window.location.href = 'settings.html#team-members';
    });

    // Navigate to settings
    document.getElementById('stepApiBtn').addEventListener('click', () => {
      window.location.href = 'settings.html';
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
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new HomePage();
});
