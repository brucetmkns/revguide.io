/**
 * RevGuide - Wiki Module
 *
 * Handles wiki/glossary term highlighting and tooltips on HubSpot pages.
 * Scans the page for text that matches wiki entries and adds
 * clickable icons that show definition tooltips.
 *
 * Features:
 * - Single-pass TreeWalker scanning (fast & consistent)
 * - Shows first instance of each term per section (sidebar, middle pane, etc.)
 * - Sorts triggers by length (longest first) to avoid partial matches
 * - Zero-width character normalization for reliable matching
 * - Handles lazy-loaded content via MutationObserver
 * - Prevents duplicate icons
 *
 * Architecture:
 * - Single efficient DOM traversal using TreeWalker
 * - Section-based deduplication (one icon per term per section)
 * - Pre-sorted term list for accurate matching
 *
 * Dependencies:
 * - Uses shared utilities (escapeHtml) from main content.js
 * - Requires wikiEntries array from storage
 *
 * Usage:
 *   const wiki = new WikiModule(helper);
 *   wiki.apply();           // Apply highlighting
 *   wiki.remove();          // Remove all highlighting
 *   wiki.cleanup();         // Full cleanup including observers
 */

class WikiModule {
  /**
   * @param {Object} helper - Reference to main HubSpotHelper instance
   * @param {Object} helper.settings - User settings including showWiki
   * @param {Array} helper.wikiEntries - Array of wiki entry objects
   * @param {Function} helper.escapeHtml - HTML escape utility
   */
  constructor(helper) {
    this.helper = helper;
    this.wikiObserver = null;
    this.wikiTooltipActive = false;
    this.wikiHighlightsApplied = false;
    this.isApplyingWikiHighlights = false;
    this.wikiUpdateTimeout = null;
    this.currentTooltipEntryId = null;

    // Cache for sorted term list
    this.sortedTermsCache = null;
    this.sortedTermsCacheKey = null;

    // Track processed elements to avoid duplicates
    this.processedElements = new WeakSet();

    // Bind handlers
    this.handleOutsideTooltipClick = this.handleOutsideTooltipClick.bind(this);
  }

  // ============ TEXT NORMALIZATION ============

  /**
   * Normalize text for matching
   * Strips zero-width characters, trims, and lowercases
   * @param {string} text - Text to normalize
   * @returns {string} Normalized text
   */
  normalizeText(text) {
    if (!text) return '';
    return text
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width chars
      .trim()
      .toLowerCase();
  }

  // ============ SECTION DETECTION ============

  /**
   * Define HubSpot page sections for deduplication
   * Each term should only show once per section
   */
  getSectionSelectors() {
    return [
      { name: 'left-sidebar', selector: '[data-test-id="left-sidebar"]' },
      { name: 'middle-pane', selector: '[data-test-id="middle-pane"]' },
      { name: 'right-sidebar', selector: '[data-test-id="right-sidebar"]' },
      { name: 'header', selector: '[data-test-id="record-header"], header, [role="banner"]' },
      { name: 'modal', selector: '[role="dialog"], [class*="Modal"], [class*="modal"]' },
      { name: 'dropdown', selector: '[role="listbox"], [role="menu"], [class*="Dropdown"]' },
      { name: 'filter-panel', selector: '[data-test-id="filter-panel"], [class*="FilterEditor"]' },
      { name: 'nav', selector: '[data-menu-item-level="secondary"]' },
      { name: 'table', selector: 'table, [role="grid"], [class*="Table"]' },
      { name: 'main', selector: 'main, [role="main"]' },
      { name: 'body', selector: 'body' } // Fallback
    ];
  }

  /**
   * Get the section name for an element
   * @param {HTMLElement} element - Element to check
   * @returns {string} Section name
   */
  getSectionForElement(element) {
    if (!element) return 'unknown';

    const sections = this.getSectionSelectors();
    for (const { name, selector } of sections) {
      if (element.closest(selector)) {
        return name;
      }
    }
    return 'body';
  }

