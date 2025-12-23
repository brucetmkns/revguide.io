/**
 * RevGuide - Index Tags Module
 *
 * Displays visual tags on HubSpot record index/list pages based on banner rules.
 * Tags appear underneath record names in the table when records meet the rule criteria.
 *
 * Features:
 * - Renders clickable tags under record names on index pages
 * - Evaluates banner rules against record properties
 * - Supports max 3 tags per record, sorted by priority
 * - Opens related play in sidepanel when clicked
 * - Handles virtual scrolling via MutationObserver
 *
 * Dependencies:
 * - Requires RulesEngine for evaluating display conditions
 * - Uses HubSpot batch API for fetching record properties
 *
 * Usage:
 *   const indexTags = new IndexTagsModule(helper);
 *   indexTags.init();
 *   indexTags.cleanup();
 */

class IndexTagsModule {
  /**
   * @param {Object} helper - Reference to main HubSpotHelper instance
   * @param {Array} helper.rules - Array of banner rules
   * @param {Object} helper.rulesEngine - RulesEngine instance
   * @param {Function} helper.escapeHtml - HTML escape utility
   */
  constructor(helper) {
    this.helper = helper;
    this.propertiesCache = new Map(); // recordId -> { properties, timestamp }
    this.processedRows = new WeakSet(); // Track rows we've already processed
    this.taggedRecords = new Map(); // recordId -> container element
    this.renderCooldown = new Map(); // recordId -> last render timestamp
    this.observer = null;
    this.pendingRecordIds = new Set();
    this.batchTimeout = null;
    this.objectType = null;
    this.objectTypeId = null;
    this.portalId = null;
    this.eligibleBanners = [];
    this.isProcessing = false;

    // Cache TTL: 5 minutes
    this.CACHE_TTL = 5 * 60 * 1000;

    // Max tags per record
    this.MAX_TAGS = 3;

    // Batch delay before API call
    this.BATCH_DELAY = 300;

    // Cooldown between renders for same record (prevents HubSpot render loop)
    this.RENDER_COOLDOWN = 2000;
  }

  /**
   * Initialize the module on an index page
   */
  async init() {
    console.log('[RevGuide IndexTags] init() called, URL:', window.location.href);

    // Extract context from URL
    const urlInfo = this.parseIndexUrl();
    if (!urlInfo) {
      console.log('[RevGuide IndexTags] Not a valid index page URL');
      return;
    }

    this.objectTypeId = urlInfo.objectTypeId;
    this.objectType = urlInfo.objectType;
    this.portalId = urlInfo.portalId;

    console.log('[RevGuide IndexTags] Initializing for', this.objectType, 'index page');
    console.log('[RevGuide IndexTags] Total rules from helper:', this.helper.rules?.length || 0);

    // Filter to banners that have showOnIndex enabled and match object type
    this.eligibleBanners = this.getEligibleBanners();
    console.log('[RevGuide IndexTags] Found', this.eligibleBanners.length, 'eligible banners for', this.objectType);

    if (this.eligibleBanners.length === 0) {
      console.log('[RevGuide IndexTags] No eligible banners, skipping');
      return;
    }

    // Detect view type (table or board)
    this.viewType = this.detectViewType();
    console.log('[RevGuide IndexTags] View type:', this.viewType);

    if (this.viewType === 'board') {
      // Board view handling
      await this.waitForBoard();
      await this.waitForHubSpotToSettle();
      this.processBoardCards();
      this.setupBoardObserver();
    } else {
      // Table view handling (default)
      await this.waitForTable();
      await this.waitForHubSpotToSettle();
      this.processVisibleRows();
      this.setupObserver();
    }
  }

  /**
   * Detect whether we're in table view or board view
   * @returns {string} 'table' or 'board'
   */
  detectViewType() {
    // Check URL for board indicator
    if (window.location.href.includes('/board/')) {
      return 'board';
    }

    // Check DOM for board view elements (cdb = CRM Data Board)
    const boardCards = document.querySelector('[data-test-id="cdb-column-item"], [data-test-id="cdb-card"]');
    if (boardCards) {
      return 'board';
    }

    // Check for board view containers
    const boardContainer = document.querySelector('[class*="BoardView"], [class*="PipelineBoard"]');
    if (boardContainer) {
      return 'board';
    }

    return 'table';
  }

