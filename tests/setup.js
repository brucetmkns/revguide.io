/**
 * RevGuide Test Setup
 *
 * Basic test utilities for RevGuide extension testing.
 * Uses a lightweight approach suitable for browser extension testing.
 */

// Mock Chrome API for Node.js testing
global.chrome = {
  storage: {
    local: {
      _data: {},
      get: function(keys, callback) {
        const result = {};
        const keyArray = Array.isArray(keys) ? keys : (keys ? [keys] : Object.keys(this._data));
        keyArray.forEach(key => {
          if (this._data[key] !== undefined) {
            result[key] = this._data[key];
          }
        });
        if (callback) callback(result);
        return Promise.resolve(result);
      },
      set: function(data, callback) {
        Object.assign(this._data, data);
        if (callback) callback();
        return Promise.resolve();
      },
      clear: function(callback) {
        this._data = {};
        if (callback) callback();
        return Promise.resolve();
      }
    },
    sync: {
      _data: {},
      get: function(keys, callback) {
        const result = {};
        const keyArray = Array.isArray(keys) ? keys : (keys ? [keys] : Object.keys(this._data));
        keyArray.forEach(key => {
          if (this._data[key] !== undefined) {
            result[key] = this._data[key];
          }
        });
        if (callback) callback(result);
        return Promise.resolve(result);
      },
      set: function(data, callback) {
        Object.assign(this._data, data);
        if (callback) callback();
        return Promise.resolve();
      }
    }
  },
  runtime: {
    lastError: null,
    sendMessage: function(message, callback) {
      // Mock response
      if (callback) callback({ success: true });
    },
    getManifest: function() {
      return { version: '1.9.9', name: 'RevGuide' };
    }
  },
  tabs: {
    query: function(query, callback) {
      if (callback) callback([{ id: 1, url: 'https://app.hubspot.com/contacts/123/record/0-1/456' }]);
      return Promise.resolve([]);
    }
  }
};

// Simple test runner
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('\n🧪 Running RevGuide Tests\n');
    console.log('='.repeat(50));

    for (const { name, fn } of this.tests) {
      try {
        await fn();
        console.log(`✅ ${name}`);
        this.passed++;
      } catch (error) {
        console.log(`❌ ${name}`);
        console.log(`   Error: ${error.message}`);
        this.failed++;
      }
    }

    console.log('='.repeat(50));
    console.log(`\n📊 Results: ${this.passed} passed, ${this.failed} failed\n`);

    return this.failed === 0;
  }
}

// Assertion helpers
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected} but got ${actual}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(message || `Objects not equal:\nExpected: ${JSON.stringify(expected)}\nActual: ${JSON.stringify(actual)}`);
  }
}

module.exports = { TestRunner, assert, assertEqual, assertDeepEqual };