  // ============ TERM MAP BUILDING ============

  /**
   * Build sorted list of terms for matching
   * Sorted by length (longest first) to avoid partial matches
   * @param {Array} entries - Enabled wiki entries
   * @returns {Array} Array of { term, entry } sorted by term length desc
   */
  buildSortedTermList(entries) {
    // Generate cache key
    const cacheKey = entries.map(e => `${e.id}:${e.trigger || e.term}`).join('|');

    if (this.sortedTermsCache && this.sortedTermsCacheKey === cacheKey) {
      return this.sortedTermsCache;
    }

    const termList = [];

    for (const entry of entries) {
      // Skip entries without a trigger
      if (!entry.trigger && !entry.term) continue;

      const primaryTrigger = entry.trigger || entry.term;
      const triggers = [primaryTrigger, ...(entry.aliases || [])];

      for (const trigger of triggers) {
        if (trigger && trigger.trim()) {
          const normalized = this.normalizeText(trigger);
          if (normalized.length >= 2) {
            termList.push({ term: normalized, entry });
          }
        }
      }
    }

    // Sort by length descending (longest first)
    termList.sort((a, b) => b.term.length - a.term.length);

    this.sortedTermsCache = termList;
    this.sortedTermsCacheKey = cacheKey;
    this.log('Built sorted term list:', termList.length, 'terms');

    return termList;
  }

  /**
   * Invalidate term cache
   */
  invalidateTermMapCache() {
    this.sortedTermsCache = null;
    this.sortedTermsCacheKey = null;
    this.log('Term cache invalidated');
  }

  // ============ MAIN APPLY METHOD ============

  /**
   * Apply wiki highlighting using single-pass TreeWalker
   * Shows first instance of each term per section
   */
  apply() {
    if (this.isApplyingWikiHighlights) {
      this.log('Already applying, skipping');
      return;
    }

    this.isApplyingWikiHighlights = true;
    this.log('>>> apply() starting');

    try {
      // Disconnect observer while working
      if (this.wikiObserver) {
        this.wikiObserver.disconnect();
      }

      const wikiEntries = this.helper.wikiEntries || [];
      const enabledEntries = wikiEntries.filter(e => e.enabled !== false);

      if (enabledEntries.length === 0) {
        this.log('No enabled wiki entries');
        return;
      }

      // Build sorted term list
      const sortedTerms = this.buildSortedTermList(enabledEntries);

      // Track which terms we've shown in each section
      // Key: "sectionName:termId" -> true
      const shownInSection = new Map();

      // Collect matches first, then apply (avoid DOM modification during walk)
      const matches = this.scanForMatches(sortedTerms, shownInSection);

      this.log('Found', matches.length, 'matches to highlight');

      // Apply icons to matches
      let highlights = 0;
      for (const match of matches) {
        try {
          if (match.type === 'textNode') {
            this.wrapTextNodeWithIcon(match.node, match.entry);
          } else {
            this.addIconToElement(match.element, match.entry);
          }
          highlights++;
        } catch (e) {
          this.log('Error applying icon:', e.message);
        }
      }

      this.wikiHighlightsApplied = true;
      if (highlights > 0) {
        this.log('Applied', highlights, 'wiki highlights');
      }

    } catch (error) {
      this.log('Error in apply():', error.message);
      console.error('[RevGuide] Wiki apply error:', error);
    } finally {
      this.isApplyingWikiHighlights = false;
      this.reconnectObserver();
    }
  }

