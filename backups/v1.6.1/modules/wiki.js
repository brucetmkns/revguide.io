/**
 * HubSpot Helper - Wiki Module
 *
 * Handles wiki/glossary term highlighting and tooltips on HubSpot pages.
 * Scans the page for property labels that match wiki entries and adds
 * clickable icons that show definition tooltips.
 *
 * Features:
 * - Matches property labels to wiki terms and aliases
 * - Adds lightbulb icons next to matching labels
 * - Shows tooltip with definition on icon click
 * - Supports record pages and index/list pages
 * - Handles lazy-loaded content via observers and scroll listeners
 * - Prevents duplicate icons and infinite loops
 *
 * Dependencies:
 * - Uses shared utilities (escapeHtml) from main content.js
 * - Requires wikiEntries array from storage
 *
 * Usage:
 *   const wiki = new WikiModule(helper);
 *   wiki.apply();           // Apply highlighting
 *   wiki.applyForIndex();   // Apply for index pages with multi-pass
 *   wiki.remove();          // Remove all highlighting
 *   wiki.cleanup();         // Full cleanup including observers
 */

class WikiModule {
  /**
   * @param {Object} helper - Reference to main HubSpotHelper instance
   * @param {Object} helper.settings - User settings including showWiki
   * @param {Array} helper.wikiEntries - Array of wiki entry objects
   * @param {Function} helper.escapeHtml - HTML escape utility
   * @param {Function} helper.isIndexPage - Check if on index page
   */
  constructor(helper) {
    this.helper = helper;
    this.wikiObserver = null;
    this.wikiTooltipActive = false;
    this.wikiHighlightsApplied = false;
    this.isApplyingWikiHighlights = false;
    this.wikiUpdateTimeout = null;

    // Bind the outside click handler so we can remove it later
    this.handleOutsideTooltipClick = this.handleOutsideTooltipClick.bind(this);
  }

  // ============ PROPERTY LABEL SELECTORS ============
  // These selectors target HubSpot DOM elements that contain property labels

  /**
   * Get CSS selectors for property label elements
   * @returns {string[]} Array of CSS selectors
   */
  getPropertyLabelSelectors() {
    return [
      // HubSpot property labels
      '[data-selenium-test*="property-label"]',
      '[class*="PropertyLabel"]',
      '[class*="property-label"]',
      'label[class*="UIForm"]',
      // Sidebar property labels (left panel)
      '[data-test-id="left-sidebar"] [class*="label"]',
      '[data-test-id="left-sidebar"] [class*="Label"]',
      // Property row labels
      '[data-selenium-test="property-input"] [class*="label"]',
      // Pipeline/Stage labels in header area
      '[data-test-id="pipeline-stage-label"]',
      '[data-test-id="pipeline-label"]',
      // Card-based property labels (newer HubSpot UI)
      '[data-test-id="left-sidebar"] [class*="truncate"]',
      '[data-test-id="left-sidebar"] [class*="Truncate"]',
      '[data-test-id="left-sidebar"] [class*="private-truncated"]',
      // Property list items - the label part
      '[data-test-id="left-sidebar"] [class*="property"] span:first-child',
      '[data-test-id="left-sidebar"] [class*="Property"] span:first-child',
      // Highlighted property sidebar specific
      '[data-selenium-test="highlightedPropertySidebar"] [class*="label"]',
      '[data-selenium-test="highlightedPropertySidebar"] [class*="Label"]',
      '[data-selenium-test="highlightedPropertySidebar"] [class*="truncate"]',
      // Generic HubSpot form labels
      '[class*="UIFormControl"] label',
      '[class*="FormLabel"]',
      // Index/List page table headers
      'th[data-test-id]',
      'th [class*="column"]',
      'th [class*="Column"]',
      '[data-test-id="table"] th',
      '[class*="TableHeader"]',
      '[class*="table-header"]',
      'th button span',
      'th [class*="truncate"]',
      // Column header buttons (sortable columns)
      '[role="columnheader"]',
      '[role="columnheader"] span',
      '[role="columnheader"] button span',
      // Filter panel labels
      '[data-test-id="filter-panel"] label',
      '[data-test-id="filter-panel"] [class*="label"]',
      '[data-test-id="filter-panel"] [class*="Label"]',
      '[class*="FilterEditor"] label',
      '[class*="FilterEditor"] [class*="label"]',
      '[class*="filter-property"] label',
      '[class*="filter-property"] [class*="label"]',
      '[class*="FilterProperty"] label',
      '[class*="FilterProperty"] span',
      // Quick filters / saved filters
      '[data-test-id="quick-filter"]',
      '[class*="QuickFilter"] span',
      // Property filter dropdowns
      '[class*="propertyFilter"] label',
      '[class*="PropertyFilter"] label',
      '[data-selenium-test*="filter"] label',
      // Generic filter labels
      '[class*="filter"] label:not([class*="input"])',
      '[class*="Filter"] label:not([class*="input"])',
      // Filter dropdown buttons
      '[class*="DropdownButtonLabel"] [class*="TruncateString"] span:not([class])',
      '[class*="AbstractDropdown"] [class*="TruncateStringInner"] span',
      '[data-dropdown="true"] [class*="TruncateStringInner"] span',
      '[class*="FilterEditor"] [class*="TruncateString"] span:not([class])'
    ];
  }

