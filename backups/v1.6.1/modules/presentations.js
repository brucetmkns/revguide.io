/**
 * HubSpot Helper - Presentations Module
 *
 * Handles the display of embedded presentations/media content on HubSpot record pages.
 * Shows collapsible cards with embedded iframes for presentations that match
 * the current record's conditions.
 *
 * Features:
 * - Filters presentations based on conditions (property values, object type)
 * - Renders collapsible presentation cards with embedded iframes
 * - Handles iframe load errors with fallback UI
 * - Positions cards after banners if present
 *
 * Dependencies:
 * - Requires RulesEngine for evaluating display conditions
 * - Uses shared utilities (escapeHtml) from main content.js
 *
 * Usage:
 *   const presentations = new PresentationsModule(helper);
 *   const matching = presentations.getMatching();
 *   presentations.render(matching);
 *   presentations.cleanup();
 */

class PresentationsModule {
  /**
   * @param {Object} helper - Reference to main HubSpotHelper instance
   * @param {Object} helper.settings - User settings including showPresentations
   * @param {Array} helper.presentations - Array of presentation objects
   * @param {Object} helper.properties - Current page properties
   * @param {Object} helper.rulesEngine - Rules engine for condition evaluation
   * @param {Function} helper.escapeHtml - HTML escape utility
   * @param {Function} helper.findInjectTarget - Finds DOM target for injection
   */
  constructor(helper) {
    this.helper = helper;
  }

  // ============ MATCHING ============

  /**
   * Get presentations that match the current page context
   * @returns {Array} Array of matching presentation objects
   */
  getMatching() {
    const presentations = this.helper.presentations || [];

    return presentations.filter(pres => {
      // Skip disabled presentations
      if (pres.enabled === false) return false;

      // If displayOnAll is true, always show
      if (pres.displayOnAll) {
        return true;
      }

      // No conditions = matches all
      if (!pres.conditions || pres.conditions.length === 0) {
        return true;
      }

      // Evaluate conditions using rules engine
      return this.helper.rulesEngine.evaluateRule(
        { conditions: pres.conditions, logic: pres.logic || 'AND' },
        this.helper.properties
      );
    });
  }

  // ============ RENDERING ============

  /**
   * Render presentation cards
   * @param {Array} presentations - Array of matching presentation objects
   */
  render(presentations) {
    // Check if setting is enabled
    if (this.helper.settings.showPresentations === false) {
      return;
    }

    if (!presentations || presentations.length === 0) {
      return;
    }

    const injectTarget = this.helper.findInjectTarget();

    if (!injectTarget) {
      this.log('No inject target found for presentations');
      return;
    }

    presentations.forEach(pres => {
      // Skip if already rendered
      const existingCard = document.getElementById(`hshelper-pres-${pres.id}`);
      if (existingCard) {
        this.log('Presentation card already exists:', pres.id);
        return;
      }

      const presCard = this.createCard(pres);

      // Insert after banners if they exist, otherwise at beginning
      const bannersContainer = document.getElementById('hshelper-banners');
      if (bannersContainer && bannersContainer.nextSibling) {
        injectTarget.insertBefore(presCard, bannersContainer.nextSibling);
      } else if (bannersContainer) {
        injectTarget.appendChild(presCard);
      } else {
        injectTarget.insertBefore(presCard, injectTarget.firstChild);
      }
    });
  }

  /**
   * Create a presentation card element
   * @param {Object} pres - Presentation object
   * @returns {HTMLElement} The card element
   */
  createCard(pres) {
    const presCard = document.createElement('div');
    presCard.className = 'hshelper-presentation-card';
    presCard.id = `hshelper-pres-${pres.id}`;

    presCard.innerHTML = `
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
            <div class="hshelper-presentation-title">${this.helper.escapeHtml(pres.name)}</div>
            ${pres.description ? `<div class="hshelper-presentation-description">${this.helper.escapeHtml(pres.description)}</div>` : ''}
          </div>
        </div>
        <div class="hshelper-presentation-actions">
          <a href="${this.helper.escapeHtml(pres.url)}" target="_blank" rel="noopener noreferrer" class="hshelper-presentation-link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Open in Library
          </a>
          <button class="hshelper-presentation-toggle" aria-label="Toggle presentation">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>
      </div>
      <div class="hshelper-presentation-embed">
        <iframe
          src="${this.helper.escapeHtml(pres.embedUrl)}"
          frameborder="0"
          allowfullscreen="true"
          mozallowfullscreen="true"
          webkitallowfullscreen="true">
        </iframe>
        <div class="hshelper-presentation-fallback">
          <span>
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 3h20"/>
              <path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/>
              <path d="m7 21 5-5 5 5"/>
            </svg>
          </span>
          <p>Unable to load presentation preview</p>
          <a href="${this.helper.escapeHtml(pres.url)}" target="_blank" rel="noopener noreferrer">Open presentation directly</a>
        </div>
      </div>
    `;

    // Setup iframe load handlers
    this.setupIframeHandlers(presCard);

    // Setup toggle functionality
    this.setupToggle(presCard);

    return presCard;
  }

  /**
   * Set up iframe load/error handlers
   * @param {HTMLElement} presCard - The card element
   */
  setupIframeHandlers(presCard) {
    const iframe = presCard.querySelector('iframe');
    const fallback = presCard.querySelector('.hshelper-presentation-fallback');

    iframe.addEventListener('load', () => {
      // Hide fallback on successful load
      fallback.style.display = 'none';
    });

    iframe.addEventListener('error', () => {
      // Show fallback on error
      iframe.style.display = 'none';
      fallback.style.display = 'flex';
    });
  }

  /**
   * Set up toggle (expand/collapse) functionality
   * @param {HTMLElement} presCard - The card element
   */
  setupToggle(presCard) {
    const toggleBtn = presCard.querySelector('.hshelper-presentation-toggle');
    const header = presCard.querySelector('.hshelper-presentation-header');

    const togglePresentation = (e) => {
      e.preventDefault();
      e.stopPropagation();
      presCard.classList.toggle('collapsed');
      this.log('Presentation toggled, collapsed:', presCard.classList.contains('collapsed'));
    };

    toggleBtn.addEventListener('click', togglePresentation);
    header.addEventListener('click', (e) => {
      // Only toggle if clicking header directly, not the external link
      if (!e.target.closest('.hshelper-presentation-link')) {
        togglePresentation(e);
      }
    });
  }

  // ============ CLEANUP ============

  /**
   * Remove all presentation cards
   */
  cleanup() {
    const cards = document.querySelectorAll('.hshelper-presentation-card');
    cards.forEach(card => card.remove());
  }

  /**
   * Log message with prefix
   * @param {...any} args - Arguments to log
   */
  log(...args) {
    console.log('[HubSpot Helper]', ...args);
  }
}

// Export for use in content.js
if (typeof window !== 'undefined') {
  window.PresentationsModule = PresentationsModule;
}
