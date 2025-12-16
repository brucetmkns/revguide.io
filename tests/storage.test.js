/**
 * RevGuide - Storage Tests
 *
 * Tests for Chrome storage operations.
 */

const { TestRunner, assert, assertEqual, assertDeepEqual } = require('./setup');

const runner = new TestRunner();

// Test chrome.storage.local mock
runner.test('storage.local.set and get', async () => {
  await chrome.storage.local.set({ testKey: 'testValue' });
  const result = await chrome.storage.local.get('testKey');
  assertEqual(result.testKey, 'testValue', 'Should retrieve stored value');
});

runner.test('storage.local.set multiple keys', async () => {
  await chrome.storage.local.set({
    rules: [{ id: '1', name: 'Test Rule' }],
    settings: { showBanners: true }
  });

  const result = await chrome.storage.local.get(['rules', 'settings']);
  assertEqual(result.rules.length, 1, 'Should have one rule');
  assertEqual(result.settings.showBanners, true, 'Should have settings');
});

runner.test('storage.local.clear', async () => {
  await chrome.storage.local.set({ testKey: 'testValue' });
  await chrome.storage.local.clear();
  const result = await chrome.storage.local.get('testKey');
  assertEqual(result.testKey, undefined, 'Should be cleared');
});

// Test data structure validation
runner.test('wiki entry structure', async () => {
  const wikiEntry = {
    id: 'wiki-123',
    title: 'Deal Stage',
    trigger: 'dealstage',
    objectType: 'deals',
    propertyGroup: 'Deal Information',
    definition: '<p>The current stage of a deal</p>',
    enabled: true,
    category: 'field'
  };

  await chrome.storage.local.set({ wikiEntries: [wikiEntry] });
  const result = await chrome.storage.local.get('wikiEntries');

  assert(result.wikiEntries[0].id === 'wiki-123', 'Should have correct ID');
  assert(result.wikiEntries[0].trigger === 'dealstage', 'Should have trigger');
  assert(result.wikiEntries[0].enabled === true, 'Should be enabled');
});

runner.test('banner structure', async () => {
  const banner = {
    id: 'banner-123',
    name: 'Test Banner',
    title: 'Important Info',
    message: '<p>This is a test</p>',
    type: 'info',
    objectType: 'deals',
    conditions: [
      { property: 'dealstage', operator: 'equals', value: 'closedwon' }
    ],
    conditionLogic: 'AND',
    enabled: true,
    priority: 10
  };

  await chrome.storage.local.set({ rules: [banner] });
  const result = await chrome.storage.local.get('rules');

  assert(result.rules[0].conditions.length === 1, 'Should have one condition');
  assert(result.rules[0].type === 'info', 'Should have type info');
});

runner.test('play structure with sections', async () => {
  const play = {
    id: 'play-123',
    name: 'Sales Play',
    cardType: 'sales',
    subtitle: 'Enterprise playbook',
    sections: [
      { id: 's1', type: 'text', title: 'Discovery', content: 'Ask about budget...' },
      { id: 's2', type: 'media', title: 'Demo', url: 'https://loom.com/share/abc' },
      { id: 's3', type: 'fields', title: 'Update Fields', fields: [{ property: 'amount' }] }
    ],
    objectType: 'deals',
    conditions: [],
    enabled: true
  };

  await chrome.storage.local.set({ battleCards: [play] });
  const result = await chrome.storage.local.get('battleCards');

  assertEqual(result.battleCards[0].sections.length, 3, 'Should have 3 sections');
  assertEqual(result.battleCards[0].sections[0].type, 'text', 'First section should be text');
  assertEqual(result.battleCards[0].sections[1].type, 'media', 'Second section should be media');
  assertEqual(result.battleCards[0].sections[2].type, 'fields', 'Third section should be fields');
});

// Test settings structure
runner.test('settings structure', async () => {
  const settings = {
    showBanners: true,
    showBattleCards: true,
    showPresentations: true,
    showAdminLinks: false,
    bannerPosition: 'top',
    hubspotApiToken: 'test-token'
  };

  await chrome.storage.local.set({ settings });
  const result = await chrome.storage.local.get('settings');

  assertDeepEqual(result.settings, settings, 'Settings should match');
});

// Run all tests
runner.run().then(success => {
  process.exit(success ? 0 : 1);
});