  /**
   * Single-pass TreeWalker scan for all matching text
   * @param {Array} sortedTerms - Sorted term list
   * @param {Map} shownInSection - Track shown terms per section
   * @returns {Array} Array of matches
   */
  scanForMatches(sortedTerms, shownInSection) {
    const matches = [];

    // Tags to skip entirely
    const skipTags = new Set([
      'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT',
      'EMBED', 'SVG', 'CODE', 'PRE', 'INPUT', 'TEXTAREA', 'SELECT'
    ]);

    // Create TreeWalker
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const text = node.textContent;
          if (!text || text.trim().length < 2 || text.trim().length > 100) {
            return NodeFilter.FILTER_REJECT;
          }

          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          // Skip certain tags
          if (skipTags.has(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip editable content
          if (parent.closest('[contenteditable="true"]')) {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip our own elements
          if (parent.closest('[data-hshelper-root], .hshelper-wiki-wrapper, .hshelper-wiki-icon, .hshelper-wiki-tooltip')) {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip if already has our icon
          if (parent.querySelector('.hshelper-wiki-icon')) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    // Walk all text nodes
    while (walker.nextNode()) {
      const textNode = walker.currentNode;
      const parent = textNode.parentElement;

      if (this.processedElements.has(parent)) continue;

      const normalizedText = this.normalizeText(textNode.textContent);
      if (!normalizedText) continue;

      // Pre-process the text once (strip trailing punctuation and counts)
      // This handles cases like "Contacts (2)" → "contacts" or "Deal Stage:" → "deal stage"
      const textToMatch = normalizedText
        .replace(/\s*[:\?]\s*$/, '')       // Remove trailing colon or question mark
        .replace(/\s*\(\d+\)\s*$/, '');    // Remove trailing count like "(3)"

      // Check against all terms (sorted by length, longest first)
      for (const { term, entry } of sortedTerms) {
        const matchType = entry.matchType || 'exact';
        let isMatch = false;

        if (matchType === 'starts_with') {
          // Starts with matching - text must start with the term
          isMatch = textToMatch.startsWith(term);
        } else {
          // Exact matching (default) - handles plurals too
          // This prevents "Company" from matching "Company Domain Name"
          isMatch = textToMatch === term ||
            textToMatch === term + 's' ||           // company → companies
            textToMatch === term + 'es' ||          // (for words ending in consonant)
            (term.endsWith('y') && textToMatch === term.slice(0, -1) + 'ies') || // company → companies
            (textToMatch.endsWith('s') && textToMatch.slice(0, -1) === term) ||  // companies → company
            (textToMatch.endsWith('es') && textToMatch.slice(0, -2) === term) || // boxes → box
            (textToMatch.endsWith('ies') && textToMatch.slice(0, -3) + 'y' === term); // companies → company
        }

        if (isMatch) {
          // Get section for deduplication
          const section = this.getSectionForElement(parent);
          const sectionKey = `${section}:${entry.id}`;

          // Also deduplicate by trigger term to prevent duplicate entries with same trigger
          // from each highlighting different instances
          const termKey = `${section}:term:${term}`;

          // Skip if we've already shown this entry OR this trigger term in this section
          if (shownInSection.has(sectionKey) || shownInSection.has(termKey)) {
            continue;
          }

          // Verify this is a label-like context
          if (!this.isLikelyLabelContext(parent, textNode.textContent.trim())) {
            continue;
          }

          // Record that we're showing this term in this section
          shownInSection.set(sectionKey, true);
          shownInSection.set(termKey, true);  // Also track by trigger term
          this.processedElements.add(parent);

          matches.push({
            type: 'textNode',
            node: textNode,
            entry,
            section,
            text: textNode.textContent.trim()
          });

          this.log(`Match: "${textNode.textContent.trim()}" → ${entry.trigger || entry.term} (section: ${section})`);

          // Found a match for this text node, move to next node
          break;
        }
      }
    }

    return matches;
  }

  /**
   * Check if element is in a label-like context
   * @param {HTMLElement} element - Parent element
   * @param {string} text - Text content
   * @returns {boolean}
   */
  isLikelyLabelContext(element, text) {
    if (!element) return false;

    // Skip primary nav (but allow secondary nav)
    const navItem = element.closest('[data-location="vertical-nav"], [class*="VerticalNav"]');
    if (navItem) {
      const menuLevel = element.closest('[data-menu-item-level]')?.getAttribute('data-menu-item-level');
      if (menuLevel !== 'secondary') {
        return false;
      }
    }

    // Accept common label tags (including HubSpot custom elements like I18N-STRING)
    const labelTags = new Set([
      'SPAN', 'DIV', 'LABEL', 'TH', 'TD', 'DT', 'DD', 'LI',
      'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BUTTON', 'A', 'P', 'STRONG', 'B',
      'I18N-STRING' // HubSpot's internationalization component for labels
    ]);
    if (!labelTags.has(element.tagName)) return false;

    // Skip large text blocks
    const fullText = element.textContent.trim();
    if (fullText.length > 300) return false;

    // Check if our text is a significant part of the element
    const textRatio = text.length / fullText.length;
    if (textRatio < 0.2 && fullText.length > 100) return false;

    // Accept elements in HubSpot UI areas
    if (element.closest('[data-test-id], [data-selenium-test], [role], [class*="Label"], [class*="label"], [class*="Property"], [class*="Filter"], [class*="Card"], [class*="Menu"]')) {
      return true;
    }

    // Accept table cells, list items
    if (element.closest('th, td, li, dt, dd')) return true;

    // Accept small elements where text is main content
    if (element.childNodes.length <= 5 && textRatio > 0.3) return true;

    // Accept interactive elements
    if (element.closest('button, a, [tabindex]')) return true;

    // Default: accept short text in small elements
    return text.length <= 50 && element.childNodes.length <= 5;
  }

  /**
   * Apply for index pages with multiple passes for lazy loading
   */
  applyForIndex() {
    this.log('applyForIndex called');

    if (this.helper.settings.showWiki === false) return;
    if (!this.helper.wikiEntries?.length) return;

    // Immediate pass
    this.apply();

    // Check for loading indicators
    const hasLoading = () => document.querySelector(
      '[data-loading="true"], .loading, [aria-busy="true"], .skeleton-loader'
    );

    // Second pass if loading
    setTimeout(() => {
      if (hasLoading()) {
        this.log('Index pass 2 - loading detected');
        this.processedElements = new WeakSet(); // Reset for new content
        this.apply();
      }
    }, 800);

    // Third pass for slow loading
    setTimeout(() => {
      if (hasLoading()) {
        this.log('Index pass 3 - still loading');
        this.processedElements = new WeakSet();
        this.apply();
      }
    }, 2000);
  }

  // ============ DOM MANIPULATION ============

  /**
   * Wrap a text node with icon
   * @param {Node} textNode - Text node to wrap
   * @param {Object} entry - Wiki entry
   */
  wrapTextNodeWithIcon(textNode, entry) {
    const parent = textNode.parentElement;
    if (!parent) return;
    if (parent.querySelector('.hshelper-wiki-icon')) return;

    const displayTitle = entry.title || entry.trigger || entry.term;

    // Create icon
    const icon = document.createElement('span');
    icon.className = 'hshelper-wiki-icon';
    icon.title = `Wiki: ${displayTitle}`;
    icon.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#7cb342">
        <path d="M9 21c0 .5.4 1 1 1h4c.6 0 1-.5 1-1v-1H9v1zm3-19C8.1 2 5 5.1 5 9c0 2.4 1.2 4.5 3 5.7V17c0 .5.4 1 1 1h6c.6 0 1-.5 1-1v-2.3c1.8-1.3 3-3.4 3-5.7 0-3.9-3.1-7-7-7z"/>
      </svg>
    `;

    icon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showTooltip(entry, icon);
    });

    // Create container
    const iconContainer = document.createElement('span');
    iconContainer.className = 'hshelper-wiki-icon-container';
    iconContainer.appendChild(icon);

    // Create wrapper
    const wrapper = document.createElement('span');
    wrapper.className = 'hshelper-wiki-wrapper hshelper-trigger-root';
    wrapper.setAttribute('data-hshelper-root', 'true');
    wrapper.setAttribute('data-hshelper-trigger', entry.trigger || entry.term || '');
    wrapper.setAttribute('data-hshelper-content-id', entry.id || '');
    wrapper.style.cssText = 'font-size: inherit !important; line-height: inherit !important; display: inline-block !important; position: relative !important; padding-left: 1.15em !important;';

    wrapper.appendChild(iconContainer);
    wrapper.appendChild(document.createTextNode(textNode.textContent));

    parent.replaceChild(wrapper, textNode);
  }

  /**
   * Add icon to an element
   * @param {HTMLElement} element - Element to add icon to
   * @param {Object} entry - Wiki entry
   */
  addIconToElement(element, entry) {
    const displayTitle = entry.title || entry.trigger || entry.term;

    const icon = document.createElement('span');
    icon.className = 'hshelper-wiki-icon';
    icon.title = `Wiki: ${displayTitle}`;
    icon.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#7cb342">
        <path d="M9 21c0 .5.4 1 1 1h4c.6 0 1-.5 1-1v-1H9v1zm3-19C8.1 2 5 5.1 5 9c0 2.4 1.2 4.5 3 5.7V17c0 .5.4 1 1 1h6c.6 0 1-.5 1-1v-2.3c1.8-1.3 3-3.4 3-5.7 0-3.9-3.1-7-7-7z"/>
      </svg>
    `;

    icon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showTooltip(entry, icon);
    });

    const iconContainer = document.createElement('span');
    iconContainer.className = 'hshelper-wiki-icon-container';
    iconContainer.appendChild(icon);

    const wrapper = document.createElement('span');
    wrapper.className = 'hshelper-wiki-wrapper hshelper-trigger-root';
    wrapper.setAttribute('data-hshelper-root', 'true');
    wrapper.setAttribute('data-hshelper-trigger', entry.trigger || entry.term || '');
    wrapper.setAttribute('data-hshelper-content-id', entry.id || '');
    wrapper.style.cssText = 'font-size: inherit !important; line-height: inherit !important; display: inline-block !important; position: relative !important; padding-left: 1.15em !important;';

    wrapper.appendChild(iconContainer);
    element.parentNode.insertBefore(wrapper, element);
    wrapper.appendChild(element);
  }

  // ============ TOOLTIP ============

  /**
   * Show wiki tooltip
   * @param {Object} entry - Wiki entry
   * @param {HTMLElement} targetElement - Element to position near
   */
  showTooltip(entry, targetElement) {
    if (this.currentTooltipEntryId === entry.id) {
      this.hideTooltip();
      return;
    }

    this.hideTooltip();

    const tooltip = document.createElement('div');
    tooltip.className = 'hshelper-wiki-tooltip';
    tooltip.id = 'hshelper-wiki-tooltip';

    const category = entry.category || 'general';
    const categoryClass = `wiki-category-${category}`;
    const displayTitle = entry.title || entry.trigger || entry.term;

    const showAdminLinks = this.helper.settings.showAdminLinks !== false && this.helper.settings.canEditContent !== false;
    const editLinkHtml = showAdminLinks ? `
      <a href="#" class="wiki-tooltip-edit" data-entry-id="${entry.id}" title="Edit in Admin Panel">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Edit
      </a>
    ` : '';

    const learnMoreHtml = entry.link ? `
      <a href="${this.helper.escapeHtml(entry.link)}" class="wiki-tooltip-learn" target="_blank" rel="noopener noreferrer">
        Learn more
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>
    ` : '';

    const footerHtml = (showAdminLinks || entry.link) ? `
      <div class="wiki-tooltip-footer">
        ${editLinkHtml}
        ${learnMoreHtml}
      </div>
    ` : '';

    const categoryIcons = {
      general: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
      sales: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
      marketing: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
      product: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
      process: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
      field: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>'
    };
    const iconPath = categoryIcons[category] || categoryIcons.general;

    tooltip.innerHTML = `
      <div class="wiki-tooltip-header">
        <div class="wiki-tooltip-icon ${categoryClass}">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconPath}</svg>
        </div>
        <span class="wiki-tooltip-term">${this.helper.escapeHtml(displayTitle)}</span>
        <span class="wiki-tooltip-category ${categoryClass}">${category}</span>
        <button class="wiki-tooltip-close" title="Close">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="wiki-tooltip-content">${entry.definition || ''}</div>
      ${footerHtml}
    `;

    document.body.appendChild(tooltip);

    // Position
    const rect = targetElement.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();

    let top = rect.bottom + 8;
    let left = rect.left;

    if (left + tooltipRect.width > window.innerWidth - 16) {
      left = window.innerWidth - tooltipRect.width - 16;
    }
    if (left < 16) left = 16;

    if (top + tooltipRect.height > window.innerHeight - 16) {
      top = rect.top - tooltipRect.height - 8;
    }

    tooltip.style.top = `${top + window.scrollY}px`;
    tooltip.style.left = `${left}px`;

    // Close button
    tooltip.querySelector('.wiki-tooltip-close').addEventListener('click', () => {
      this.hideTooltip();
    });

    // Edit link
    const editLink = tooltip.querySelector('.wiki-tooltip-edit');
    if (editLink) {
      editLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const entryId = editLink.dataset.entryId;
        const adminUrl = chrome.runtime.getURL(`admin/pages/wiki.html?edit=${entryId}`);
        window.open(adminUrl, '_blank');
      });
    }

    this.currentTooltipEntryId = entry.id;
    this.wikiTooltipActive = true;

    setTimeout(() => {
      document.addEventListener('click', this.handleOutsideTooltipClick);
    }, 150);
  }

