/**
 * RevGuide - ERP Icon Module
 *
 * Displays an ERP system icon next to HubSpot record names when the configured
 * field has a value. The icon links to the corresponding record in the ERP system.
 *
 * Features:
 * - Renders ERP icon on record detail pages next to the record name
 * - Creates ERP tags/icons for list view (used by IndexTagsModule)
 * - Supports custom icon upload (data URI) or text badge fallback
 * - URL templates with {{value}} substitution
 * - Per-object-type configuration
 *
 * Configuration Structure (from erp_config):
 * {
 *   enabled: boolean,
 *   erp_name: string,
 *   icon: string (data URI),
 *   field_mappings: {
 *     "company": { field: "field_name", url_template: "https://..." },
 *     "deal": { ... },
 *     ...
 *   }
 * }
 *
 * Usage:
 *   const erpModule = new ErpIconModule(helper);
 *   erpModule.init(erpConfig);
 *   erpModule.renderOnRecordPage(properties, context);
 */

class ErpIconModule {
  /**
   * @param {Object} helper - Reference to main HubSpotHelper instance
   */
  constructor(helper) {
    this.helper = helper;
    this.erpConfig = null;
    this.injectedIcons = new WeakSet();
    this.recordPageIcon = null;
  }

  /**
   * Initialize the module with ERP configuration
   * @param {Object} erpConfig - The ERP configuration object
   */
  init(erpConfig) {
    console.log('[RevGuide ERP] init() called, config:', erpConfig?.enabled ? 'enabled' : 'disabled');

    if (!erpConfig?.enabled) {
      this.erpConfig = null;
      return;
    }

    this.erpConfig = erpConfig;
  }

  /**
   * Check if ERP is enabled and configured
   * @returns {boolean}
   */
  isEnabled() {
    return !!(this.erpConfig?.enabled);
  }

  /**
   * Get the ERP configuration for a specific object type
   * @param {string} objectType - e.g., 'company', 'deal', 'contact'
   * @returns {Object|null} { field, url_template } or null
   */
  getConfigForObjectType(objectType) {
    if (!this.erpConfig?.enabled) return null;
    const mapping = this.erpConfig.field_mappings?.[objectType];
    if (!mapping?.field) return null;
    return mapping;
  }

  /**
   * Check if the ERP field has a value for given properties and object type
   * @param {Object} properties - Record properties
   * @param {string} objectType - The object type
   * @returns {boolean}
   */
  hasErpValue(properties, objectType) {
    const mapping = this.getConfigForObjectType(objectType);
    if (!mapping) return false;

    const value = this.getPropertyValue(properties, mapping.field);
    return value !== null && value !== undefined && value !== '';
  }

  /**
   * Get a property value, handling various key formats
   * @param {Object} properties - Record properties
   * @param {string} fieldName - The field name to look up
   * @returns {*} The property value or null
   */
  getPropertyValue(properties, fieldName) {
    if (!properties || !fieldName) return null;

    // Try exact match first
    if (properties[fieldName] !== undefined) {
      return properties[fieldName];
    }

    // Try lowercase
    const lowerField = fieldName.toLowerCase();
    if (properties[lowerField] !== undefined) {
      return properties[lowerField];
    }

    // Try with underscores converted to nothing
    const noUnderscores = fieldName.replace(/_/g, '');
    if (properties[noUnderscores] !== undefined) {
      return properties[noUnderscores];
    }

    return null;
  }

  /**
   * Build the ERP URL for a record
   * @param {Object} properties - Record properties
   * @param {string} objectType - The object type
   * @returns {string|null} The URL or null
   */
  buildErpUrl(properties, objectType) {
    const mapping = this.getConfigForObjectType(objectType);
    if (!mapping?.field) return null;

    const value = this.getPropertyValue(properties, mapping.field);
    if (!value) return null;

    if (!mapping.url_template) return null;

    // Replace {{value}} or {{fieldname}} with the field value (URL encoded)
    const encodedValue = encodeURIComponent(value);
    let url = mapping.url_template.replace(/\{\{value\}\}/g, encodedValue);
    // Also replace the specific field name if used (e.g., {{q360_site_id}})
    url = url.replace(new RegExp(`\\{\\{${mapping.field}\\}\\}`, 'g'), encodedValue);
    return url;
  }