  // ============ MAIN APPLY METHOD ============

  /**
   * Apply wiki highlighting to the page
   * Scans for property labels and adds icons to matching terms
   */
  apply() {
    // Prevent re-entry
    if (this.isApplyingWikiHighlights) {
      this.log('Already applying wiki highlights, skipping');
      return;
    }

    this.isApplyingWikiHighlights = true;
    this.log('>>> applyWikiHighlighting() starting');

    // Disconnect observer to prevent infinite loop while modifying DOM
    if (this.wikiObserver) {
      this.wikiObserver.disconnect();
    }

    // Remove existing highlights if re-applying
    if (this.wikiHighlightsApplied) {
      this.log('Removing existing highlights first');
      this.remove();
    }

    const wikiEntries = this.helper.wikiEntries || [];
    const enabledEntries = wikiEntries.filter(e => e.enabled !== false);
    this.log('Wiki entries to highlight (enabled):', enabledEntries.length);

    if (enabledEntries.length === 0) {
      this.log('No enabled wiki entries, exiting');
      this.isApplyingWikiHighlights = false;
      if (!this.helper.isIndexPage()) {
        this.reconnectObserver();
      }
      return;
    }

    // Build term map (term/alias -> entry)
    const termMap = this.buildTermMap(enabledEntries);
    this.log('Term map built with', termMap.size, 'terms');

    let totalHighlights = 0;

    // Method 1: Property label selectors
    totalHighlights += this.applyMethod1(termMap);

    // Method 2: Sidebar list items
    totalHighlights += this.applyMethod2(termMap);

    // Method 3: Supered-wrapped elements
    totalHighlights += this.applyMethod3(termMap);

    // Method 4: Specific property name patterns
    totalHighlights += this.applyMethod4(termMap);

    // Method 5: Aggressive scan of left sidebar
    totalHighlights += this.applyMethod5(termMap);

    this.wikiHighlightsApplied = true;
    this.log('Wiki highlighting applied, total highlights:', totalHighlights);

    // Reconnect observer (but not on index pages)
    this.isApplyingWikiHighlights = false;
    if (!this.helper.isIndexPage()) {
      this.reconnectObserver();
    }
  }

  /**
   * Apply wiki highlighting for index pages
   * Uses multiple delayed passes to handle lazy-loaded content
   */
  applyForIndex() {
    this.log('applyWikiHighlightingForIndex called');

    if (this.helper.settings.showWiki === false) {
      this.log('Wiki disabled, skipping index highlighting');
      return;
    }
    if (!this.helper.wikiEntries || this.helper.wikiEntries.length === 0) {
      this.log('No wiki entries, skipping index highlighting');
      return;
    }

    // Apply with delays for lazy-loaded content
    this.log('Scheduling wiki highlighting passes...');
    setTimeout(() => {
      this.log('Index wiki pass 1 (500ms)');
      this.apply();
    }, 500);
    setTimeout(() => {
      this.log('Index wiki pass 2 (1500ms)');
      this.apply();
    }, 1500);
    setTimeout(() => {
      this.log('Index wiki pass 3 (3000ms)');
      this.apply();
    }, 3000);
  }