  /**
   * Handle click outside tooltip
   */
  handleOutsideTooltipClick(e) {
    const tooltip = document.getElementById('hshelper-wiki-tooltip');
    if (!tooltip) return;

    if (tooltip.contains(e.target)) return;
    if (e.target.closest('.hshelper-wiki-icon')) return;

    this.hideTooltip();
  }

  /**
   * Hide tooltip
   */
  hideTooltip() {
    const tooltip = document.getElementById('hshelper-wiki-tooltip');
    if (tooltip) tooltip.remove();

    document.removeEventListener('click', this.handleOutsideTooltipClick);
    this.wikiTooltipActive = false;
    this.currentTooltipEntryId = null;
  }

  // ============ REMOVAL ============

  /**
   * Remove all wiki highlighting
   */
  remove() {
    this.hideTooltip();
    this.processedElements = new WeakSet();

    // Remove standalone icons
    document.querySelectorAll('.hshelper-wiki-icon:not(.hshelper-wiki-wrapper .hshelper-wiki-icon)').forEach(icon => icon.remove());

    // Unwrap wrappers
    document.querySelectorAll('.hshelper-wiki-wrapper, .hshelper-trigger-root, [data-hshelper-root]').forEach(wrapper => {
      const parent = wrapper.parentNode;
      if (!parent) return;

      let textContent = '';
      const isOurElement = (el) => {
        return el.classList?.contains('hshelper-wiki-icon') ||
               el.classList?.contains('hshelper-wiki-icon-container');
      };

      for (const child of wrapper.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          textContent += child.textContent;
        } else if (child.nodeType === Node.ELEMENT_NODE && !isOurElement(child)) {
          textContent += child.textContent;
        }
      }

      if (textContent) {
        parent.replaceChild(document.createTextNode(textContent), wrapper);
      } else {
        while (wrapper.firstChild) {
          if (!isOurElement(wrapper.firstChild)) {
            parent.insertBefore(wrapper.firstChild, wrapper);
          } else {
            wrapper.firstChild.remove();
          }
        }
        wrapper.remove();
      }
    });

