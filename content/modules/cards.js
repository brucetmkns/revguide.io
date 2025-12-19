/**
 * RevGuide - Cards Module (Unified Content Orchestrator)
 *
 * Orchestrates the display of unified cards based on their display modes.
 * Cards can show as tooltips (definition), banners (alert), or side panel (battlecard).
 *
 * This module:
 * - Loads cards from storage (unified format)
 * - Routes cards to appropriate display modules based on displayModes
 * - Handles backward compatibility with legacy data formats
 * - Coordinates updates when context changes
 *
 * Card Types:
 * - definition: Shows as tooltip (like wiki entries)
 * - alert: Shows as banner notification
 * - battlecard: Shows in side panel
 * - asset: Shows as shareable link
 *
 * Display Modes:
 * - tooltip: Inline tooltip icon with popup
 * - banner: Banner at top of page
 * - sidepanel: Appears in side panel FAB
 *
 * Dependencies:
 * - WikiModule for tooltip display
 * - BannersModule for banner display
 * - SidePanelModule for FAB and side panel
 * - RulesEngine for condition evaluation
 *
 * Usage:
 *   const cards = new CardsModule(helper);
 *   cards.load();
 *   cards.apply(context);
 *   cards.cleanup();
 */

class CardsModule {
  /**
   * @param {Object} helper - Reference to main HubSpotHelper instance
   */
  constructor(helper) {
    this.helper = helper;
    this.cards = [];
    this.cardsLoaded = false;

    // Track which cards are active by display mode
    this.activeTooltipCards = [];
    this.activeBannerCards = [];
    this.activeSidepanelCards = [];
  }

  // ============ DATA LOADING ============

  /**
   * Load cards from storage
   * Handles both unified cards format and legacy format
   */
  async load() {
    return new Promise((resolve) => {
      chrome.storage.local.get({
        cards: [],
        // Legacy keys for backward compatibility
        wikiEntries: [],
        rules: [],
        battleCards: []
      }, (data) => {
        // Check if we have unified cards
        if (data.cards && data.cards.length > 0) {
          this.cards = data.cards;
          this.cardsLoaded = true;
          this.log('Loaded', this.cards.length, 'unified cards');
        } else {
          // Convert legacy data to cards format
          this.cards = this.convertLegacyData(data);
          this.cardsLoaded = true;
          this.log('Converted legacy data to', this.cards.length, 'cards');
        }
        resolve(this.cards);
      });
    });
  }

  /**
   * Convert legacy data (wikiEntries, rules, battleCards) to unified cards format
   * @param {Object} data - Object containing legacy arrays
   * @returns {Array} Unified cards array
   */
  convertLegacyData(data) {
    const cards = [];

    // Convert wiki entries to definition cards
    if (data.wikiEntries && data.wikiEntries.length > 0) {
      data.wikiEntries.forEach(wiki => {
        cards.push({
          id: wiki.id,
          cardType: 'definition',
          name: wiki.title || wiki.trigger,
          title: wiki.title,
          content: wiki.definition,
          link: wiki.link,
          displayModes: ['tooltip'],
          enabled: wiki.enabled !== false,
          triggerText: wiki.trigger,
          aliases: wiki.aliases || [],
          matchType: wiki.matchType || 'exact',
          category: wiki.category || 'general',
          objectTypes: wiki.objectType ? [wiki.objectType] : [],
          propertyGroup: wiki.propertyGroup,
          priority: wiki.priority || 50,
          conditions: [],
          logic: 'AND',
          displayOnAll: false,
          legacyType: 'wiki',
          legacyId: wiki.id
        });
      });
    }

    // Convert rules (banners) to alert cards
    if (data.rules && data.rules.length > 0) {
      data.rules.forEach(rule => {
        // Handle embed type separately
        const cardType = rule.type === 'embed' ? 'alert' : 'alert';
        cards.push({
          id: rule.id,
          cardType: cardType,
          name: rule.name,
          title: rule.title,
          content: rule.message,
          link: rule.link,
          displayModes: ['banner'],
          enabled: rule.enabled !== false,
          bannerType: rule.type || 'info',
          embedUrl: rule.embedUrl,
          objectTypes: rule.objectTypes || [],
          conditions: rule.conditions || [],
          logic: rule.logic || 'AND',
          displayOnAll: rule.displayOnAll || false,
          priority: rule.priority || 50,
          tabVisibility: rule.tabVisibility || 'all',
          legacyType: 'banner',
          legacyId: rule.id
        });
      });
    }

    // Convert battleCards (plays) to battlecard cards
    if (data.battleCards && data.battleCards.length > 0) {
      data.battleCards.forEach(play => {
        cards.push({
          id: play.id,
          cardType: 'battlecard',
          name: play.name,
          title: play.name,
          subtitle: play.subtitle,
          content: play.overview || '',
          link: play.link,
          displayModes: ['sidepanel'],
          enabled: play.enabled !== false,
          battlecardType: play.type || 'competitor',
          sections: play.sections || [],
          objectTypes: play.objectTypes || (play.objectType ? [play.objectType] : []),
          conditions: play.conditions || [],
          logic: play.logic || 'AND',
          displayOnAll: play.displayOnAll || false,
          priority: play.priority || 50,
          legacyType: 'play',
          legacyId: play.id
        });
      });
    }

    return cards;
  }

