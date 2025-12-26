# Performance Remediation Plan

This document outlines performance bottlenecks in the RevGuide Chrome extension and provides a detailed remediation plan. The goal is to reduce the estimated **1.2-3.5 second overhead** on HubSpot page loads.

## Critical Constraint: Wiki Tooltip System

The wiki tooltip insertion scheme must remain intact:

1. **TreeWalker traversal** - Finds text nodes reliably across dynamic DOM
2. **Wrapper structure** - `span.hshelper-wiki-wrapper` with `data-hshelper-*` attributes
3. **Section deduplication** - One icon per term per section (left-sidebar, middle-pane, etc.)
4. **`processedElements` WeakSet** - Prevents duplicate processing
5. **Observer reconnection** - Re-applies after DOM changes

---

## Priority 1: Critical (Immediate Impact)

### 1.1 Remove `document.body.innerText` Property Extraction

**Location:** `content/content.js:617-648`

**Problem:** Reading `.innerText` forces a synchronous layout reflow - the browser must calculate the rendered position of every element before returning text. This blocks rendering and can add 200-800ms.

**Current Code:**
```javascript
// Method 9: Parse "Label: Value" patterns from page text
const pageText = document.body.innerText;
const lines = pageText.split('\n').map(l => l.trim()).filter(l => l);
```

**Remediation:**
- Remove Methods 9 and 10 entirely (lines 616-648)
- These are fallback extractors that rarely find properties not already found by Methods 1-8
- If needed, replace with targeted selectors for specific HubSpot containers only

**Risk:** Low - Methods 1-8 cover the primary HubSpot property locations

**Estimated Savings:** 200-800ms on initial load

---

### 1.2 Parallelize Async Calls in `loadData()`

**Location:** `content/content.js:201-325`

**Problem:** Three sequential `await` calls:
1. `chrome.runtime.sendMessage({ action: 'getContent' })` - 10-50ms
2. `chrome.storage.local.get()` - 5-20ms
3. `chrome.runtime.sendMessage({ action: 'getAuthState' })` - 10-50ms

Total: 50-150ms of blocking delay before any content renders.

**Current Code:**
```javascript
const contentResult = await new Promise((resolve) => {
  chrome.runtime.sendMessage({ action: 'getContent', ... }, resolve);
});

const localData = await new Promise((resolve) => {
  chrome.storage.local.get({ ... }, resolve);
});

const authState = await new Promise((resolve) => {
  chrome.runtime.sendMessage({ action: 'getAuthState' }, resolve);
});
```

**Remediation:**
```javascript
const [contentResult, localData, authState] = await Promise.all([
  new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getContent', portalId, crmType, forceRefresh }, (response) => {
      resolve(chrome.runtime.lastError ? null : response);
    });
  }),
  new Promise((resolve) => {
    chrome.storage.local.get({ presentations: [], wikiTermMapCache: null, ... }, resolve);
  }),
  new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'getAuthState' }, (response) => {
      resolve(chrome.runtime.lastError ? { isAuthenticated: false } : (response || { isAuthenticated: false }));
    });
  })
]);
```

**Risk:** None - these calls are independent

**Estimated Savings:** 30-100ms (runs in parallel instead of series)

---

### 1.3 Consolidate Triple Wiki Passes to Single Pass + Idle Callback

**Location:** `content/content.js:903-905` and `wiki.js:426-457`

**Problem:** Wiki highlighting runs 3-6 times in the first 3 seconds:
- `content.js:903-905`: 500ms, 1500ms, 3000ms
- `wiki.js:441-456`: immediate, 800ms, 2000ms (if loading detected)

Each pass is O(n * m) where n = text nodes, m = wiki terms.

**Current Code:**
```javascript
// content.js:903-905
setTimeout(() => this.wikiModule.apply(), 500);
setTimeout(() => this.wikiModule.apply(), 1500);
setTimeout(() => this.wikiModule.apply(), 3000);
```

**Remediation:**
1. Single initial pass after page ready
2. Use `requestIdleCallback` for subsequent passes (non-blocking)
3. Observer handles genuinely new content

```javascript
// content.js - replace lines 903-905
if (this.wikiModule && this.settings.showWiki !== false && this.wikiEntries.length > 0) {
  // Single immediate pass
  this.wikiModule.apply();

  // Deferred pass for lazy-loaded content (non-blocking)
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      this.wikiModule.processedElements = new WeakSet();
      this.wikiModule.apply();
    }, { timeout: 3000 });
  } else {
    setTimeout(() => {
      this.wikiModule.processedElements = new WeakSet();
      this.wikiModule.apply();
    }, 2000);
  }
}
```

**Wiki Module Changes (`wiki.js:426-457`):**
```javascript
applyForIndex() {
  if (this.helper.settings.showWiki === false) return;
  if (!this.helper.wikiEntries?.length) return;

  // Single immediate pass
  this.apply();

  // Single deferred pass for lazy content (non-blocking)
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      if (this.hasLoadingIndicators()) {
        this.processedElements = new WeakSet();
        this.apply();
      }
    }, { timeout: 2000 });
  }
}

hasLoadingIndicators() {
  return !!document.querySelector(
    '[data-loading="true"], .loading, [aria-busy="true"], .skeleton-loader'
  );
}
```

