/**
 * HubSpot Helper - Banners Module
 *
 * Handles the rendering and management of contextual banners/alerts
 * that appear at the top of HubSpot record pages based on rule conditions.
 *
 * Features:
 * - Renders info, success, warning, error, and battle-card type banners
 * - Supports rule-based conditional display
 * - Allows dismissing banners (persists during session)
 * - Supports action buttons with URL or custom actions
 *
 * Dependencies:
 * - Requires RulesEngine for evaluating display conditions
 * - Uses shared utilities (escapeHtml, sanitizeRichText) from main content.js
 *
 * Usage:
 *   const banners = new BannersModule(helper);
 *   banners.render(matchingRules);
 *   banners.cleanup();
 */

class BannersModule {
  /**
   * @param {Object} helper - Reference to main HubSpotHelper instance
   * @param {Object} helper.settings - User settings including showBanners, bannerPosition
   * @param {Function} helper.escapeHtml - HTML escape utility
   * @param {Function} helper.sanitizeRichText - Rich text sanitizer
   * @param {Function} helper.findInjectTarget - Finds DOM target for injection
   */
  constructor(helper) {
    this.helper = helper;
    this.activeBanners = new Map();
    this.dismissedBanners = new Set();

    // Banner type icons (SVG)
    this.icons = {
      info: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
      success: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>',
      warning: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
      error: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
      'battle-card': '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>'
    };
  }

  /**
   * Render banners for matching rules
   * @param {Array} rules - Array of rule objects that matched current context
   */
  render(rules) {
    if (!this.helper.settings.showBanners || rules.length === 0) {
      return;
    }

    const injectTarget = this.helper.findInjectTarget();

    if (injectTarget) {
      // Create inline banner container
      const bannerContainer = document.createElement('div');
      bannerContainer.className = 'hshelper-banner-container inline';
      bannerContainer.id = 'hshelper-banners';

      rules.forEach(rule => {
        if (this.dismissedBanners.has(rule.id)) return;
        const banner = this.createBanner(rule);
        bannerContainer.appendChild(banner);
        this.activeBanners.set(rule.id, banner);
      });

      // Insert at the beginning of the target
      injectTarget.insertBefore(bannerContainer, injectTarget.firstChild);
    } else {
      // Fallback to fixed overlay
      const bannerContainer = document.createElement('div');
      bannerContainer.className = `hshelper-banner-container ${this.helper.settings.bannerPosition}`;
      bannerContainer.id = 'hshelper-banners';
      document.getElementById('hshelper-container').appendChild(bannerContainer);

      rules.forEach(rule => {
        if (this.dismissedBanners.has(rule.id)) return;
        const banner = this.createBanner(rule);
        bannerContainer.appendChild(banner);
        this.activeBanners.set(rule.id, banner);
      });
    }
  }

  /**
   * Create a single banner element
   * @param {Object} rule - Rule object containing banner configuration
   * @returns {HTMLElement} The banner DOM element
   */
  createBanner(rule) {
    const banner = document.createElement('div');
    banner.className = `hshelper-banner ${rule.type || 'info'}`;
    banner.dataset.ruleId = rule.id;

    banner.innerHTML = `
      <div class="hshelper-banner-icon">${this.icons[rule.type] || this.icons.info}</div>
      <div class="hshelper-banner-content">
        <div class="hshelper-banner-title">${this.helper.escapeHtml(rule.title || rule.name)}</div>
        <div class="hshelper-banner-message">${this.helper.sanitizeRichText(rule.message || '')}</div>
        ${rule.actions ? this.renderActions(rule.actions) : ''}
      </div>
      <button class="hshelper-banner-close" aria-label="Dismiss">×</button>
    `;

    // Handle close button
    banner.querySelector('.hshelper-banner-close').addEventListener('click', () => {
      this.dismiss(rule.id);
    });

    // Handle action button clicks
    banner.querySelectorAll('.hshelper-banner-btn').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        this.handleAction(rule.actions[i]);
      });
    });

    return banner;
  }

  /**
   * Render action buttons HTML
   * @param {Array} actions - Array of action objects
   * @returns {string} HTML string for action buttons
   */
  renderActions(actions) {
    if (!actions || actions.length === 0) return '';

    return `
      <div class="hshelper-banner-actions">
        ${actions.map((action, i) => `
          <button class="hshelper-banner-btn ${i === 0 ? 'primary' : 'secondary'}">
            ${this.helper.escapeHtml(action.label)}
          </button>
        `).join('')}
      </div>
    `;
  }

  /**
   * Handle action button click
   * @param {Object} action - Action object with type and configuration
   */
  handleAction(action) {
    if (!action) return;

    switch (action.type) {
      case 'url':
        window.open(action.url, '_blank', 'noopener,noreferrer');
        break;
      case 'copy':
        navigator.clipboard.writeText(action.text || '');
        break;
      default:
        console.log('[HubSpot Helper] Unknown action type:', action.type);
    }
  }

  /**
   * Dismiss a banner by rule ID
   * @param {string} ruleId - The rule ID to dismiss
   */
  dismiss(ruleId) {
    this.dismissedBanners.add(ruleId);
    const banner = this.activeBanners.get(ruleId);
    if (banner) {
      banner.style.animation = 'hshelper-slideIn 0.2s ease-out reverse';
      setTimeout(() => banner.remove(), 200);
      this.activeBanners.delete(ruleId);
    }
  }

  /**
   * Check if banners are currently visible
   * @returns {boolean} True if banners container is visible
   */
  isVisible() {
    const banner = document.getElementById('hshelper-banners');
    return banner && banner.offsetParent !== null;
  }

  /**
   * Clean up all banners and reset state
   * @param {boolean} full - If true, also clears dismissed list
   */
  cleanup(full = false) {
    // Remove banner containers
    const containers = document.querySelectorAll('#hshelper-banners, .hshelper-banner-container');
    containers.forEach(c => c.remove());

    // Clear active banners map
    this.activeBanners.clear();

    // Optionally clear dismissed list (for full re-init)
    if (full) {
      this.dismissedBanners.clear();
    }
  }
}

// Export for use in content.js
if (typeof window !== 'undefined') {
  window.BannersModule = BannersModule;
}
