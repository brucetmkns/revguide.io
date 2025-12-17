/**
 * RevGuide - Wiki Term Map Cache
 * Shared cache builder for wiki entries
 */

(function(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.RevGuideWikiCache = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  /**
   * Build a pre-computed term map cache from wiki entries
   * @param {Array} wikiEntries
   * @returns {{ termMap: Object, entriesById: Object }}
   */
  function buildWikiTermMapCache(wikiEntries) {
    const termMap = {};
    const entriesById = {};

    const enabledEntries = (wikiEntries || []).filter(e => e.enabled !== false);

    for (const entry of enabledEntries) {
      entriesById[entry.id] = entry;

      const primaryTrigger = entry.trigger || entry.term;
      if (!primaryTrigger) continue;

      const triggers = [primaryTrigger, ...(entry.aliases || [])];

      for (const trigger of triggers) {
        if (trigger && trigger.trim()) {
          termMap[trigger.toLowerCase().trim()] = entry.id;
        }
      }
    }

    return { termMap, entriesById };
  }

  return { buildWikiTermMapCache };
});