    // Legacy cleanup
    document.querySelectorAll('.hshelper-wiki-term').forEach(span => {
      const text = document.createTextNode(span.textContent);
      span.parentNode?.replaceChild(text, span);
    });

    this.wikiHighlightsApplied = false;
  }

  // ============ OBSERVERS ============

  /**
   * Set up MutationObserver
   */
  setupObserver() {
    this.lastApplyTime = 0;
    const MIN_INTERVAL = 2000;

    this.wikiObserver = new MutationObserver((mutations) => {
      if (this.isApplyingWikiHighlights) return;

      // Skip our own mutations
      const isOwnMutation = mutations.every(m => {
        const checkNodes = (nodes) => Array.from(nodes).every(n => {
          if (n.nodeType !== Node.ELEMENT_NODE) return true;
          return n.classList?.contains('hshelper-wiki-icon') ||
                 n.classList?.contains('hshelper-wiki-wrapper') ||
                 n.classList?.contains('hshelper-wiki-tooltip') ||
                 n.hasAttribute?.('data-hshelper-root');
        });
        return checkNodes(m.addedNodes) && checkNodes(m.removedNodes);
      });

      if (isOwnMutation) return;

      // Check for meaningful additions
      let hasNewContent = false;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = node.tagName;
            if (tag !== 'STYLE' && tag !== 'SCRIPT' && tag !== 'LINK') {
              hasNewContent = true;
              break;
            }
          }
        }
        if (hasNewContent) break;
      }

      if (hasNewContent) {
        const now = Date.now();
        const elapsed = now - this.lastApplyTime;

        clearTimeout(this.wikiUpdateTimeout);
        this.wikiUpdateTimeout = setTimeout(() => {
          if (this.helper.settings.showWiki !== false && this.helper.wikiEntries?.length) {
            this.lastApplyTime = Date.now();
            this.apply();
          }
        }, elapsed < MIN_INTERVAL ? MIN_INTERVAL - elapsed : 300);
      }
    });

    this.attachObserver();
  }

  /**
   * Attach observer to containers
   */
  attachObserver() {
    if (!this.wikiObserver) return;

    const containers = [
      document.querySelector('[data-test-id="left-sidebar"]'),
      document.querySelector('[data-test-id="middle-pane"]'),
      document.querySelector('[data-test-id="right-sidebar"]'),
      document.querySelector('main'),
      document.querySelector('[role="main"]')
    ].filter(Boolean);

    if (containers.length === 0) {
      if (!document.body._hshelperObserved) {
        this.wikiObserver.observe(document.body, { childList: true, subtree: true });
        document.body._hshelperObserved = true;
        this.log('Observer attached to body (fallback)');
      }
      return;
    }

    for (const c of containers) {
      if (!c._hshelperObserved) {
        this.wikiObserver.observe(c, { childList: true, subtree: true });
        c._hshelperObserved = true;
      }
    }
    this.log('Observer attached to', containers.length, 'containers');
  }

  /**
   * Reconnect observer
   */
  reconnectObserver() {
    if (!this.wikiObserver) return;

    const containers = [
      document.querySelector('[data-test-id="left-sidebar"]'),
      document.querySelector('[data-test-id="middle-pane"]'),
      document.querySelector('[data-test-id="right-sidebar"]'),
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
      document.body
    ].filter(Boolean);

    for (const c of containers) {
      c._hshelperObserved = false;
    }

    this.attachObserver();
  }

  /**
   * Set up scroll listener for index pages
   */
  setupScrollListener() {
    let timeout = null;

    const handleScroll = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (this.helper.settings.showWiki !== false &&
            this.helper.wikiEntries?.length &&
            !this.isApplyingWikiHighlights) {
          this.log('Scroll detected, applying');
          this.apply();
        }
      }, 1000);
    };

    const container = document.querySelector('[data-test-id="index-page"]') ||
                      document.querySelector('main') ||
                      window;

    container.addEventListener('scroll', handleScroll, { passive: true });
    this.log('Scroll listener attached');
  }

  // ============ UTILITY ============

  /**
   * Log with prefix
   */
  log(...args) {
    console.log('[RevGuide Wiki]', ...args);
  }

  /**
   * Full cleanup
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

// Export
if (typeof window !== 'undefined') {
  window.WikiModule = WikiModule;
}
