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

    // Filter to banners that have showOnIndex enabled and match object type
    this.eligibleBanners = this.getEligibleBanners();
    console.log('[RevGuide IndexTags] Found', this.eligibleBanners.length, 'eligible banners');

    if (this.eligibleBanners.length === 0) {
      console.log('[RevGuide IndexTags] No eligible banners, skipping');
      return;
    }

    // Wait for table to be ready
    await this.waitForTable();

    // Process visible rows
    this.processVisibleRows();

    // Setup observer for virtual scrolling
    this.setupObserver();
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
   * Get banners eligible for index page display
   * @returns {Array} Filtered and sorted banners
   */
  getEligibleBanners() {
    const rules = this.helper.rules || [];

    return rules.filter(rule => {
      // Must be enabled
      if (rule.enabled === false) return false;

      // Must have showOnIndex enabled
      if (!rule.showOnIndex) return false;

      // Must match object type (or have none specified)
      if (rule.objectTypes?.length > 0) {
        if (!rule.objectTypes.includes(this.objectType)) return false;
      }

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
      this.handleTagClick(rule);
    });

    return tag;
  }

  /**
   * Handle tag click - open related play in sidepanel
   * @param {Object} rule - The banner rule
   */
  handleTagClick(rule) {
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
    } else {
      // No related play - could show banner details in a tooltip/modal
      console.log('[RevGuide IndexTags] Tag clicked, no related play:', rule.name);
    }
  }

  /**
   * Setup MutationObserver for virtual scrolling
   */
  setupObserver() {
    const table = document.querySelector('[data-test-id="framework-data-table"]') ||
                  document.querySelector('table[role="grid"]') ||
                  document.querySelector('table');

    if (!table) return;

    this.observer = new MutationObserver((mutations) => {
      let hasNewRows = false;

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
          }
        });
      });

      if (hasNewRows) {
        // Debounce processing - wait for HubSpot to finish DOM updates
        clearTimeout(this.processTimeout);
        this.processTimeout = setTimeout(() => {
          // Use requestAnimationFrame to ensure DOM is stable
          requestAnimationFrame(() => {
            this.processVisibleRows();
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
   * Clean up the module
   */
  cleanup() {
    // Disconnect observer
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    // Clear timeouts
    clearTimeout(this.batchTimeout);
    clearTimeout(this.processTimeout);
    clearTimeout(this.scrollTimeout);

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