  // ============ HIGHLIGHTING METHODS ============

  /**
   * Build a map of terms/aliases to wiki entries
   * @param {Array} entries - Enabled wiki entries
   * @returns {Map} Map of lowercase term -> entry
   */
  buildTermMap(entries) {
    const termMap = new Map();
    for (const entry of entries) {
      const terms = [entry.term, ...(entry.aliases || [])];
      for (const term of terms) {
        if (term && term.trim()) {
          termMap.set(term.toLowerCase().trim(), entry);
        }
      }
    }
    return termMap;
  }

  /**
   * Method 1: Find property labels using CSS selectors
   * @param {Map} termMap - Term to entry map
   * @returns {number} Number of highlights added
   */
  applyMethod1(termMap) {
    const selectors = this.getPropertyLabelSelectors();
    const propertyLabels = document.querySelectorAll(selectors.join(', '));
    this.log('Method 1: Found', propertyLabels.length, 'property label elements');

    const processedTexts = new Set();
    let highlights = 0;

    for (const label of propertyLabels) {
      // Skip already processed or invalid elements
      if (label.querySelector('.hshelper-wiki-icon')) continue;
      if (label.closest('.hshelper-container')) continue;
      if (label.closest('.hshelper-wiki-wrapper')) continue;
      if (label.closest('.hshelper-wiki-icon')) continue;

      // Get text content
      let text = this.getDirectTextContent(label).trim().toLowerCase();
      if (!text) {
        text = label.textContent?.trim().toLowerCase() || '';
      }
      if (!text) continue;

      // Skip if element has child with same text (want innermost only)
      const childWithSameText = Array.from(label.querySelectorAll('span, div')).find(
        child => child.textContent?.trim().toLowerCase() === text
      );
      if (childWithSameText) continue;

      // Deduplicate by text + parent context
      const parentKey = label.closest('th, td, button, [role="columnheader"], li')?.textContent?.trim().substring(0, 50) || '';
      const uniqueKey = `${text}::${parentKey}`;
      if (processedTexts.has(uniqueKey)) continue;

      // Check for match
      const entry = termMap.get(text);
      if (entry) {
        this.log(`Match found: "${text}" → ${entry.term}`);
        processedTexts.add(uniqueKey);
        this.addIconToElement(label, entry);
        highlights++;
      }
    }

    return highlights;
  }

  /**
   * Method 2: Find list items in sidebars
   * @param {Map} termMap - Term to entry map
   * @returns {number} Number of highlights added
   */
  applyMethod2(termMap) {
    const sidebarListItems = document.querySelectorAll(
      '[data-test-id="left-sidebar"] li, ' +
      '[data-selenium-test="highlightedPropertySidebar"] li'
    );
    this.log('Method 2: Found', sidebarListItems.length, 'sidebar list items');

    let highlights = 0;

    for (const li of sidebarListItems) {
      if (li.querySelector('.hshelper-wiki-icon')) continue;
      if (li.closest('.hshelper-container')) continue;

      const labelEl = li.querySelector('[class*="label"], [class*="Label"], span:first-child');
      if (!labelEl) continue;

      const labelText = this.getDirectTextContent(labelEl).trim().toLowerCase();
      if (!labelText) continue;

      const entry = termMap.get(labelText);
      if (entry) {
        this.addIconToElement(labelEl, entry);
        highlights++;
      }
    }

    return highlights;
  }

  /**
   * Method 3: Find Supered-wrapped elements
   * @param {Map} termMap - Term to entry map
   * @returns {number} Number of highlights added
   */
  applyMethod3(termMap) {
    const superedElements = document.querySelectorAll('[data-supered-root="true"]');
    this.log('Method 3: Found', superedElements.length, 'Supered elements');

    let highlights = 0;

    for (const el of superedElements) {
      if (el.querySelector('.hshelper-wiki-icon')) continue;

      const triggerText = el.getAttribute('data-rpv-trigger-text')?.toLowerCase();
      if (triggerText && termMap.has(triggerText)) {
        this.addIconToElement(el, termMap.get(triggerText));
        highlights++;
      }
    }

    return highlights;
  }