**Risk:** Medium - Some edge cases with very slow-loading content may need observer to catch up

**Estimated Savings:** 400-1200ms (eliminates 4-5 redundant passes)

---

### 1.4 Set DEBUG = false for Production

**Location:** `content/content.js:42`

**Problem:** `console.log` with large objects (properties, rules arrays) is slow. Serializing objects for logging can add 10-50ms per call, and there are dozens of log calls.

**Current Code:**
```javascript
const DEBUG = true;
```

**Remediation:**
```javascript
const DEBUG = false;
```

Or for conditional debugging:
```javascript
const DEBUG = localStorage.getItem('revguide_debug') === 'true';
```

**Risk:** None for users; debugging becomes opt-in

**Estimated Savings:** 10-50ms + eliminates console clutter

---

## Priority 2: High (Next Sprint)

### 2.1 Optimize MutationObserver Strategy

**Location:** `content/content.js:1034-1087`

**Problem:** Multiple overlapping observers:
1. `urlObserver` on `document.body` with `{ subtree: true }` - fires on EVERY DOM change
2. `propertyObserver` on sidebar
3. Wiki module has its own observers on multiple containers

**Remediation:**
1. Remove `urlObserver` - URL polling (2.2) and popstate handle navigation
2. Make propertyObserver more targeted
3. Consolidate wiki observers (already scoped to containers, which is good)

```javascript
// Remove lines 1034-1036 (urlObserver)
// Keep popstate listener (line 1066-1070)
// Keep the 500ms polling for now (2.2 addresses this separately)
```

**Risk:** Low - popstate and polling cover navigation cases

**Estimated Savings:** Reduces CPU during HubSpot's initial render

---

### 2.2 Replace URL Polling with Event-Based Detection

**Location:** `content/content.js:1039`

**Problem:** While the 500ms polling doesn't block initial load, it does:
- Prevent browser idle state (affects battery, background tab throttling)
- Add overhead during SPA navigations when HubSpot is rendering

**Current Code:**
```javascript
setInterval(handleUrlChange, 500);
```

**Remediation:**
Use History API interception + popstate:

```javascript
// Replace setInterval with History API monitoring
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function(...args) {
  originalPushState.apply(this, args);
  handleUrlChange();
};

history.replaceState = function(...args) {
  originalReplaceState.apply(this, args);
  handleUrlChange();
};

// popstate already handled at line 1066-1070
```

**Risk:** Low - HubSpot uses standard History API for navigation

**Estimated Savings:** Eliminates continuous polling (battery/CPU hygiene)

---

### 2.3 Lazy Load Index Tags Module

**Location:** `manifest.json` content_scripts and `content/content.js:134-137`

**Problem:** `index-tags.js` (38KB, 1163 lines) loads on EVERY HubSpot page but only runs on index pages.

**Remediation:**
1. Remove `index-tags.js` from manifest content_scripts
2. Dynamically inject only when on index page

```javascript
// content.js - replace lines 134-137
if (isIndex) {
  // Lazy load index tags module
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('content/modules/index-tags.js');
  script.onload = () => {
    if (typeof IndexTagsModule !== 'undefined') {
      this.indexTagsModule = new IndexTagsModule(this);
      this.indexTagsModule.init();
    }
  };
  (document.head || document.documentElement).appendChild(script);
}
```

Note: This requires adjusting how index-tags.js is loaded (web_accessible_resources).

**Risk:** Medium - requires manifest changes and testing

**Estimated Savings:** ~38KB parsing on non-index pages

---

### 2.4 Reduce querySelectorAll Calls in extractPageData

**Location:** `content/content.js:542-653`

**Problem:** 8 separate `querySelectorAll` calls with complex selectors. Each triggers selector matching across the entire DOM.

**Remediation:**
Batch related queries and cache container references:

```javascript
extractPageData() {
  this.properties = {};
  this.context = this.detectContext();

  // Cache container references once
  const sidebar = document.querySelector('[data-selenium-test="highlightedPropertySidebar"]');
  const aboutSection = document.querySelector('[data-test-id="about-section"]');
  const middlePane = document.querySelector('[data-test-id="middle-pane"]');

  // Method 1: Sidebar properties (scoped query)
  if (sidebar) {
    sidebar.querySelectorAll('[data-selenium-test="property-input"]').forEach(el => {
      // ... existing logic
    });
  }

  // Method 2: About section (scoped query)
  if (aboutSection) {
    aboutSection.querySelectorAll('[data-test-id*="property"]').forEach(el => {
      // ... existing logic
    });
  }

  // ... etc, scope queries to containers where possible
}
```

**Risk:** Low - just optimizing existing logic

**Estimated Savings:** 50-150ms on complex pages

---

## Priority 3: Medium (Optimization)

### 3.1 Remove Board Check Polling in Index Tags

