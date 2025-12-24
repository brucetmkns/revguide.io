/**
 * Content Recommendation Engine for RevGuide
 * Evaluates tag rules and matches recommended content based on:
 *   1. Tag-based matching: Tag rules output tags, content with matching tags shown
 *   2. Direct conditions: Per-asset conditions evaluated against record properties
 *   3. Hybrid: Content can use both methods (OR logic between them)
 */

(function(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.RevGuideContentRecommendations = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {

  class ContentRecommendationEngine {
    /**
     * @param {RulesEngine} rulesEngine - Instance of RevGuideRulesEngine for condition evaluation
     */
    constructor(rulesEngine) {
      this.rulesEngine = rulesEngine;
    }

    /**
     * Get active tags based on current context by evaluating all tag rules
     * @param {Array} tagRules - All tag rules from database
     * @param {Object} properties - Current record properties
     * @param {Object} context - { objectType, pipeline, stage }
     * @returns {Set<string>} Set of active tag IDs
     */
    getActiveTags(tagRules, properties, context) {
      const activeTags = new Set();

      if (!tagRules || tagRules.length === 0) {
        console.log('[RevGuide ContentRec] No tag rules to evaluate');
        return activeTags;
      }

      console.log('[RevGuide ContentRec] Evaluating', tagRules.length, 'tag rules');

      for (const rule of tagRules) {
        // Skip disabled rules
        if (rule.enabled === false) {
          continue;
        }

        // Check object type match
        if (rule.objectTypes && rule.objectTypes.length > 0) {
          if (!context.objectType || !rule.objectTypes.includes(context.objectType)) {
            continue;
          }
        }

        // Check pipeline match
        if (rule.pipelines && rule.pipelines.length > 0) {
          if (!context.pipeline || !rule.pipelines.includes(context.pipeline)) {
            continue;
          }
        }

        // Check stage match
        if (rule.stages && rule.stages.length > 0) {
          if (!context.stage || !rule.stages.includes(context.stage)) {
            continue;
          }
        }

        // Evaluate conditions using the rules engine
        const conditionsMatch = this.rulesEngine.evaluateRule(rule, properties);

        if (conditionsMatch) {
          // Add all output tags from this rule
          const outputTags = rule.outputTagIds || [];
          outputTags.forEach(tagId => {
            activeTags.add(tagId);
            console.log('[RevGuide ContentRec] Tag rule', rule.name, 'activated tag:', tagId);
          });
        }
      }

      console.log('[RevGuide ContentRec] Active tags:', Array.from(activeTags));
      return activeTags;
    }

    /**
     * Check if content matches via direct conditions (same logic as banners)
     * @param {Object} content - Content item with conditions
     * @param {Object} properties - Record properties
     * @param {Object} context - { objectType, pipeline, stage }
     * @returns {boolean}
     */
    matchesDirectConditions(content, properties, context) {
      // displayOnAll bypasses all conditions
      if (content.displayOnAll) {
        return true;
      }

      // Check object type restriction
      if (content.objectTypes && content.objectTypes.length > 0) {
        if (!context.objectType || !content.objectTypes.includes(context.objectType)) {
          return false;
        }
      }

      // Check pipeline restriction
      if (content.pipelines && content.pipelines.length > 0) {
        if (!context.pipeline || !content.pipelines.includes(context.pipeline)) {
          return false;
        }
      }

      // Check stage restriction
      if (content.stages && content.stages.length > 0) {
        if (!context.stage || !content.stages.includes(context.stage)) {
          return false;
        }
      }

      // If no conditions defined, direct matching doesn't apply
      const hasConditions = (content.conditions && content.conditions.length > 0) ||
                           (content.conditionGroups && content.conditionGroups.length > 0);

      if (!hasConditions) {
        return false; // No direct conditions defined
      }

      // Evaluate conditions using rules engine
      return this.rulesEngine.evaluateRule(content, properties);
    }

    /**
     * Check if content matches via tag-based matching
     * @param {Object} content - Content item with tagIds
     * @param {Set<string>} activeTags - Currently active tag IDs
     * @returns {boolean}
     */
    matchesTags(content, activeTags) {
      if (!content.tagIds || content.tagIds.length === 0) {
        return false; // No tags defined
      }

      // Content matches if ANY of its tags are active
      const hasMatchingTag = content.tagIds.some(tagId => activeTags.has(tagId));
      return hasMatchingTag;
    }

    /**
     * Get matching content recommendations
     * Content matches if EITHER tags match OR direct conditions match (OR logic)
     *
     * @param {Array} content - All recommended content items
     * @param {Set<string>} activeTags - Currently active tag IDs
     * @param {Object} properties - Record properties
     * @param {Object} context - { objectType, pipeline, stage }
     * @returns {Array} Matching content items sorted by priority
     */
    getMatchingContent(content, activeTags, properties, context) {
      const matching = [];

      if (!content || content.length === 0) {
        return matching;
      }

      console.log('[RevGuide ContentRec] Evaluating', content.length, 'content items');

      for (const item of content) {
        // Skip disabled content
        if (item.enabled === false) {
          continue;
        }

        // Check tag-based matching
        const tagsMatch = this.matchesTags(item, activeTags);

        // Check direct conditions matching
        const directMatch = this.matchesDirectConditions(item, properties, context);

        // Content shows if EITHER method matches (OR logic)
        const shouldInclude = tagsMatch || directMatch;

        if (shouldInclude) {
          console.log('[RevGuide ContentRec] Content matched:', item.title,
            '| Tags:', tagsMatch, '| Direct:', directMatch);
          matching.push(item);
        }
      }

      // Sort by priority (higher first), then by title
      const sorted = matching.sort((a, b) => {
        const priorityDiff = (b.priority || 0) - (a.priority || 0);
        if (priorityDiff !== 0) return priorityDiff;
        return (a.title || '').localeCompare(b.title || '');
      });

      console.log('[RevGuide ContentRec] Total matching content:', sorted.length);
      return sorted;
    }

    /**
     * Main entry point - get all recommendations for current context
     *
     * @param {Object} data - { tagRules, recommendedContent, contentTags }
     * @param {Object} properties - Current record properties
     * @param {Object} context - { objectType, pipeline, stage }
     * @returns {Object} { recommendations: Array, activeTags: Array, tagMap: Object }
     */
    getRecommendations(data, properties, context) {
      const { tagRules = [], recommendedContent = [], contentTags = [] } = data;

      // Build tag lookup map for display purposes
      const tagMap = {};
      contentTags.forEach(tag => {
        tagMap[tag.id] = tag;
      });

      // Get active tags from tag rules
      const activeTags = this.getActiveTags(tagRules, properties, context);

      // Get matching content
      const recommendations = this.getMatchingContent(
        recommendedContent,
        activeTags,
        properties,
        context
      );

      // Enrich recommendations with tag details for display
      const enrichedRecommendations = recommendations.map(item => ({
        ...item,
        tags: (item.tagIds || [])
          .map(id => tagMap[id])
          .filter(Boolean) // Remove any missing tags
      }));

      return {
        recommendations: enrichedRecommendations,
        activeTags: Array.from(activeTags),
        tagMap
      };
    }

    /**
     * Group recommendations by category for display
     * @param {Array} recommendations - Array of content items
     * @returns {Object} { categoryName: [items], ... }
     */
    groupByCategory(recommendations) {
      const grouped = {};

      recommendations.forEach(item => {
        const category = item.category || 'Other';
        if (!grouped[category]) {
          grouped[category] = [];
        }
        grouped[category].push(item);
      });

      return grouped;
    }

    /**
     * Group recommendations by content type for display
     * @param {Array} recommendations - Array of content items
     * @returns {Object} { contentType: [items], ... }
     */
    groupByType(recommendations) {
      const grouped = {};
      const typeLabels = {
        external_link: 'Links',
        hubspot_document: 'Documents',
        hubspot_sequence: 'Sequences'
      };

      recommendations.forEach(item => {
        const type = item.contentType || 'external_link';
        const label = typeLabels[type] || type;
        if (!grouped[label]) {
          grouped[label] = [];
        }
        grouped[label].push(item);
      });

      return grouped;
    }
  }

  return ContentRecommendationEngine;
});