  /**
   * Wait for board view to be ready
   */
  waitForBoard() {
    return new Promise((resolve) => {
      const check = () => {
        // Look for board cards or column items
        const board = document.querySelector('[data-test-id="cdb-column-item"], [data-test-id="cdb-card"]') ||
                      document.querySelector('[class*="BoardView"], [class*="PipelineBoard"]');
        if (board) {
          resolve();
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });
  }

  /**
   * Wait for HubSpot to finish its initial loading/render passes
   * Detects when DOM mutations stop for a period
   */
  waitForHubSpotToSettle() {
    return new Promise((resolve) => {
      const table = document.querySelector('[data-test-id="crm-object-table"]') ||
                    document.querySelector('table[role="grid"]') ||
                    document.querySelector('table');

      if (!table) {
        resolve();
        return;
      }

      let settleTimeout;
      const SETTLE_DELAY = 500; // Wait for 500ms of no changes

      const observer = new MutationObserver(() => {
        clearTimeout(settleTimeout);
        settleTimeout = setTimeout(() => {
          observer.disconnect();
          resolve();
        }, SETTLE_DELAY);
      });

      observer.observe(table, { childList: true, subtree: true });

      // Start the timer - if no mutations, we're already settled
      settleTimeout = setTimeout(() => {
        observer.disconnect();
        resolve();
      }, SETTLE_DELAY);

      // Max wait of 3 seconds regardless
      setTimeout(() => {
        observer.disconnect();
        resolve();
      }, 3000);
    });
  }

  /**
   * Parse the index page URL to extract context
   * @returns {Object|null} { objectTypeId, objectType, portalId } or null
   */
  parseIndexUrl() {
    const url = window.location.href;

    // Pattern: /contacts/{portalId}/objects/{objectTypeId}/...
    const match = url.match(/\/contacts\/(\d+)\/objects\/(\d+-\d+)/);
    if (!match) return null;

    const portalId = match[1];
    const objectTypeId = match[2];

    // Map object type IDs to names
    const objectTypeMap = {
      '0-1': 'contact',
      '0-2': 'company',
      '0-3': 'deal',
      '0-5': 'ticket'
    };

    const objectType = objectTypeMap[objectTypeId];
    if (!objectType) return null;

    return { objectTypeId, objectType, portalId };
  }

  /**
   * Normalize object type to handle singular/plural variations
   * @param {string} type - Object type (e.g., 'company', 'companies')
   * @returns {string} Normalized singular form
   */
  normalizeObjectType(type) {
    if (!type) return '';
    const normalized = type.toLowerCase();
    // Map plural to singular
    const pluralToSingular = {
      'contacts': 'contact',
      'companies': 'company',
      'deals': 'deal',
      'tickets': 'ticket'
    };
    return pluralToSingular[normalized] || normalized;
  }

  /**
   * Get banners eligible for index page display
   * @returns {Array} Filtered and sorted banners
   */
  getEligibleBanners() {
    const rules = this.helper.rules || [];
    const normalizedPageType = this.normalizeObjectType(this.objectType);

    console.log('[RevGuide IndexTags] Filtering rules for objectType:', this.objectType, '(normalized:', normalizedPageType + ')');

    return rules.filter(rule => {
      // Must be enabled
      if (rule.enabled === false) {
        console.log('[RevGuide IndexTags] Rule', rule.id, rule.name, '- skipped: disabled');
        return false;
      }

      // Must have showOnIndex enabled
      if (!rule.showOnIndex) {
        console.log('[RevGuide IndexTags] Rule', rule.id, rule.name, '- skipped: showOnIndex not enabled');
        return false;
      }

      // Must match object type (or have none specified)
      if (rule.objectTypes?.length > 0) {
        // Normalize both sides for comparison
        const normalizedRuleTypes = rule.objectTypes.map(t => this.normalizeObjectType(t));
        if (!normalizedRuleTypes.includes(normalizedPageType)) {
          console.log('[RevGuide IndexTags] Rule', rule.id, rule.name, '- skipped: objectType mismatch', rule.objectTypes, 'vs', normalizedPageType);
          return false;
        }
      }

      console.log('[RevGuide IndexTags] Rule', rule.id, rule.name, '- ELIGIBLE');
      return true;
    }).sort((a, b) => (b.priority || 0) - (a.priority || 0)); // Sort by priority descending
  }

  /**
   * Wait for the data table to be present in DOM
   * @returns {Promise<void>}
   */
  waitForTable() {
    return new Promise((resolve) => {
      const check = () => {
        const table = document.querySelector('[data-test-id="framework-data-table"]') ||
                      document.querySelector('table[role="grid"]') ||
                      document.querySelector('table');
        if (table) {
          resolve();
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });
  }

  /**
   * Process all visible table rows
   */
  processVisibleRows() {
    if (this.isProcessing) return;

    const rows = document.querySelectorAll('tr[data-test-id^="row-"]');
    const recordIds = [];

    rows.forEach(row => {
      const testId = row.getAttribute('data-test-id');
      const match = testId.match(/row-(\d+)/);
      if (!match) return;

      const recordId = match[1];

      // Check if tags already exist in this row (skip if so)
      const nameCell = row.querySelector('td[data-column-index="0"]');
      const mediaBody = nameCell?.querySelector('[class*="MediaBody"]');
      if (mediaBody?.querySelector('.hshelper-index-tags')) {
        // Tags already exist, mark as processed and skip
        this.processedRows.add(row);
        return;
      }

      // Check if we have cached properties
      const cached = this.propertiesCache.get(recordId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        // Use cached properties - render immediately
        this.renderTagsForRecord(row, recordId, cached.properties);
      } else {
        // Need to fetch properties
        recordIds.push(recordId);
      }
      this.processedRows.add(row);
    });

    if (recordIds.length > 0) {
      this.scheduleBatchFetch(recordIds);
    }
  }

  /**
   * Schedule a batch fetch for record properties
   * @param {Array} recordIds - Array of record IDs to fetch
   */
  scheduleBatchFetch(recordIds) {
    recordIds.forEach(id => this.pendingRecordIds.add(id));

    clearTimeout(this.batchTimeout);
    this.batchTimeout = setTimeout(() => {
      this.executeBatchFetch();
    }, this.BATCH_DELAY);
  }

  /**
   * Execute batch fetch for pending record IDs
   */
  async executeBatchFetch() {
    if (this.pendingRecordIds.size === 0) return;

    const recordIds = Array.from(this.pendingRecordIds);
    this.pendingRecordIds.clear();
    this.isProcessing = true;

    console.log('[RevGuide IndexTags] Fetching properties for', recordIds.length, 'records');

    try {
      // Fetch via background script
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'fetchBatchRecordProperties',
          objectType: this.objectType,
          recordIds: recordIds,
          portalId: this.portalId
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!response?.success) {
            reject(new Error(response?.error || 'Unknown error'));
          } else {
            resolve(response.data);
          }
        });
      });

      // Cache and render tags
      const now = Date.now();
      for (const [recordId, properties] of Object.entries(response)) {
        this.propertiesCache.set(recordId, { properties, timestamp: now });

        // Find the row and render tags
        const row = document.querySelector(`tr[data-test-id="row-${recordId}"]`);
        if (row) {
          this.renderTagsForRecord(row, recordId, properties);
        }
      }
    } catch (error) {
      console.error('[RevGuide IndexTags] Error fetching properties:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Render tags for a specific record
   * @param {HTMLElement} row - The table row element
   * @param {string} recordId - The record ID
   * @param {Object} properties - Record properties
   */
  renderTagsForRecord(row, recordId, properties) {
    // Find the name cell
    const nameCell = row.querySelector('td[data-column-index="0"]');
    if (!nameCell) return;

    // Find the MediaBody container to append tags to
    const mediaBody = nameCell.querySelector('[class*="MediaBody"]');
    if (!mediaBody) return;

    // Check if tags already exist in THIS row
    const existingInRow = mediaBody.querySelector('.hshelper-index-tags');
    if (existingInRow) {
      return;
    }

    // Clean up orphaned reference from our map (old DOM element may be gone)
    const oldContainer = this.taggedRecords.get(recordId);
    if (oldContainer && !oldContainer.isConnected) {
      this.taggedRecords.delete(recordId);
    }

    // Evaluate rules against properties
    const context = {
      objectType: this.objectType,
      recordId: recordId
    };

    const matchingRules = this.helper.rulesEngine.evaluateRules(
      this.eligibleBanners,
      properties,
      context
    );

    if (matchingRules.length === 0) return;

    // Take top N by priority (already sorted)
    const tagsToShow = matchingRules.slice(0, this.MAX_TAGS);

    // Create tags container
    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'hshelper-index-tags';
    tagsContainer.dataset.recordId = recordId;

    tagsToShow.forEach(rule => {
      const tag = this.createTag(rule);
      tagsContainer.appendChild(tag);
    });

    // Append to MediaBody (pushes cell height nicely)
    mediaBody.appendChild(tagsContainer);
    this.taggedRecords.set(recordId, tagsContainer);

    // Watch this specific container for our tags being removed
    this.watchForTagRemoval(mediaBody, recordId, properties);
  }

  /**
   * Watch a MediaBody for our tags being removed and restore them
   */
  watchForTagRemoval(mediaBody, recordId, properties) {
    // Don't create multiple observers for same record
    if (this.tagObservers?.has(recordId)) return;
    if (!this.tagObservers) this.tagObservers = new Map();

    const observer = new MutationObserver((mutations) => {
      // Check if our tags were removed
      if (!mediaBody.querySelector('.hshelper-index-tags') && mediaBody.isConnected) {
        // Tags were removed - restore them after a micro-delay
        requestAnimationFrame(() => {
          if (!mediaBody.querySelector('.hshelper-index-tags') && mediaBody.isConnected) {
            const context = { objectType: this.objectType, recordId };
            const matchingRules = this.helper.rulesEngine.evaluateRules(this.eligibleBanners, properties, context);
            if (matchingRules.length === 0) return;

            const tagsToShow = matchingRules.slice(0, this.MAX_TAGS);
            const tagsContainer = document.createElement('div');
            tagsContainer.className = 'hshelper-index-tags';
            tagsContainer.dataset.recordId = recordId;

            tagsToShow.forEach(rule => {
              const tag = this.createTag(rule);
              tagsContainer.appendChild(tag);
            });

            mediaBody.appendChild(tagsContainer);
            this.taggedRecords.set(recordId, tagsContainer);
          }
        });
      }
    });

    observer.observe(mediaBody, { childList: true, subtree: true });
    this.tagObservers.set(recordId, observer);
  }

  /**
   * Create a single tag element
   * @param {Object} rule - The banner rule
   * @returns {HTMLElement} Tag element
   */
  createTag(rule) {
    const tag = document.createElement('span');
    tag.className = `hshelper-index-tag hshelper-index-tag--${rule.type || 'info'}`;
    tag.textContent = rule.title || rule.name;
    tag.dataset.bannerId = rule.id;
    tag.dataset.playId = rule.relatedPlayId || '';
    tag.title = rule.title || rule.name;

    tag.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleTagClick(rule, e);
    });

    return tag;
  }

