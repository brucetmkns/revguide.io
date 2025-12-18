/**
 * RevGuide - Banners Module
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
    this.playsCache = null; // Cache for plays lookup

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
    console.log('[RevGuide Banners] render() called with', rules.length, 'rules, showBanners:', this.helper.settings.showBanners);
    if (!this.helper.settings.showBanners || rules.length === 0) {
      console.log('[RevGuide Banners] Skipping render - showBanners:', this.helper.settings.showBanners, 'rules.length:', rules.length);
      return;
    }

    const injectTarget = this.helper.findInjectTarget();
    console.log('[RevGuide Banners] Inject target found:', injectTarget?.tagName, injectTarget?.className?.substring?.(0, 50));

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
    // Handle embed type banners differently - render as collapsible media card
    if (rule.type === 'embed') {
      return this.createEmbedBanner(rule);
    }

    const banner = document.createElement('div');
    banner.className = `hshelper-banner ${rule.type || 'info'}`;
    banner.dataset.ruleId = rule.id;

    // Build admin edit link if enabled and user can edit content
    const showAdminLinks = this.helper.settings.showAdminLinks !== false && this.helper.settings.canEditContent !== false;
    const adminEditLink = showAdminLinks ? `
      <a href="#" class="hshelper-admin-edit-link" data-rule-id="${rule.id}" title="Edit in Admin Panel">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Edit
      </a>
    ` : '';

    // Build related play button if a play is linked
    console.log('[RevGuide] Banner rule:', rule.id, 'relatedPlayId:', rule.relatedPlayId);
    const relatedPlayBtn = rule.relatedPlayId ? `
      <button class="hshelper-banner-play-btn" data-play-id="${rule.relatedPlayId}" title="Open linked play in sidepanel">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>
        Open Play
      </button>
    ` : '';

    banner.innerHTML = `
      <div class="hshelper-banner-icon">${this.icons[rule.type] || this.icons.info}</div>
      <div class="hshelper-banner-content">
        <div class="hshelper-banner-title">${this.helper.escapeHtml(rule.title || rule.name)}${adminEditLink}</div>
        <div class="hshelper-banner-message">${this.helper.sanitizeRichText(rule.message || '')}</div>
        ${rule.actions ? this.renderActions(rule.actions) : ''}
        ${relatedPlayBtn}
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

    // Handle admin edit link click
    const editLink = banner.querySelector('.hshelper-admin-edit-link');
    if (editLink) {
      editLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openAdminEditor('banners', rule.id);
      });
    }

    // Handle related play button click
    const playBtn = banner.querySelector('.hshelper-banner-play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openPlayInSidepanel(rule.relatedPlayId);
      });
    }

    return banner;
  }

  /**
   * Create an embed/media banner as a collapsible card
   * @param {Object} rule - Rule object containing embed configuration
   * @returns {HTMLElement} The embed card DOM element
   */
  createEmbedBanner(rule) {
    const card = document.createElement('div');
    card.className = 'hshelper-presentation-card';
    card.id = `hshelper-embed-${rule.id}`;
    card.dataset.ruleId = rule.id;

    // Build admin edit link if enabled and user can edit content
    const showAdminLinks = this.helper.settings.showAdminLinks !== false && this.helper.settings.canEditContent !== false;
    const adminEditLink = showAdminLinks ? `
      <a href="#" class="hshelper-admin-edit-link" data-rule-id="${rule.id}" title="Edit in Admin Panel">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Edit
      </a>
    ` : '';

    // Use embedUrl for iframe, fall back to url
    const embedUrl = rule.embedUrl || rule.url || '';
    const originalUrl = rule.url || rule.embedUrl || '';

    card.innerHTML = `
      <div class="hshelper-presentation-header">
        <div class="hshelper-presentation-info">
          <span class="hshelper-presentation-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 3h20"/>
              <path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/>
              <path d="m7 21 5-5 5 5"/>
            </svg>
          </span>
          <div>
            <div class="hshelper-presentation-title">${this.helper.escapeHtml(rule.title || rule.name)}${adminEditLink}</div>
          </div>
        </div>
        <div class="hshelper-presentation-actions">
          ${originalUrl ? `
          <a href="${this.helper.escapeHtml(originalUrl)}" target="_blank" rel="noopener noreferrer" class="hshelper-presentation-link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Open Media
          </a>
          ` : ''}
          <button class="hshelper-presentation-toggle" aria-label="Toggle media">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>
      </div>
      <div class="hshelper-presentation-embed">
        ${embedUrl ? `
        <iframe
          src="${this.helper.escapeHtml(embedUrl)}"
          frameborder="0"
          allowfullscreen="true"
          mozallowfullscreen="true"
          webkitallowfullscreen="true">
        </iframe>
        ` : ''}
        <div class="hshelper-presentation-fallback" ${embedUrl ? 'style="display: none;"' : ''}>
          <span>
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 3h20"/>
              <path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/>
              <path d="m7 21 5-5 5 5"/>
            </svg>
          </span>
          <p>Unable to load media preview</p>
          ${originalUrl ? `<a href="${this.helper.escapeHtml(originalUrl)}" target="_blank" rel="noopener noreferrer">Open media directly</a>` : ''}
        </div>
      </div>
    `;

    // Setup iframe load handlers
    const iframe = card.querySelector('iframe');
    const fallback = card.querySelector('.hshelper-presentation-fallback');

    if (iframe) {
      iframe.addEventListener('load', () => {
        fallback.style.display = 'none';
      });

      iframe.addEventListener('error', () => {
        iframe.style.display = 'none';
        fallback.style.display = 'flex';
      });
    }

    // Setup toggle functionality
    const toggleBtn = card.querySelector('.hshelper-presentation-toggle');
    const header = card.querySelector('.hshelper-presentation-header');

    const toggleCard = (e) => {
      e.preventDefault();
      e.stopPropagation();
      card.classList.toggle('collapsed');
    };

    toggleBtn.addEventListener('click', toggleCard);
    header.addEventListener('click', (e) => {
      // Only toggle if clicking header directly, not links
      if (!e.target.closest('.hshelper-presentation-link') && !e.target.closest('.hshelper-admin-edit-link')) {
        toggleCard(e);
      }
    });

    // Handle admin edit link click
    const editLink = card.querySelector('.hshelper-admin-edit-link');
    if (editLink) {
      editLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openAdminEditor('banners', rule.id);
      });
    }

    return card;
  }

  /**
   * Open admin panel to edit a specific asset
   * @param {string} assetType - Type of asset ('banners', 'plays', 'wiki')
   * @param {string} assetId - ID of the asset to edit
   */
  openAdminEditor(assetType, assetId) {
    const adminUrl = chrome.runtime.getURL(`admin/pages/${assetType}.html?edit=${assetId}`);
    window.open(adminUrl, '_blank');
  }

  /**
   * Open a specific play in the sidepanel
   * @param {string} playId - The ID of the play to open
   */
  openPlayInSidepanel(playId) {
    console.log('[RevGuide] Opening play in sidepanel:', playId);

    // Fetch the play data via background script (handles cloud vs local)
    chrome.runtime.sendMessage({ action: 'getContent' }, (response) => {
      if (chrome.runtime.lastError) {
        console.log('[RevGuide] Error getting content:', chrome.runtime.lastError.message);
        return;
      }

      const battleCards = response?.content?.battleCards || [];
      const play = battleCards.find(p => p.id === playId);

      if (!play) {
        console.log('[RevGuide] Play not found:', playId);
        return;
      }

      // Send the play data along with the open request
      chrome.runtime.sendMessage({
        action: 'openSidePanelToPlay',
        playId: playId,
        playData: play
      }, (resp) => {
        if (chrome.runtime.lastError) {
          console.log('[RevGuide] Error opening sidepanel to play:', chrome.runtime.lastError.message);
        }
      });
    });
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
        console.log('[RevGuide] Unknown action type:', action.type);
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