  /**
   * Method 4: Find standalone property name elements
   * @param {Map} termMap - Term to entry map
   * @returns {number} Number of highlights added
   */
  applyMethod4(termMap) {
    const propertyNameElements = document.querySelectorAll(
      '[data-test-id="left-sidebar"] span, ' +
      '[data-test-id="left-sidebar"] div'
    );
    this.log('Method 4: Found', propertyNameElements.length, 'potential property name elements');

    let highlights = 0;

    for (const el of propertyNameElements) {
      if (el.querySelector('.hshelper-wiki-icon')) continue;
      if (el.closest('.hshelper-container')) continue;
      if (el.closest('.hshelper-wiki-wrapper')) continue;
      if (el.children.length > 2) continue;
      if (el.closest('[contenteditable="true"]')) continue;
      if (el.closest('input, textarea, select')) continue;

      const text = this.getDirectTextContent(el).trim();
      if (!text || text.length > 50) continue;

      const entry = termMap.get(text.toLowerCase());
      if (entry) {
        const fullText = el.textContent.trim().toLowerCase();
        const termText = entry.term.toLowerCase();

        if (fullText === termText ||
            fullText === termText + ':' ||
            fullText.match(new RegExp(`^${this.escapeRegex(termText)}\\s*[:)]?\\s*$`, 'i'))) {
          this.addIconToElement(el, entry);
          highlights++;
        }
      }
    }

    return highlights;
  }

  /**
   * Method 5: Aggressive scan of all text elements in left sidebar
   * @param {Map} termMap - Term to entry map
   * @returns {number} Number of highlights added
   */
  applyMethod5(termMap) {
    const leftSidebar = document.querySelector('[data-test-id="left-sidebar"]');
    if (!leftSidebar) return 0;

    const allTextElements = leftSidebar.querySelectorAll('span, div, p, td, th, dt, dd, h1, h2, h3, h4, h5, h6');
    this.log('Method 5: Scanning', allTextElements.length, 'text elements in left sidebar');

    let highlights = 0;

    for (const el of allTextElements) {
      if (el.querySelector('.hshelper-wiki-icon')) continue;
      if (el.closest('.hshelper-wiki-wrapper')) continue;
      if (el.closest('.hshelper-container')) continue;
      if (el.children.length > 3) continue;
      if (el.closest('[contenteditable="true"]')) continue;
      if (el.closest('input, textarea, select, button')) continue;
      if (el.closest('[class*="value"]') || el.closest('[class*="Value"]')) continue;

      const text = this.getDirectTextContent(el).trim();
      if (!text || text.length > 40 || text.length < 2) continue;
      if (/^[\$\€\£]/.test(text)) continue;
      if (/^\d+[\.,]?\d*%?$/.test(text)) continue;

      const entry = termMap.get(text.toLowerCase());
      if (entry) {
        const trimmedText = el.textContent.trim().toLowerCase();
        const termLower = entry.term.toLowerCase();

        if (trimmedText === termLower ||
            trimmedText === termLower + ':' ||
            trimmedText.startsWith(termLower + ' ') ||
            trimmedText.startsWith(termLower + ':')) {
          this.addIconToElement(el, entry);
          highlights++;
          this.log('Method 5 match:', text, '→', entry.term);
        }
      }
    }

    return highlights;
  }

  // ============ DOM MANIPULATION ============

