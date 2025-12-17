/**
 * Storage Manager for RevGuide
 * Handles persistence of rules, plays, and settings
 */

let cachedWikiCacheBuilder = null;

function getWikiCacheBuilder() {
  if (cachedWikiCacheBuilder !== null) {
    return cachedWikiCacheBuilder;
  }

  if (typeof globalThis !== 'undefined' && globalThis.RevGuideWikiCache?.buildWikiTermMapCache) {
    cachedWikiCacheBuilder = globalThis.RevGuideWikiCache.buildWikiTermMapCache;
    return cachedWikiCacheBuilder;
  }

  if (typeof require !== 'undefined') {
    try {
      cachedWikiCacheBuilder = require('./wiki-cache').buildWikiTermMapCache;
      return cachedWikiCacheBuilder;
    } catch (e) {
      // Ignore and fall through
    }
  }

  cachedWikiCacheBuilder = null;
  return null;
}

class StorageManager {
  constructor() {
    this.defaultData = {
      rules: [],
      battleCards: [],
      wikiEntries: [],
      settings: {
        enabled: true,
        showBanners: true,
        showBattleCards: true,
        showWiki: true,
        bannerPosition: 'top', // top, bottom
        theme: 'light'
      }
    };
  }

  /**
   * Get all stored data
   */
  async getAll() {
    return new Promise((resolve) => {
      chrome.storage.local.get(this.defaultData, (result) => {
        resolve(result);
      });
    });
  }

  /**
   * Get rules
   */
  async getRules() {
    const data = await this.getAll();
    return data.rules || [];
  }

  /**
   * Save rules
   */
  async saveRules(rules) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ rules }, resolve);
    });
  }

  /**
   * Add a rule
   */
  async addRule(rule) {
    const rules = await this.getRules();
    rule.id = rule.id || this.generateId();
    rule.createdAt = rule.createdAt || Date.now();
    rules.push(rule);
    await this.saveRules(rules);
    return rule;
  }

  /**
   * Update a rule
   */
  async updateRule(ruleId, updates) {
    const rules = await this.getRules();
    const index = rules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      rules[index] = { ...rules[index], ...updates, updatedAt: Date.now() };
      await this.saveRules(rules);
      return rules[index];
    }
    return null;
  }

  /**
   * Delete a rule
   */
  async deleteRule(ruleId) {
    const rules = await this.getRules();
    const filtered = rules.filter(r => r.id !== ruleId);
    await this.saveRules(filtered);
    return true;
  }

  /**
   * Get plays
   */
  async getBattleCards() {
    const data = await this.getAll();
    return data.battleCards || [];
  }

  /**
   * Save plays
   */
  async saveBattleCards(battleCards) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ battleCards }, resolve);
    });
  }

  /**
   * Add a play
   */
  async addBattleCard(card) {
    const cards = await this.getBattleCards();
    card.id = card.id || this.generateId();
    card.createdAt = card.createdAt || Date.now();
    cards.push(card);
    await this.saveBattleCards(cards);
    return card;
  }

  /**
   * Update a play
   */
  async updateBattleCard(cardId, updates) {
    const cards = await this.getBattleCards();
    const index = cards.findIndex(c => c.id === cardId);
    if (index !== -1) {
      cards[index] = { ...cards[index], ...updates, updatedAt: Date.now() };
      await this.saveBattleCards(cards);
      return cards[index];
    }
    return null;
  }

  /**
   * Delete a play
   */
  async deleteBattleCard(cardId) {
    const cards = await this.getBattleCards();
    const filtered = cards.filter(c => c.id !== cardId);
    await this.saveBattleCards(filtered);
    return true;
  }

  /**
   * Get wiki entries
   */
  async getWikiEntries() {
    const data = await this.getAll();
    return data.wikiEntries || [];
  }

  /**
   * Save wiki entries
   * Also builds and stores pre-computed term map cache for faster tooltip loading
   */
  async saveWikiEntries(wikiEntries) {
    // Build pre-computed cache
    const cacheData = this.buildWikiTermMapCache(wikiEntries);

    return new Promise((resolve) => {
      chrome.storage.local.set({
        wikiEntries,
        wikiTermMapCache: cacheData.termMap,
        wikiEntriesById: cacheData.entriesById,
        wikiCacheVersion: Date.now()
      }, resolve);
    });
  }

  /**
   * Build wiki term map cache for faster tooltip loading
   * @param {Array} wikiEntries
   * @returns {Object} { termMap, entriesById }
   */
  buildWikiTermMapCache(wikiEntries) {
    const builder = getWikiCacheBuilder();
    if (!builder) {
      console.warn('[RevGuide] Wiki cache builder not available');
      return { termMap: {}, entriesById: {} };
    }
    return builder(wikiEntries);
  }

  /**
   * Add a wiki entry
   */
  async addWikiEntry(entry) {
    const entries = await this.getWikiEntries();
    entry.id = entry.id || this.generateId();
    entry.createdAt = entry.createdAt || Date.now();
    entries.push(entry);
    await this.saveWikiEntries(entries);
    return entry;
  }

  /**
   * Update a wiki entry
   */
  async updateWikiEntry(entryId, updates) {
    const entries = await this.getWikiEntries();
    const index = entries.findIndex(e => e.id === entryId);
    if (index !== -1) {
      entries[index] = { ...entries[index], ...updates, updatedAt: Date.now() };
      await this.saveWikiEntries(entries);
      return entries[index];
    }
    return null;
  }

  /**
   * Delete a wiki entry
   */
  async deleteWikiEntry(entryId) {
    const entries = await this.getWikiEntries();
    const filtered = entries.filter(e => e.id !== entryId);
    await this.saveWikiEntries(filtered);
    return true;
  }

  /**
   * Get settings
   */
  async getSettings() {
    const data = await this.getAll();
    return { ...this.defaultData.settings, ...data.settings };
  }

  /**
   * Save settings
   */
  async saveSettings(settings) {
    const current = await this.getSettings();
    const updated = { ...current, ...settings };
    return new Promise((resolve) => {
      chrome.storage.local.set({ settings: updated }, resolve);
    });
  }

  /**
   * Export all data
   */
  async exportData() {
    const data = await this.getAll();
    return JSON.stringify(data, null, 2);
  }

  /**
   * Import data
   */
  async importData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      return new Promise((resolve) => {
        chrome.storage.local.set(data, () => {
          resolve(true);
        });
      });
    } catch (e) {
      console.error('Import failed:', e);
      return false;
    }
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}

// Export for use in different contexts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StorageManager;
}
