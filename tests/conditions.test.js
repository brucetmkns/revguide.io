/**
 * RevGuide - Condition Engine Tests
 *
 * Tests for the banner/play condition evaluation logic.
 */

const { TestRunner, assert, assertEqual } = require('./setup');
const RulesEngine = require('../lib/rules-engine');

const engine = new RulesEngine();

function evaluateCondition(condition, recordData) {
  return engine.evaluateCondition(condition, recordData);
}

function evaluateConditions(conditions, recordData, logic = 'AND') {
  const rule = { conditions, logic };
  return engine.evaluateRule(rule, recordData);
}

// Run tests
const runner = new TestRunner();

// Basic equality tests
runner.test('equals operator - exact match', () => {
  const condition = { property: 'dealstage', operator: 'equals', value: 'closedwon' };
  const data = { dealstage: 'closedwon' };
  assert(evaluateCondition(condition, data), 'Should match exact value');
});

runner.test('equals operator - case insensitive', () => {
  const condition = { property: 'dealstage', operator: 'equals', value: 'ClosedWon' };
  const data = { dealstage: 'closedwon' };
  assert(evaluateCondition(condition, data), 'Should match case-insensitively');
});

runner.test('not_equals operator', () => {
  const condition = { property: 'dealstage', operator: 'not_equals', value: 'closedwon' };
  const data = { dealstage: 'closedlost' };
  assert(evaluateCondition(condition, data), 'Should not equal different value');
});

// Contains tests
runner.test('contains operator', () => {
  const condition = { property: 'description', operator: 'contains', value: 'enterprise' };
  const data = { description: 'This is an enterprise deal' };
  assert(evaluateCondition(condition, data), 'Should contain substring');
});

runner.test('not_contains operator', () => {
  const condition = { property: 'description', operator: 'not_contains', value: 'enterprise' };
  const data = { description: 'This is a small deal' };
  assert(evaluateCondition(condition, data), 'Should not contain substring');
});

// Numeric comparison tests
runner.test('greater_than operator', () => {
  const condition = { property: 'amount', operator: 'greater_than', value: '10000' };
  const data = { amount: 15000 };
  assert(evaluateCondition(condition, data), 'Should be greater than');
});

runner.test('less_than operator', () => {
  const condition = { property: 'amount', operator: 'less_than', value: '10000' };
  const data = { amount: 5000 };
  assert(evaluateCondition(condition, data), 'Should be less than');
});

// Empty/not empty tests
runner.test('is_empty operator - null value', () => {
  const condition = { property: 'notes', operator: 'is_empty', value: '' };
  const data = { notes: null };
  assert(evaluateCondition(condition, data), 'Null should be empty');
});

runner.test('is_empty operator - undefined value', () => {
  const condition = { property: 'notes', operator: 'is_empty', value: '' };
  const data = {};
  assert(evaluateCondition(condition, data), 'Undefined should be empty');
});

runner.test('is_not_empty operator', () => {
  const condition = { property: 'notes', operator: 'is_not_empty', value: '' };
  const data = { notes: 'Some notes here' };
  assert(evaluateCondition(condition, data), 'Non-empty string should pass');
});

// Multiple conditions - AND logic
runner.test('AND logic - all conditions true', () => {
  const conditions = [
    { property: 'dealstage', operator: 'equals', value: 'closedwon' },
    { property: 'amount', operator: 'greater_than', value: '10000' }
  ];
  const data = { dealstage: 'closedwon', amount: 50000 };
  assert(evaluateConditions(conditions, data, 'AND'), 'All conditions should be true');
});

runner.test('AND logic - one condition false', () => {
  const conditions = [
    { property: 'dealstage', operator: 'equals', value: 'closedwon' },
    { property: 'amount', operator: 'greater_than', value: '10000' }
  ];
  const data = { dealstage: 'closedwon', amount: 5000 };
  assert(!evaluateConditions(conditions, data, 'AND'), 'Should fail if one condition is false');
});

// Multiple conditions - OR logic
runner.test('OR logic - one condition true', () => {
  const conditions = [
    { property: 'dealstage', operator: 'equals', value: 'closedwon' },
    { property: 'dealstage', operator: 'equals', value: 'closedlost' }
  ];
  const data = { dealstage: 'closedwon' };
  assert(evaluateConditions(conditions, data, 'OR'), 'Should pass if any condition is true');
});

runner.test('OR logic - all conditions false', () => {
  const conditions = [
    { property: 'dealstage', operator: 'equals', value: 'closedwon' },
    { property: 'dealstage', operator: 'equals', value: 'closedlost' }
  ];
  const data = { dealstage: 'inprogress' };
  assert(!evaluateConditions(conditions, data, 'OR'), 'Should fail if all conditions are false');
});

// Empty conditions
runner.test('empty conditions array - should return true', () => {
  assert(evaluateConditions([], {}, 'AND'), 'Empty conditions should return true');
});

runner.test('null conditions - should return true', () => {
  assert(evaluateConditions(null, {}, 'AND'), 'Null conditions should return true');
});

// Run all tests
runner.run().then(success => {
  process.exit(success ? 0 : 1);
});
