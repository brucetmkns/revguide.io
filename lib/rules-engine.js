/**
 * Rules Engine for RevGuide
 * Evaluates property-based rules and determines which banners/cards to show
 */

(function(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.RevGuideRulesEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  class RulesEngine {
    constructor() {
      const parseNumber = (val) => {
        if (val === null || val === undefined) return NaN;
        const cleaned = String(val).replace(/[^0-9.\-]/g, '');
        return parseFloat(cleaned);
      };

      this.operators = {
        equals: (a, b) => String(a).toLowerCase() === String(b).toLowerCase(),
        not_equals: (a, b) => String(a).toLowerCase() !== String(b).toLowerCase(),
        contains: (a, b) => String(a).toLowerCase().includes(String(b).toLowerCase()),
        not_contains: (a, b) => !String(a).toLowerCase().includes(String(b).toLowerCase()),
        starts_with: (a, b) => String(a).toLowerCase().startsWith(String(b).toLowerCase()),
        ends_with: (a, b) => String(a).toLowerCase().endsWith(String(b).toLowerCase()),
        greater_than: (a, b) => parseNumber(a) > parseNumber(b),
        less_than: (a, b) => parseNumber(a) < parseNumber(b),
        greater_equal: (a, b) => parseNumber(a) >= parseNumber(b),
        less_equal: (a, b) => parseNumber(a) <= parseNumber(b),
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

      const result = operatorFn(propertyValue, value);
      console.log('[RevGuide RulesEngine] Condition:', property, operator, value, '| Record value:', propertyValue, '| Result:', result);
      return result;
    }

    /**
     * Evaluate a rule (with multiple conditions and logic)
     */
    evaluateRule(rule, properties) {
      if (!rule.conditions || rule.conditions.length === 0) {
        return true;
      }

      const logic = rule.logic || 'AND';

      if (logic === 'AND') {
        return rule.conditions.every(condition =>
          this.evaluateCondition(condition, properties)
        );
      }

      if (logic === 'OR') {
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
      console.log('[RevGuide RulesEngine] Evaluating', rules?.length || 0, 'rules for context:', context.objectType);

      for (const rule of rules) {
        if (rule.enabled === false) {
          console.log('[RevGuide RulesEngine] Rule', rule.id, 'skipped - disabled');
          continue;
        }

        if (rule.objectTypes && rule.objectTypes.length > 0) {
          if (!context.objectType || !rule.objectTypes.includes(context.objectType)) {
            console.log('[RevGuide RulesEngine] Rule', rule.id, 'skipped - objectType mismatch:', rule.objectTypes, 'vs', context.objectType);
            continue;
          }
        }

        if (rule.pipelines && rule.pipelines.length > 0) {
          if (!context.pipeline || !rule.pipelines.includes(context.pipeline)) {
            console.log('[RevGuide RulesEngine] Rule', rule.id, 'skipped - pipeline mismatch');
            continue;
          }
        }

        if (rule.stages && rule.stages.length > 0) {
          if (!context.stage || !rule.stages.includes(context.stage)) {
            console.log('[RevGuide RulesEngine] Rule', rule.id, 'skipped - stage mismatch');
            continue;
          }
        }

        const conditionsMatch = rule.displayOnAll || this.evaluateRule(rule, properties);
        console.log('[RevGuide RulesEngine] Rule', rule.id, rule.name, '- displayOnAll:', rule.displayOnAll, 'conditionsMatch:', conditionsMatch);
        if (conditionsMatch) {
          matchingRules.push(rule);
        }
      }

      console.log('[RevGuide RulesEngine] Total matching rules:', matchingRules.length);
      return matchingRules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }
  }

  return RulesEngine;
});
