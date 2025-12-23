/**
 * RevGuide Current Environment
 *
 * Auto-detects environment based on hostname.
 * Provides ENV global with current environment configuration.
 *
 * Usage:
 *   Load config/environments.js first, then this file.
 *   Access via: RevGuideConfig.ENV
 */

(function() {
  'use strict';

  // Detect environment based on hostname
  function detectEnvironment() {
    // Get hostname from window (web) or check for staging override (extension)
    if (typeof window !== 'undefined' && window.location) {
      const hostname = window.location.hostname;

      // Staging detection
      if (hostname.includes('staging')) {
        return 'staging';
      }

      // Local development uses staging by default
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'staging';
      }
    }

    // Default to production
    return 'production';
  }

  // Check for environment override (for extension dev toggle)
  async function checkOverride(callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        const result = await chrome.storage.local.get('__revguide_env_override');
        if (result.__revguide_env_override) {
          callback(result.__revguide_env_override);
          return;
        }
      } catch (e) {
        // Ignore errors, fall through to auto-detection
      }
    }
    callback(null);
  }

  // Get environments object
  function getEnvironments() {
    if (typeof window !== 'undefined' && window.REVGUIDE_ENVIRONMENTS) {
      return window.REVGUIDE_ENVIRONMENTS;
    }
    if (typeof self !== 'undefined' && self.REVGUIDE_ENVIRONMENTS) {
      return self.REVGUIDE_ENVIRONMENTS;
    }
    // Fallback: try to require (won't work in browser but prevents errors)
    return null;
  }

  // Build the config object
  const envName = detectEnvironment();
  const environments = getEnvironments();

  const RevGuideConfig = {
    // Current environment name
    envName: envName,

    // Current environment settings
    ENV: environments ? environments[envName] : null,

    // All environments (for switching)
    ENVIRONMENTS: environments,

    // Is this a staging environment?
    isStaging: envName === 'staging',

    // Is this production?
    isProduction: envName === 'production',

    // Re-detect (useful after override changes)
    detectEnvironment: detectEnvironment,

    // Check for override and update ENV
    async initWithOverride() {
      return new Promise((resolve) => {
        checkOverride((override) => {
          if (override && this.ENVIRONMENTS && this.ENVIRONMENTS[override]) {
            this.envName = override;
            this.ENV = this.ENVIRONMENTS[override];
            this.isStaging = override === 'staging';
            this.isProduction = override === 'production';
          }
          resolve(this.ENV);
        });
      });
    },

    // Set environment override (for dev toggle)
    async setOverride(envName) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        if (envName) {
          await chrome.storage.local.set({ '__revguide_env_override': envName });
        } else {
          await chrome.storage.local.remove('__revguide_env_override');
        }
        // Update current config
        if (envName && this.ENVIRONMENTS && this.ENVIRONMENTS[envName]) {
          this.envName = envName;
          this.ENV = this.ENVIRONMENTS[envName];
          this.isStaging = envName === 'staging';
          this.isProduction = envName === 'production';
        }
      }
    },

    // Toggle between staging and production
    async toggleEnvironment() {
      const newEnv = this.isProduction ? 'staging' : null;
      await this.setOverride(newEnv);
      return this.envName;
    }
  };

  // Export for different contexts
  if (typeof window !== 'undefined') {
    window.RevGuideConfig = RevGuideConfig;
  }
  if (typeof self !== 'undefined') {
    self.RevGuideConfig = RevGuideConfig;
  }
})();