  // ============ CARD FILTERING ============

  /**
   * Get cards by display mode
   * @param {string} mode - Display mode ('tooltip', 'banner', 'sidepanel')
   * @returns {Array} Cards with this display mode
   */
  getCardsByDisplayMode(mode) {
    return this.cards.filter(card =>
      card.enabled !== false &&
      card.displayModes &&
      card.displayModes.includes(mode)
    );
  }

  /**
   * Get cards by type
   * @param {string} type - Card type ('definition', 'alert', 'battlecard', 'asset')
   * @returns {Array} Cards of this type
   */
  getCardsByType(type) {
    return this.cards.filter(card =>
      card.enabled !== false &&
      card.cardType === type
    );
  }

  /**
   * Get cards that match current context
   * @param {Object} context - Current page context
   * @param {string} context.objectType - HubSpot object type (contacts, deals, etc.)
   * @param {Object} context.properties - Current record properties
   * @returns {Object} Object with arrays for each display mode
   */
  getMatchingCards(context) {
    const result = {
      tooltip: [],
      banner: [],
      sidepanel: []
    };

    if (!this.cardsLoaded || !this.cards.length) {
      return result;
    }

    const objectType = context.objectType || '';
    const properties = context.properties || {};

    this.cards.forEach(card => {
      if (card.enabled === false) return;
      if (!card.displayModes || card.displayModes.length === 0) return;

      // Check if card applies to this object type
      const cardObjectTypes = card.objectTypes || [];
      const objectTypeMatch = cardObjectTypes.length === 0 ||
                              cardObjectTypes.includes(objectType);

      if (!objectTypeMatch) return;

      // For cards with conditions, evaluate them
      if (card.conditions && card.conditions.length > 0 && !card.displayOnAll) {
        const conditionsMatch = this.evaluateConditions(card.conditions, properties, card.logic);
        if (!conditionsMatch) return;
      }

      // Add to appropriate display mode arrays
      card.displayModes.forEach(mode => {
        if (result[mode]) {
          result[mode].push(card);
        }
      });
    });

    // Sort by priority (higher first)
    Object.keys(result).forEach(mode => {
      result[mode].sort((a, b) => (b.priority || 50) - (a.priority || 50));
    });

    return result;
  }

  /**
   * Evaluate card conditions against properties
   * @param {Array} conditions - Condition objects
   * @param {Object} properties - Record properties
   * @param {string} logic - 'AND' or 'OR'
   * @returns {boolean} Whether conditions match
   */
  evaluateConditions(conditions, properties, logic = 'AND') {
    if (!conditions || conditions.length === 0) return true;

    const results = conditions.map(condition => {
      const propertyValue = properties[condition.property];
      const conditionValue = condition.value;
      const operator = condition.operator;

      // Handle different operators
      switch (operator) {
        case 'equals':
          return String(propertyValue).toLowerCase() === String(conditionValue).toLowerCase();
        case 'not_equals':
          return String(propertyValue).toLowerCase() !== String(conditionValue).toLowerCase();
        case 'contains':
          return String(propertyValue || '').toLowerCase().includes(String(conditionValue).toLowerCase());
        case 'not_contains':
          return !String(propertyValue || '').toLowerCase().includes(String(conditionValue).toLowerCase());
        case 'starts_with':
          return String(propertyValue || '').toLowerCase().startsWith(String(conditionValue).toLowerCase());
        case 'ends_with':
          return String(propertyValue || '').toLowerCase().endsWith(String(conditionValue).toLowerCase());
        case 'greater_than':
          return Number(propertyValue) > Number(conditionValue);
        case 'less_than':
          return Number(propertyValue) < Number(conditionValue);
        case 'is_empty':
          return !propertyValue || propertyValue === '' || propertyValue === null;
        case 'is_not_empty':
          return propertyValue && propertyValue !== '' && propertyValue !== null;
        default:
          return false;
      }
    });

    if (logic === 'OR') {
      return results.some(r => r);
    }
    return results.every(r => r);
  }