  /**
   * Add wiki icon to an element
   * @param {HTMLElement} element - The element to add icon to
   * @param {Object} entry - The wiki entry
   */
  addIconToElement(element, entry) {
    const icon = document.createElement('span');
    icon.className = 'hshelper-wiki-icon';
    icon.title = `Wiki: ${entry.term}`;
    icon.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#7cb342">
        <path d="M9 21c0 .5.4 1 1 1h4c.6 0 1-.5 1-1v-1H9v1zm3-19C8.1 2 5 5.1 5 9c0 2.4 1.2 4.5 3 5.7V17c0 .5.4 1 1 1h6c.6 0 1-.5 1-1v-2.3c1.8-1.3 3-3.4 3-5.7 0-3.9-3.1-7-7-7z"/>
      </svg>
    `;

    // Click handler for tooltip
    icon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showTooltip(entry, icon);
    });

    // Wrap element with icon before text
    const wrapper = document.createElement('span');
    wrapper.className = 'hshelper-wiki-wrapper';
    element.parentNode.insertBefore(wrapper, element);
    wrapper.appendChild(icon);
    wrapper.appendChild(element);
  }

  /**
   * Get direct text content of element (not from nested children)
   * @param {HTMLElement} element - The element
   * @returns {string} Direct text content
   */
  getDirectTextContent(element) {
    let text = '';
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      }
    }
    return text;
  }

  /**
   * Escape special regex characters
   * @param {string} string - String to escape
   * @returns {string} Escaped string
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ============ TOOLTIP ============

  /**
   * Show wiki tooltip for an entry
   * @param {Object} entry - Wiki entry object
   * @param {HTMLElement} targetElement - Element to position tooltip near
   */
  showTooltip(entry, targetElement) {
    // Remove existing tooltip
    this.hideTooltip();

    const tooltip = document.createElement('div');
    tooltip.className = 'hshelper-wiki-tooltip';
    tooltip.id = 'hshelper-wiki-tooltip';

    const categoryClass = `wiki-category-${entry.category || 'general'}`;

    tooltip.innerHTML = `
      <div class="wiki-tooltip-header ${categoryClass}">
        <span class="wiki-tooltip-term">${this.helper.escapeHtml(entry.term)}</span>
        <span class="wiki-tooltip-category">${entry.category || 'general'}</span>
        <button class="wiki-tooltip-close" title="Close">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="wiki-tooltip-content">${entry.definition || ''}</div>
      ${entry.link ? `<a href="${this.helper.escapeHtml(entry.link)}" class="wiki-tooltip-link" target="_blank" rel="noopener noreferrer">Learn more</a>` : ''}
    `;

    document.body.appendChild(tooltip);

    // Position tooltip
    const rect = targetElement.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let top = rect.bottom + 8;
    let left = rect.left;

    // Adjust if off-screen
    if (left + tooltipRect.width > window.innerWidth - 16) {
      left = window.innerWidth - tooltipRect.width - 16;
    }
    if (left < 16) left = 16;

    if (top + tooltipRect.height > window.innerHeight - 16) {
      top = rect.top - tooltipRect.height - 8;
    }

    tooltip.style.top = `${top + window.scrollY}px`;
    tooltip.style.left = `${left}px`;

    // Close button handler
    tooltip.querySelector('.wiki-tooltip-close').addEventListener('click', () => {
      this.hideTooltip();
    });

    // Close on click outside
    this.wikiTooltipActive = true;
    setTimeout(() => {
      document.addEventListener('click', this.handleOutsideTooltipClick);
    }, 100);
  }

  /**
   * Handle click outside tooltip to close it
   * @param {Event} e - Click event
   */
  handleOutsideTooltipClick(e) {
    const tooltip = document.getElementById('hshelper-wiki-tooltip');
    if (tooltip && !tooltip.contains(e.target) && !e.target.classList.contains('hshelper-wiki-term')) {
      this.hideTooltip();
    }
  }

  /**
   * Hide the wiki tooltip
   */
  hideTooltip() {
    const tooltip = document.getElementById('hshelper-wiki-tooltip');
    if (tooltip) {
      tooltip.remove();
    }
    document.removeEventListener('click', this.handleOutsideTooltipClick);
    this.wikiTooltipActive = false;
  }

  // ============ REMOVAL ============

  /**
   * Remove all wiki highlighting from the page
   */
  remove() {
    // Remove tooltip
    this.hideTooltip();

    // Remove standalone icons
    const wikiIcons = document.querySelectorAll('.hshelper-wiki-icon');
    for (const icon of wikiIcons) {
      icon.remove();
    }

    // Unwrap wiki wrappers
    const wikiWrappers = document.querySelectorAll('.hshelper-wiki-wrapper');
    for (const wrapper of wikiWrappers) {
      const parent = wrapper.parentNode;
      while (wrapper.firstChild) {
        parent.insertBefore(wrapper.firstChild, wrapper);
      }
      wrapper.remove();
    }

    // Restore highlighted terms
    const highlightedTerms = document.querySelectorAll('.hshelper-wiki-term');
    for (const span of highlightedTerms) {
      let textContent = '';
      for (const child of span.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          textContent += child.textContent;
        }
      }
      const text = document.createTextNode(textContent || span.textContent);
      if (span.parentNode) {
        span.parentNode.replaceChild(text, span);
      }
    }

    this.wikiHighlightsApplied = false;
  }

  // ============ OBSERVERS ============

  /**
   * Set up MutationObserver to watch for new content
   * Called during initial setup on record pages
   */
  setupObserver() {
    this.wikiObserver = new MutationObserver((mutations) => {
      // Ignore mutations caused by our own highlighting
      const isOwnMutation = mutations.some(m =>
        Array.from(m.addedNodes).some(n =>
          n.nodeType === Node.ELEMENT_NODE &&
          (n.classList?.contains('hshelper-wiki-icon') ||
           n.classList?.contains('hshelper-wiki-wrapper') ||
           n.classList?.contains('hshelper-wiki-tooltip'))
        )
      );
      if (isOwnMutation) return;

      // Check if any element nodes were added
      let hasNewElements = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              hasNewElements = true;
              break;
            }
          }
        }
        if (hasNewElements) break;
      }

      if (hasNewElements) {
        clearTimeout(this.wikiUpdateTimeout);
        this.wikiUpdateTimeout = setTimeout(() => {
          this.log('New DOM content detected, re-applying wiki highlights');
          if (this.helper.settings.showWiki !== false && this.helper.wikiEntries?.length > 0) {
            this.apply();
          }
        }, 500);
      }
    });

    // Attach observer
    this.attachObserver();
  }

  /**
   * Attach observer to sidebar elements
   */
  attachObserver() {
    const leftSidebar = document.querySelector('[data-test-id="left-sidebar"]');
    if (leftSidebar && !leftSidebar._wikiObserverAttached) {
      this.wikiObserver.observe(leftSidebar, { childList: true, subtree: true });
      leftSidebar._wikiObserverAttached = true;
      this.log('Wiki observer attached to left sidebar');
    }

    const mainContent = document.querySelector('[data-test-id="middle-pane"]') || document.body;
    if (mainContent) {
      this.wikiObserver.observe(mainContent, { childList: true, subtree: true });
      this.log('Wiki observer attached to main content');
    }
  }

  /**
   * Reconnect observer after DOM modifications
   */
  reconnectObserver() {
    if (!this.wikiObserver) return;

    const leftSidebar = document.querySelector('[data-test-id="left-sidebar"]');
    if (leftSidebar) {
      leftSidebar._wikiObserverAttached = false;
      this.wikiObserver.observe(leftSidebar, { childList: true, subtree: true });
      leftSidebar._wikiObserverAttached = true;
    }

    const mainContent = document.querySelector('[data-test-id="middle-pane"]') || document.body;
    if (mainContent) {
      this.wikiObserver.observe(mainContent, { childList: true, subtree: true });
    }
    this.log('Wiki observer reconnected');
  }

  /**
   * Set up scroll listener for index pages
   * Index pages use scroll instead of MutationObserver to avoid infinite loops
   */
  setupScrollListener() {
    let scrollTimeout = null;
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (this.helper.settings.showWiki !== false &&
            this.helper.wikiEntries?.length > 0 &&
            !this.isApplyingWikiHighlights) {
          this.log('Scroll detected, checking for new content to highlight');
          this.apply();
        }
      }, 1000);
    };

    const scrollContainer = document.querySelector('[data-test-id="index-page"]') ||
                            document.querySelector('[class*="IndexPage"]') ||
                            document.querySelector('main') ||
                            window;

    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
      this.log('Scroll listener attached for index page');
    }
  }

  // ============ UTILITY ============

  /**
   * Log message with prefix
   * @param {...any} args - Arguments to log
   */
  log(...args) {
    console.log('[HubSpot Helper]', ...args);
  }

  /**
   * Full cleanup - remove highlighting and disconnect observers
   */
  cleanup() {
    this.remove();
    if (this.wikiObserver) {
      this.wikiObserver.disconnect();
      this.wikiObserver = null;
    }
    clearTimeout(this.wikiUpdateTimeout);
  }
}

// Export for use in content.js
if (typeof window !== 'undefined') {
  window.WikiModule = WikiModule;
}