**Location:** `content/modules/index-tags.js` (exact line TBD)

**Problem:** 2-second interval polling for board view detection runs continuously on index pages.

**Remediation:**
Use MutationObserver scoped to the view switcher, or check once on load and on view toggle click.

**Estimated Savings:** Continuous CPU reduction on index pages

---

### 3.2 Code Split Modules by Feature Flag

**Problem:** All modules load even if features are disabled in settings.

**Remediation:**
Check settings before initializing modules:

```javascript
initModules() {
  if (this.settings.showBanners && typeof BannersModule !== 'undefined') {
    this.bannersModule = new BannersModule(this);
  }
  if (this.settings.showWiki && typeof WikiModule !== 'undefined') {
    this.wikiModule = new WikiModule(this);
  }
  // ... etc
}
```

**Risk:** Low - settings are loaded before module init

**Estimated Savings:** Reduces initialization for disabled features

---

### 3.3 Debounce Property Observer

**Location:** `content/content.js:1073-1087`

**Problem:** Property observer triggers on every characterData change with only 500ms debounce. During rapid typing, this still fires frequently.

**Remediation:**
Increase debounce to 1000ms and add mutation count threshold:

```javascript
let mutationCount = 0;
const propertyObserver = new MutationObserver((mutations) => {
  mutationCount += mutations.length;
  clearTimeout(this.propertyUpdateTimeout);

  // Only process if significant changes OR after longer delay
  const delay = mutationCount > 10 ? 500 : 1000;
  this.propertyUpdateTimeout = setTimeout(() => {
    mutationCount = 0;
    const oldProps = JSON.stringify(this.properties);
    this.extractPageData();
    if (JSON.stringify(this.properties) !== oldProps) {
      this.render();
    }
  }, delay);
});
```

**Risk:** Low - just extends reaction time slightly

**Estimated Savings:** Reduces re-renders during form editing

---

## Priority 4: Low (Nice to Have)

### 4.1 Minify CSS

**Location:** `content/content.css` (1725 lines)

**Remediation:** Add CSS minification to build process.

**Estimated Savings:** ~30% file size reduction

---

### 4.2 Use Intersection Observer for Scroll-Based Wiki Updates

**Location:** `wiki.js:860-881`

**Problem:** Scroll listener with 1000ms debounce fires on every scroll.

**Remediation:**
Use Intersection Observer to detect when new content enters viewport:

```javascript
setupScrollListener() {
  // Use Intersection Observer instead of scroll listener
  const observer = new IntersectionObserver((entries) => {
    const hasNewVisible = entries.some(e => e.isIntersecting);
    if (hasNewVisible && !this.isApplyingWikiHighlights) {
      this.apply();
    }
  }, { rootMargin: '100px' });

  // Observe table rows or content containers
  document.querySelectorAll('[data-test-id="table-row"], [class*="TableRow"]')
    .forEach(row => observer.observe(row));
}
```

**Risk:** Medium - requires testing with HubSpot's virtual scrolling

---

## Implementation Order

### Week 1: Quick Wins (P1)
1. [ ] Set `DEBUG = false` (1.4) - 5 minutes
2. [ ] Parallelize `loadData()` async calls (1.2) - 30 minutes
3. [ ] Remove `document.body.innerText` extraction (1.1) - 30 minutes

### Week 2: Wiki Optimization (P1)
4. [ ] Consolidate wiki passes to single + idle callback (1.3) - 2 hours
5. [ ] Test wiki tooltips thoroughly on record, index, and other pages

### Week 3: Observers (P2)
6. [ ] Remove urlObserver, rely on History API + popstate (2.1, 2.2) - 1 hour
7. [ ] Scope querySelectorAll in extractPageData (2.4) - 1 hour

### Week 4: Module Loading (P2-P3)
8. [ ] Lazy load index-tags.js (2.3) - 2 hours
9. [ ] Code split by feature flag (3.2) - 1 hour
10. [ ] Remove board check polling (3.1) - 30 minutes

---

## Testing Checklist

After each change, verify:

- [ ] Wiki tooltips appear on first matching term in each section
- [ ] Wiki icons are clickable and show tooltips
- [ ] Tooltips have correct content, edit link, learn more link
- [ ] Wiki highlighting works on:
  - [ ] Contact record pages
  - [ ] Company record pages
  - [ ] Deal record pages
  - [ ] Index/list pages
  - [ ] Import pages
- [ ] Banners appear based on rules
- [ ] SPA navigation (clicking between records) re-initializes correctly
- [ ] Browser back/forward works
- [ ] Tab switching on record pages works
- [ ] No console errors

---

## Metrics to Track

Before/after measurements:
1. **Time to First Wiki Icon** - Chrome DevTools Performance tab
2. **Total Blocking Time** - Lighthouse
3. **Long Tasks** - Performance tab, filter tasks > 50ms
4. **Memory Usage** - Chrome Task Manager for the tab
5. **CPU Usage** - Chrome Task Manager during idle

Target: Reduce overhead from 1.2-3.5s to < 500ms.