  // ============ CARD APPLICATION ============

  /**
   * Apply cards based on context
   * Routes to appropriate display modules
   * @param {Object} context - Current page context
   */
  apply(context) {
    if (!this.cardsLoaded) {
      this.log('Cards not loaded yet');
      return;
    }

    const matching = this.getMatchingCards(context);
    this.log('Matching cards:', {
      tooltip: matching.tooltip.length,
      banner: matching.banner.length,
      sidepanel: matching.sidepanel.length
    });

    // Store active cards
    this.activeTooltipCards = matching.tooltip;
    this.activeBannerCards = matching.banner;
    this.activeSidepanelCards = matching.sidepanel;

    // Note: The actual rendering is delegated to existing modules
    // This orchestrator prepares the data in the right format
  }

  /**
   * Get cards formatted for WikiModule (tooltip display)
   * Converts unified cards to wiki entry format for compatibility
   * @returns {Array} Wiki-compatible entry objects
   */
  getTooltipEntriesForWiki() {
    return this.activeTooltipCards.map(card => ({
      id: card.id,
      title: card.name || card.triggerText,
      trigger: card.triggerText || card.name,
      definition: card.content,
      link: card.link,
      aliases: card.aliases || [],
      matchType: card.matchType || 'exact',
      category: card.category || 'general',
      objectType: card.objectTypes?.[0] || null,
      propertyGroup: card.propertyGroup,
      priority: card.priority || 50,
      enabled: card.enabled !== false
    }));
  }

  /**
   * Get cards formatted for BannersModule
   * Converts unified cards to banner rule format for compatibility
   * @returns {Array} Banner-compatible rule objects
   */
  getBannerRulesForBanners() {
    return this.activeBannerCards.map(card => ({
      id: card.id,
      name: card.name,
      title: card.title,
      message: card.content,
      type: card.bannerType || 'info',
      embedUrl: card.embedUrl,
      link: card.link,
      objectTypes: card.objectTypes || [],
      conditions: card.conditions || [],
      logic: card.logic || 'AND',
      displayOnAll: card.displayOnAll || false,
      priority: card.priority || 50,
      enabled: card.enabled !== false,
      tabVisibility: card.tabVisibility || 'all'
    }));
  }

  /**
   * Get cards formatted for SidePanelModule
   * Converts unified cards to battle card format for compatibility
   * @returns {Array} Battle card compatible objects
   */
  getBattleCardsForSidepanel() {
    return this.activeSidepanelCards.map(card => ({
      id: card.id,
      name: card.name,
      subtitle: card.subtitle,
      type: card.battlecardType || 'competitor',
      overview: card.content,
      link: card.link,
      sections: card.sections || [],
      objectTypes: card.objectTypes || [],
      conditions: card.conditions || [],
      logic: card.logic || 'AND',
      displayOnAll: card.displayOnAll || false,
      priority: card.priority || 50,
      enabled: card.enabled !== false,
      // New unified card features
      assets: card.assets || [],
      nextSteps: card.nextSteps || [],
      relatedCardIds: card.relatedCardIds || []
    }));
  }

  // ============ CLEANUP ============

  /**
   * Clean up module state
   */
  cleanup() {
    this.activeTooltipCards = [];
    this.activeBannerCards = [];
    this.activeSidepanelCards = [];
  }

  /**
   * Full reset including data
   */
  reset() {
    this.cleanup();
    this.cards = [];
    this.cardsLoaded = false;
  }

  // ============ UTILITIES ============

  /**
   * Log message with module prefix
   */
  log(...args) {
    console.log('[RevGuide Cards]', ...args);
  }

  /**
   * Get summary of loaded cards
   * @returns {Object} Card counts by type and mode
   */
  getSummary() {
    const byType = {
      definition: 0,
      alert: 0,
      battlecard: 0,
      asset: 0
    };

    const byMode = {
      tooltip: 0,
      banner: 0,
      sidepanel: 0
    };

    this.cards.forEach(card => {
      if (byType[card.cardType] !== undefined) {
        byType[card.cardType]++;
      }
      (card.displayModes || []).forEach(mode => {
        if (byMode[mode] !== undefined) {
          byMode[mode]++;
        }
      });
    });

    return {
      total: this.cards.length,
      enabled: this.cards.filter(c => c.enabled !== false).length,
      byType,
      byMode
    };
  }
}

// Export for use in content script
if (typeof window !== 'undefined') {
  window.CardsModule = CardsModule;
}