  /**
   * Render ERP icon on a record detail page
   * @param {Object} properties - Record properties
   * @param {Object} context - { objectType, recordId }
   */
  renderOnRecordPage(properties, context) {
    console.log('[RevGuide ERP] renderOnRecordPage called', {
      isEnabled: this.isEnabled(),
      objectType: context?.objectType,
      propertyCount: Object.keys(properties || {}).length
    });
    if (!this.isEnabled()) return;
    if (!context?.objectType) return;

    const mapping = this.getConfigForObjectType(context.objectType);
    console.log('[RevGuide ERP] Mapping for', context.objectType, ':', mapping);
    if (!mapping) return;

    console.log('[RevGuide ERP] Looking for field:', mapping.field, 'in properties:', Object.keys(properties || {}).slice(0, 20));
    const fieldValue = this.getPropertyValue(properties, mapping.field);
    console.log('[RevGuide ERP] Field value result:', fieldValue);
    if (!fieldValue) {
      console.log('[RevGuide ERP] No value for field', mapping.field, 'on', context.objectType);
      return;
    }

    console.log('[RevGuide ERP] Found ERP value:', fieldValue, 'for', context.objectType);

    // Find the record name element in the header
    const nameEl = this.findRecordNameElement();
    if (!nameEl) {
      console.log('[RevGuide ERP] Record name element not found');
      return;
    }

    // Check if we already added an icon
    if (this.injectedIcons.has(nameEl)) {
      return;
    }

    // Build URL
    const url = this.buildErpUrl(properties, context.objectType);

    // Create icon link
    const iconLink = this.createIconLink(url, fieldValue);

    // Insert inside the name element (at the end) to flow naturally with text
    nameEl.appendChild(iconLink);
    this.injectedIcons.add(nameEl);
    this.recordPageIcon = iconLink;
    console.log('[RevGuide ERP] Icon injected on record page');
  }

  /**
   * Find the record name element on a record detail page
   * @returns {HTMLElement|null}
   */
  findRecordNameElement() {
    // Try multiple selectors for different HubSpot UI versions
    const selectors = [
      // Current HubSpot UI (2024+) - highlight record label
      '[data-test-id="highlight-record-label"]',
      '[data-selenium-test="highlightTitle"]',
      'h2[data-test-id="highlight-record-label"]',
      // Older HubSpot UI patterns
      '[data-test-id="record-title"] h1',
      '[data-test-id="record-header"] h1',
      '[class*="RecordTitle"] h1',
      '[class*="RecordTitle"]',
      'h1[class*="Title"]',
      // Fallback: look in the main content area
      '.main-content-wrapper h1',
      '.main-content-wrapper h2'
    ];

    console.log('[RevGuide ERP] Searching for record name element...');
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      console.log('[RevGuide ERP] Selector:', selector, '-> found:', !!el, el?.textContent?.substring(0, 30));
      if (el && el.textContent?.trim()) {
        return el;
      }
    }

    console.log('[RevGuide ERP] No selector matched. Dumping page h1/h2 elements:');
    document.querySelectorAll('h1, h2').forEach((el, i) => {
      console.log(`[RevGuide ERP] h1/h2[${i}]:`, el.tagName, el.className, el.getAttribute('data-test-id'), el.textContent?.substring(0, 50));
    });

    return null;
  }

  /**
   * Create the ERP icon link element for record pages
   * @param {string} url - The ERP URL
   * @param {string} fieldValue - The field value (for tooltip)
   * @returns {HTMLElement}
   */
  createIconLink(url, fieldValue) {
    const link = document.createElement('a');
    link.href = url || '#';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'hshelper-erp-link';
    link.title = `Open in ${this.erpConfig.erp_name || 'ERP'} (${fieldValue})`;

    if (url) {
      link.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    } else {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    }

    if (this.erpConfig.icon) {
      const img = document.createElement('img');
      img.src = this.erpConfig.icon;
      img.className = 'hshelper-erp-icon';
      img.alt = this.erpConfig.erp_name || 'ERP';
      link.appendChild(img);
    } else {
      // Fallback: text badge
      link.textContent = this.erpConfig.erp_name?.substring(0, 4) || 'ERP';
      link.classList.add('hshelper-erp-badge');
    }

    return link;
  }

  /**
   * Create an ERP tag/icon element for list view (called by IndexTagsModule)
   * @param {Object} properties - Record properties
   * @param {string} objectType - The object type
   * @returns {HTMLElement|null}
   */
  createErpTag(properties, objectType) {
    if (!this.isEnabled()) return null;
    if (!this.hasErpValue(properties, objectType)) return null;

    const url = this.buildErpUrl(properties, objectType);
    const mapping = this.getConfigForObjectType(objectType);
    const fieldValue = this.getPropertyValue(properties, mapping.field);

    const link = document.createElement('a');
    link.href = url || '#';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'hshelper-erp-tag';
    link.title = `Open in ${this.erpConfig.erp_name || 'ERP'}`;

    // Prevent row click when clicking the link
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!url) {
        e.preventDefault();
      }
    });

    if (this.erpConfig.icon) {
      const img = document.createElement('img');
      img.src = this.erpConfig.icon;
      img.className = 'hshelper-erp-tag-icon';
      img.alt = this.erpConfig.erp_name || 'ERP';
      link.appendChild(img);
    } else {
      // Fallback: text
      link.textContent = this.erpConfig.erp_name?.substring(0, 4) || 'ERP';
    }

    return link;
  }

  /**
   * Clean up injected icons
   */
  cleanup() {
    // Remove record page icon
    if (this.recordPageIcon && this.recordPageIcon.parentElement) {
      this.recordPageIcon.remove();
      this.recordPageIcon = null;
    }

    // Reset tracking
    this.injectedIcons = new WeakSet();

    console.log('[RevGuide ERP] Cleanup complete');
  }
}

// Export for use in content.js
if (typeof window !== 'undefined') {
  window.ErpIconModule = ErpIconModule;
}
