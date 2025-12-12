/**
 * HubSpot Helper - Home Page
 */

class HomePage {
  constructor() {
    this.data = {};
    this.init();
  }

  async init() {
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

    // Check API connection
    chrome.storage.local.get(['apiToken'], (data) => {
      if (data.apiToken) {
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

      // Update progress bar
      const percentage = Math.round((completed / 5) * 100);
      document.getElementById('onboardingProgressFill').style.width = `${percentage}%`;
      document.getElementById('onboardingProgressText').textContent = completed;
    });
  }

  bindEvents() {
    // Share install instructions
    document.getElementById('stepInstallBtn').addEventListener('click', () => {
      const shareText = `Install HubSpot Helper to get contextual guidance on HubSpot records:\n\n1. Download the extension files\n2. Go to chrome://extensions/\n3. Enable "Developer mode"\n4. Click "Load unpacked" and select the folder`;

      if (navigator.clipboard) {
        navigator.clipboard.writeText(shareText).then(() => {
          AdminShared.showToast('Install instructions copied to clipboard!', 'success');
        }).catch(() => {
          prompt('Copy these instructions to share with your team:', shareText);
        });
      } else {
        prompt('Copy these instructions to share with your team:', shareText);
      }
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
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new HomePage();
});