  /**
   * Handle tag click - open related play in sidepanel or show banner popup
   * @param {Object} rule - The banner rule
   * @param {Event} event - The click event
   */
  handleTagClick(rule, event) {
    if (rule.relatedPlayId) {
      console.log('[RevGuide IndexTags] Opening play:', rule.relatedPlayId);

      // Fetch play data and open sidepanel
      chrome.runtime.sendMessage({ action: 'getContent' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[RevGuide IndexTags] Error getting content:', chrome.runtime.lastError.message);
          return;
        }

        const battleCards = response?.content?.battleCards || [];
        const play = battleCards.find(p => p.id === rule.relatedPlayId);

        chrome.runtime.sendMessage({
          action: 'openSidePanelToPlay',
          playId: rule.relatedPlayId,
          playData: play || null
        });
      });
    } else if (rule.message) {
      // Show banner content in a popup
      console.log('[RevGuide IndexTags] Showing banner popup:', rule.name);
      this.showBannerPopup(rule, event?.target);
    } else {
      // No content to show
      console.log('[RevGuide IndexTags] Tag clicked, no content:', rule.name);
    }
  }

  /**
   * Show banner content in a popup near the clicked tag
   * @param {Object} rule - The banner rule
   * @param {HTMLElement} anchorElement - Element to position popup near
   */
  showBannerPopup(rule, anchorElement) {
    // Remove any existing popup
    this.closeBannerPopup();

    // Create popup element
    const popup = document.createElement('div');
    popup.className = `hshelper-banner-popup hshelper-banner-popup--${rule.type || 'info'}`;
    popup.id = 'hshelper-banner-popup';

    // Create header
    const header = document.createElement('div');
    header.className = 'hshelper-banner-popup__header';
    header.innerHTML = `
      <span class="hshelper-banner-popup__title">${this.helper.escapeHtml(rule.title || rule.name)}</span>
      <button class="hshelper-banner-popup__close" aria-label="Close">&times;</button>
    `;
    popup.appendChild(header);

    // Create content
    const content = document.createElement('div');
    content.className = 'hshelper-banner-popup__content';
    content.innerHTML = rule.message; // Message is HTML content
    popup.appendChild(content);

    // Add close button handler
    header.querySelector('.hshelper-banner-popup__close').addEventListener('click', () => {
      this.closeBannerPopup();
    });

    // Close on click outside
    const handleClickOutside = (e) => {
      if (!popup.contains(e.target) && e.target !== anchorElement) {
        this.closeBannerPopup();
        document.removeEventListener('click', handleClickOutside);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);

    // Close on escape
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        this.closeBannerPopup();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // Position popup
    document.body.appendChild(popup);

    if (anchorElement) {
      const rect = anchorElement.getBoundingClientRect();
      const popupRect = popup.getBoundingClientRect();

      // Position below the tag by default
      let top = rect.bottom + 8;
      let left = rect.left;

      // Keep within viewport
      if (top + popupRect.height > window.innerHeight - 20) {
        top = rect.top - popupRect.height - 8;
      }
      if (left + popupRect.width > window.innerWidth - 20) {
        left = window.innerWidth - popupRect.width - 20;
      }

      popup.style.top = `${top + window.scrollY}px`;
      popup.style.left = `${left + window.scrollX}px`;
    }

    this.currentPopup = popup;
  }

  /**
   * Close the banner popup
   */
  closeBannerPopup() {
    const existing = document.getElementById('hshelper-banner-popup');
    if (existing) {
      existing.remove();
    }
    this.currentPopup = null;
  }

  /**
   * Setup MutationObserver for virtual scrolling and table re-renders
   */
  setupObserver() {
    const table = document.querySelector('[data-test-id="framework-data-table"]') ||
                  document.querySelector('table[role="grid"]') ||
                  document.querySelector('table');

    if (!table) return;

    this.observer = new MutationObserver((mutations) => {
      let hasNewRows = false;
      let hasCellChanges = false;

      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if it's a row or contains rows
            if (node.matches?.('tr[data-test-id^="row-"]')) {
              hasNewRows = true;
            } else if (node.querySelectorAll) {
              const rows = node.querySelectorAll('tr[data-test-id^="row-"]');
              if (rows.length > 0) hasNewRows = true;
            }
            // Check if cell content changed (e.g., column resize causes re-render)
            if (node.matches?.('td') || node.closest?.('td')) {
              hasCellChanges = true;
            }
          }
        });
        // Also check for removed nodes that might be our tags or cells
        mutation.removedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.classList?.contains('hshelper-index-tags') ||
                node.matches?.('td') ||
                node.querySelector?.('.hshelper-index-tags')) {
              hasCellChanges = true;
            }
          }
        });
      });

      if (hasNewRows || hasCellChanges) {
        // Debounce processing - wait for HubSpot to finish DOM updates
        clearTimeout(this.processTimeout);
        this.processTimeout = setTimeout(() => {
          // Use requestAnimationFrame to ensure DOM is stable
          requestAnimationFrame(() => {
            // For cell changes, we need to recheck all rows
            if (hasCellChanges) {
              this.recheckVisibleRows();
            } else {
              this.processVisibleRows();
            }
          });
        }, 150);
      }
    });

    // Observe the table and its parent for changes
    const tableParent = table.closest('[class*="IndexPage"]') || table.parentElement;
    this.observer.observe(tableParent, { childList: true, subtree: true });

    // Also listen for scroll events
    const scrollContainer = tableParent.querySelector('[class*="ScrollContainer"]') || tableParent;
    scrollContainer.addEventListener('scroll', () => {
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = setTimeout(() => {
        this.processVisibleRows();
      }, 200);
    }, { passive: true });
  }

  /**
   * Recheck visible rows for missing tags (used after column resize, etc.)
   */
  recheckVisibleRows() {
    const rows = document.querySelectorAll('tr[data-test-id^="row-"]');

    rows.forEach(row => {
      const testId = row.getAttribute('data-test-id');
      const match = testId.match(/row-(\d+)/);
      if (!match) return;

      const recordId = match[1];
      const nameCell = row.querySelector('td[data-column-index="0"]');
      const mediaBody = nameCell?.querySelector('[class*="MediaBody"]');

      // If row exists but has no tags, and we have cached properties, re-render
      if (mediaBody && !mediaBody.querySelector('.hshelper-index-tags')) {
        const cached = this.propertiesCache.get(recordId);
        if (cached) {
          // Disconnect old observer if it exists (mediaBody was likely replaced)
          if (this.tagObservers?.has(recordId)) {
            this.tagObservers.get(recordId).disconnect();
            this.tagObservers.delete(recordId);
          }
          this.renderTagsForRecord(row, recordId, cached.properties);
        }
      }
    });
  }

  // ============ BOARD VIEW METHODS ============

  /**
   * Process all visible board cards
   */
  processBoardCards() {
    if (this.isProcessing) return;

    // Find all deal/record cards in the board view
    // HubSpot board cards have data-test-id="cdb-column-item" and data-selenium-id for record ID
    const cards = document.querySelectorAll(
      '[data-test-id="cdb-column-item"], [data-test-id="cdb-card"], ' +
      '[class*="CardWrapper__StyledUITile"]'
    );

    console.log('[RevGuide IndexTags] Found', cards.length, 'board cards');

    const recordIds = [];

    cards.forEach(card => {
      // Try to extract record ID from the card
      const recordId = this.extractRecordIdFromCard(card);
      if (!recordId) return;

      // Check if tags already exist
      if (card.querySelector('.hshelper-index-tags')) {
        this.processedRows.add(card);
        return;
      }

      // Check cache
      const cached = this.propertiesCache.get(recordId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        this.renderTagsForBoardCard(card, recordId, cached.properties);
      } else {
        recordIds.push(recordId);
        // Store card reference for later rendering
        if (!this.pendingCards) this.pendingCards = new Map();
        this.pendingCards.set(recordId, card);
      }
      this.processedRows.add(card);
    });

    if (recordIds.length > 0) {
      this.scheduleBatchFetchForBoard(recordIds);
    }
  }

  /**
   * Extract record ID from a board card element
   * @param {HTMLElement} card - The card element
   * @returns {string|null} Record ID or null
   */
  extractRecordIdFromCard(card) {
    // Try data-selenium-id (primary method for HubSpot board cards)
    const seleniumId = card.getAttribute('data-selenium-id');
    if (seleniumId) return seleniumId;

    // Try href in card title link
    const link = card.querySelector('a[data-test-id="board-card-section-title-link"], a[href*="/record/"]');
    if (link) {
      const match = link.href.match(/\/record\/\d+-\d+\/(\d+)/);
      if (match) return match[1];
    }

    // Try other data attributes
    const objectId = card.getAttribute('data-object-id') ||
                     card.getAttribute('data-record-id') ||
                     card.getAttribute('data-deal-id');
    if (objectId) return objectId;

    return null;
  }

  /**
   * Schedule batch fetch for board cards
   * @param {Array} recordIds - Array of record IDs to fetch
   */
  scheduleBatchFetchForBoard(recordIds) {
    recordIds.forEach(id => this.pendingRecordIds.add(id));

    clearTimeout(this.batchTimeout);
    this.batchTimeout = setTimeout(() => {
      this.executeBatchFetchForBoard();
    }, this.BATCH_DELAY);
  }

  /**
   * Execute batch fetch for board cards
   */
  async executeBatchFetchForBoard() {
    if (this.pendingRecordIds.size === 0) return;

    const recordIds = Array.from(this.pendingRecordIds);
    this.pendingRecordIds.clear();
    this.isProcessing = true;

    console.log('[RevGuide IndexTags] Fetching properties for', recordIds.length, 'board cards');

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'fetchBatchRecordProperties',
          objectType: this.objectType,
          recordIds: recordIds,
          portalId: this.portalId
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!response?.success) {
            reject(new Error(response?.error || 'Unknown error'));
          } else {
            resolve(response.data);
          }
        });
      });

      // Cache and render tags
      const now = Date.now();
      for (const [recordId, properties] of Object.entries(response)) {
        this.propertiesCache.set(recordId, { properties, timestamp: now });

        // Find the card and render tags
        const card = this.pendingCards?.get(recordId) ||
                     document.querySelector(`[data-test-id*="card-${recordId}"]`);
        if (card) {
          this.renderTagsForBoardCard(card, recordId, properties);
        }
      }
    } catch (error) {
      console.error('[RevGuide IndexTags] Error fetching board card properties:', error);
    } finally {
      this.isProcessing = false;
      if (this.pendingCards) this.pendingCards.clear();
    }
  }

  /**
   * Render tags for a board card
   * @param {HTMLElement} card - The card element
   * @param {string} recordId - The record ID
   * @param {Object} properties - Record properties
   */
  renderTagsForBoardCard(card, recordId, properties) {
    // Check if tags already exist
    if (card.querySelector('.hshelper-index-tags')) {
      return;
    }

    // Evaluate rules against properties
    const context = {
      objectType: this.objectType,
      recordId: recordId
    };

    const matchingRules = this.helper.rulesEngine.evaluateRules(
      this.eligibleBanners,
      properties,
      context
    );

    if (matchingRules.length === 0) return;

    // Take top N by priority (already sorted)
    const tagsToShow = matchingRules.slice(0, this.MAX_TAGS);

    // Create tags container (styled for board cards)
    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'hshelper-index-tags hshelper-board-tags';
    tagsContainer.dataset.recordId = recordId;

    tagsToShow.forEach(rule => {
      const tag = this.createTag(rule);
      tagsContainer.appendChild(tag);
    });

    // Find best insertion point in the card
    // Preferred: Insert after PROPERTIES section (before PRIORITY section)
    const propertiesSection = card.querySelector('[data-section-key="PROPERTIES"]');
    if (propertiesSection) {
      propertiesSection.parentNode.insertBefore(tagsContainer, propertiesSection.nextSibling);
      this.taggedRecords.set(recordId, tagsContainer);
      return;
    }

    // Alternative: Insert just before the quick actions container (bottom of card)
    const quickActions = card.querySelector('[data-test-id="board-card-quick-actions-container"]');
    if (quickActions) {
      quickActions.parentNode.insertBefore(tagsContainer, quickActions);
      this.taggedRecords.set(recordId, tagsContainer);
      return;
    }

    // Fallback: Insert inside the content wrapper at the end
    const contentWrapper = card.querySelector('[data-test-id="content-wrapper-container"]');
    if (contentWrapper) {
      contentWrapper.appendChild(tagsContainer);
      this.taggedRecords.set(recordId, tagsContainer);
      return;
    }

    // Last resort: append to the card-wrapper-container
    const cardWrapper = card.querySelector('.card-wrapper-container') || card;
    cardWrapper.appendChild(tagsContainer);
    this.taggedRecords.set(recordId, tagsContainer);
  }

  /**
   * Setup MutationObserver for board view
   */
  setupBoardObserver() {
    // Find the board container - look for the parent of column items
    const columnItem = document.querySelector('[data-test-id="cdb-column-item"]');
    const board = columnItem?.closest('[class*="BoardView"], [class*="Pipeline"]') ||
                  columnItem?.parentElement?.parentElement ||
                  document.querySelector('[class*="BoardView"], [class*="PipelineBoard"]');

    if (!board) {
      console.log('[RevGuide IndexTags] Board container not found for observer');
      return;
    }

    // Debounced function to process cards
    const debouncedProcess = () => {
      clearTimeout(this.processTimeout);
      this.processTimeout = setTimeout(() => {
        requestAnimationFrame(() => {
          this.processBoardCards();
        });
      }, 150);
    };

    // MutationObserver for DOM changes
    this.observer = new MutationObserver((mutations) => {
      let shouldProcess = false;

      mutations.forEach(mutation => {
        // Check for added nodes
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches?.('[data-test-id="cdb-column-item"], [data-test-id="cdb-card"]')) {
              shouldProcess = true;
            } else if (node.querySelectorAll) {
              const cards = node.querySelectorAll('[data-test-id="cdb-column-item"], [data-test-id="cdb-card"]');
              if (cards.length > 0) shouldProcess = true;
            }
          }
        });

        // Check for attribute changes (HubSpot may reuse cards with new data)
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-selenium-id') {
          shouldProcess = true;
        }
      });

      if (shouldProcess) {
        debouncedProcess();
      }
    });

    // Observe with attributes to catch card content changes
    this.observer.observe(board, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-selenium-id']
    });

    // Add scroll listeners to each column (board columns scroll independently)
    const columns = board.querySelectorAll('[class*="Column"], [class*="Stage"]');
    columns.forEach(column => {
      const scrollContainer = column.querySelector('[class*="ScrollContainer"], [class*="Droppable"]') || column;
      scrollContainer.addEventListener('scroll', debouncedProcess, { passive: true });
    });

    // Also add scroll listener to the board itself
    board.addEventListener('scroll', debouncedProcess, { passive: true });

    // Fallback: check for untagged cards periodically when board is visible
    this.boardCheckInterval = setInterval(() => {
      const untaggedCards = document.querySelectorAll(
        '[data-test-id="cdb-column-item"]:not(:has(.hshelper-index-tags))'
      );
      if (untaggedCards.length > 0) {
        console.log('[RevGuide IndexTags] Found', untaggedCards.length, 'untagged cards, processing...');
        this.processBoardCards();
      }
    }, 2000);

    console.log('[RevGuide IndexTags] Board observer and scroll listeners attached');
  }

  /**
   * Clean up the module
   */
  cleanup() {
    // Disconnect observer
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // Clear timeouts and intervals
    clearTimeout(this.batchTimeout);
    clearTimeout(this.processTimeout);
    clearTimeout(this.scrollTimeout);
    clearInterval(this.boardCheckInterval);

    // Remove all tag containers
    this.taggedRecords.forEach((container) => {
      container.remove();
    });
    this.taggedRecords.clear();

    // Clear tag observers
    if (this.tagObservers) {
      this.tagObservers.forEach(observer => observer.disconnect());
      this.tagObservers.clear();
    }

    // Clear caches
    this.propertiesCache.clear();
    this.pendingRecordIds.clear();
    this.processedRows = new WeakSet();
    this.renderCooldown.clear();

    console.log('[RevGuide IndexTags] Cleanup complete');
  }
}

// Export for use in content.js
if (typeof window !== 'undefined') {
  window.IndexTagsModule = IndexTagsModule;
}
