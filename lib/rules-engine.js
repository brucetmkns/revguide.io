/**
 * Rules Engine for RevGuide
 * Evaluates property-based rules and determines which banners/cards to show
 */

class RulesEngine {
  constructor() {
    this.operators = {
      equals: (a, b) => String(a).toLowerCase() === String(b).toLowerCase(),
      not_equals: (a, b) => String(a).toLowerCase() !== String(b).toLowerCase(),
      contains: (a, b) => String(a).toLowerCase().includes(String(b).toLowerCase()),
      not_contains: (a, b) => !String(a).toLowerCase().includes(String(b).toLowerCase()),
      starts_with: (a, b) => String(a).toLowerCase().startsWith(String(b).toLowerCase()),
      ends_with: (a, b) => String(a).toLowerCase().endsWith(String(b).toLowerCase()),
      greater_than: (a, b) => parseFloat(a) > parseFloat(b),
      less_than: (a, b) => parseFloat(a) < parseFloat(b),
      greater_equal: (a, b) => parseFloat(a) >= parseFloat(b),
      less_equal: (a, b) => parseFloat(a) <= parseFloat(b),
      is_empty: (a) => !a || String(a).trim() === '',
      is_not_empty: (a) => a && String(a).trim() !== '',
      in_list: (a, b) => {
        const list = String(b).split(',').map(s => s.trim().toLowerCase());
        return list.includes(String(a).toLowerCase());
      },
      not_in_list: (a, b) => {
        const list = String(b).split(',').map(s => s.trim().toLowerCase());
        return !list.includes(String(a).toLowerCase());
      }
    };
  }

  /**
   * Evaluate a single condition against record properties
   */
  evaluateCondition(condition, properties) {
    const { property, operator, value } = condition;
    const propertyValue = properties[property];

    const operatorFn = this.operators[operator];
    if (!operatorFn) {
      console.warn(`Unknown operator: ${operator}`);
      return false;
    }

    return operatorFn(propertyValue, value);
  }

  /**
   * Evaluate a rule (with multiple conditions and logic)
   */
  evaluateRule(rule, properties) {
    // No conditions = always matches
    if (!rule.conditions || rule.conditions.length === 0) {
      return true;
    }

    const logic = rule.logic || 'AND';

    if (logic === 'AND') {
      return rule.conditions.every(condition =>
        this.evaluateCondition(condition, properties)
      );
    } else if (logic === 'OR') {
      return rule.conditions.some(condition =>
        this.evaluateCondition(condition, properties)
      );
    }

    return false;
  }

  /**
   * Evaluate all rules and return matching ones
   */
  evaluateRules(rules, properties, context = {}) {
    const matchingRules = [];

    for (const rule of rules) {
      // Check if rule is enabled
      if (rule.enabled === false) continue;

      // Check if rule applies to current object type
      if (rule.objectTypes && rule.objectTypes.length > 0) {
        if (!context.objectType || !rule.objectTypes.includes(context.objectType)) {
          continue;
        }
      }

      // Check if rule applies to current pipeline/stage
      if (rule.pipelines && rule.pipelines.length > 0) {
        if (!context.pipeline || !rule.pipelines.includes(context.pipeline)) {
          continue;
        }
      }

      if (rule.stages && rule.stages.length > 0) {
        if (!context.stage || !rule.stages.includes(context.stage)) {
          continue;
        }
      }

      // Evaluate conditions
      if (this.evaluateRule(rule, properties)) {
        matchingRules.push(rule);
      }
    }

    // Sort by priority (higher priority first)
    return matchingRules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }
}

// Export for use in different contexts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RulesEngine;
}
