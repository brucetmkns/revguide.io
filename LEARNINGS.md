# Project Learnings

A living document capturing lessons learned during development. Reference this when building new features or debugging issues.

---

## Code Architecture

### Field Naming Migrations
**Lesson**: When migrating field names (e.g., `term` → `trigger`), ensure ALL references are updated across the entire codebase.

**Context**: Wiki entries were migrated from using `term` to `trigger` as the primary field. The admin UI and `buildTermMap()` were updated, but several methods still referenced `entry.term` directly, causing tooltips to fail silently.

**Pattern**: When accessing potentially migrated fields, use fallback pattern:
```javascript
const value = entry.newField || entry.legacyField || '';
```

**Files affected**: `content/modules/wiki.js` - Methods 4 and 5 had hardcoded `entry.term` references.

---

## Event Handling

### Click-Outside Handlers
**Lesson**: When implementing "click outside to close" behavior, ensure the handler excludes ALL relevant elements, including icons and their child SVG elements.

**Context**: Wiki tooltip would close immediately on first click because the outside-click handler didn't recognize clicks on `.hshelper-wiki-icon`.

**Pattern**: Use `closest()` to catch clicks on element or its children:
```javascript
handleOutsideClick(e) {
  if (e.target.closest('.my-trigger-element')) return; // Don't close
  if (e.target.closest('.my-popup')) return;           // Don't close
  this.close();
}
```

### Toggle State Tracking
**Lesson**: For toggleable UI elements (tooltips, dropdowns), track which item is currently open to enable proper toggle behavior.

**Context**: Clicking the same wiki icon multiple times caused erratic behavior because there was no tracking of which tooltip was open.

**Pattern**:
```javascript
showPopup(item) {
  if (this.currentItemId === item.id) {
    this.hidePopup(); // Toggle off
    return;
  }
  this.hidePopup(); // Close any existing
  // ... show new popup
  this.currentItemId = item.id;
}

hidePopup() {
  // ... hide logic
  this.currentItemId = null;
}
```

### Event Listener Timing
**Lesson**: When adding document-level click listeners after showing a popup, use sufficient delay to avoid catching the triggering click.

**Context**: 100ms delay wasn't always enough; increased to 150ms for reliability.

**Pattern**:
```javascript
showPopup() {
  // ... create and show popup
  setTimeout(() => {
    document.addEventListener('click', this.handleOutsideClick);
  }, 150); // Allow click event to fully propagate first
}
```

---

## HubSpot DOM Structure

### Property Label Selectors
**Lesson**: HubSpot uses many different DOM structures for property labels. Multiple selector strategies are needed.

**Current selectors that work** (in `wiki.js`):
- `[data-selenium-test*="property-label"]`
- `[data-test-id="left-sidebar"] [class*="label"]`
- `[data-test-id="left-sidebar"] [class*="truncate"]`

### Table Header Structure - Critical Insight
**Lesson**: Table column headers have deeply nested structures. NEVER target `<th>` or `[role="columnheader"]` directly for icon injection - the text is buried inside.

**HubSpot Table Header Structure**:
```html
<th role="columnheader">
  <div data-test-id="drag-header-...">
    <div class="Flex__StyledFlex...">
      ...multiple wrapper divs...
      <div class="TruncateDiv__NoWrapDiv...">
        Actual Label Text Here  <!-- TARGET THIS -->
      </div>
    </div>
  </div>
</th>
```

**What happens if you target `<th>` directly**:
- Icon gets prepended to `<th>` as first child
- Icon appears at TOP of cell, pushing content down
- Table row height increases unexpectedly
- Columns appear to "stack" on top of each other

**Correct approach**: Target the innermost text container:
```javascript
// WRONG - causes layout issues:
'[role="columnheader"]'
'table th'

// CORRECT - targets actual text container:
'[data-test-id*="truncated-object-label"]'
'[class*="TruncateDiv"]'
'[class*="TruncateString"] > span > span'
```

### Multi-Method Detection Strategy
**Lesson**: Different HubSpot page types/components require different detection methods. A single approach won't work everywhere.

**Why multiple methods are needed**:
1. **Method 1 (CSS Selectors)**: Works for sidebar labels with predictable class names
2. **Method 2 (Sidebar List Items)**: Works for `<li>` elements in left sidebar
3. **Method 3 (UI Patterns)**: Works for menus, dropdowns, table header TEXT containers
4. **Method 4/5 (Aggressive Scan)**: Catches edge cases in sidebars
5. **Method 6 (TreeWalker)**: Fallback for pages where CSS selectors miss content (Import, Reports, etc.)

**Key insight**: Each method should target the INNERMOST text element, not container/structural elements.

### Lazy-Loaded Content
**Lesson**: HubSpot lazy-loads content. Single-pass DOM scanning misses elements.

**Pattern**: Use multiple delayed passes for index pages:
```javascript
applyForIndex() {
  setTimeout(() => this.apply(), 500);
  setTimeout(() => this.apply(), 1500);
  setTimeout(() => this.apply(), 3000);
}
```

### MutationObserver Pitfalls
**Lesson**: When using MutationObserver and modifying the DOM, disconnect first to avoid infinite loops.

**Pattern**:
```javascript
apply() {
  if (this.isApplying) return; // Prevent re-entry
  this.isApplying = true;

  if (this.observer) this.observer.disconnect();

  // ... modify DOM

  this.isApplying = false;
  this.reconnectObserver();
}
```

### Duplicate Element Prevention
**Lesson**: Multiple apply() runs (from observer triggers) can add duplicate icons. Track processed elements persistently.

**Problem**: Creating a new `processedElements` Set each apply() call means elements get re-processed when observer triggers another apply.

**Pattern**: Use a persistent WeakSet at class level:
```javascript
apply() {
  // Initialize once, persist across calls
  if (!this.processedElements) {
    this.processedElements = new WeakSet();
  }

  for (const el of elements) {
    if (this.processedElements.has(el)) continue;
    // ... add icon
    this.processedElements.add(el);
  }
}

remove() {
  // Clear on page navigation
  this.processedElements = null;
}
```

---

## Debugging Tips

### Console Logging
The extension uses `[HubSpot Helper]` prefix for all logs. Filter by this in DevTools.

### Common Issues Checklist
1. **Tooltip not showing**: Check if entry has `trigger` field set (not just `title`)
2. **Feature not working on page**: Check if `settings.showXxx` is enabled
3. **Highlights disappearing**: Check for MutationObserver conflicts
4. **Erratic click behavior**: Check event propagation and outside-click handlers

---

## Data Structure Reference

### Wiki Entry Fields
```javascript
{
  id: 'wiki_123456789',
  title: 'Display Name',           // Required - shown in admin and tooltip header
  trigger: 'property label',       // Required for tooltip - matches DOM text
  aliases: ['alt1', 'alt2'],       // Optional alternative triggers
  definition: '<p>HTML content</p>', // Required - tooltip body
  category: 'general',             // Optional - colors tooltip header
  objectType: 'contacts',          // Optional - filter by HubSpot object
  propertyGroup: 'contactinfo',    // Optional - filter by property group
  link: 'https://...',             // Optional - "Learn more" link
  enabled: true,                   // Toggle on/off
  // ... additional rule fields
}
```

### Settings Structure
```javascript
{
  enabled: true,           // Master toggle
  showBanners: true,
  showBattleCards: true,
  showPresentations: true,
  showWiki: true,          // Wiki tooltips toggle
  bannerPosition: 'top',
  theme: 'light'
}
```

---

---

## Wiki Tooltip System Architecture

### Multi-Method Detection Approach
**Lesson**: A single detection approach cannot work across all HubSpot page types. Use multiple complementary methods.

**The 6 Methods Explained**:

| Method | Target | Works Best For | Why It Exists |
|--------|--------|---------------|---------------|
| 1 | CSS selectors | Sidebar labels, form labels, filters | Predictable class names in these areas |
| 2 | Sidebar `<li>` items | Left sidebar property lists | Specific container structure |
| 3 | UI patterns | Menus, dropdowns, table header text | Semantic roles and HubSpot components |
| 4 | Sidebar spans/divs | Edge cases | Direct text content matching |
| 5 | Left sidebar scan | Remaining misses | Aggressive fallback for sidebar |
| 6 | TreeWalker | Import pages, modals, any text | CSS selectors miss dynamically rendered content |

**Method 6 (TreeWalker) Details**:
- Only runs when Methods 1-5 find < 5 matches AND not on record pages
- Scans ALL text nodes in document.body
- Uses `isLikelyLabelContext()` to filter out paragraph text
- More expensive but catches content other methods miss

### Performance Optimizations
**Lesson**: With 1400+ wiki terms, efficiency matters.

**Implemented optimizations**:
1. **Term map caching**: Build Map once, reuse across apply() calls
2. **Processed elements tracking**: WeakSet prevents re-processing
3. **Conditional Method 6**: Only runs when other methods insufficient
4. **Debounced observer**: 500ms-3000ms delays prevent rapid re-applies
5. **Skip trivial mutations**: Ignore style/script changes in observer

---

## Wiki Term Map Caching (v1.9.3)

### Pre-Built Cache Architecture
**Lesson**: Building a term map from 1000+ wiki entries on every page load causes noticeable delay. Pre-compute the map when entries are saved.

**Problem**: On every HubSpot page load, the wiki module had to:
1. Load all wiki entries from `chrome.storage.local` (async)
2. Filter enabled entries
3. Build a Map of trigger terms → entries
4. Apply highlighting

With 1000+ entries, steps 2-3 took significant time on each page navigation.

**Solution**: Pre-build the term map when wiki entries are saved, not when pages load.

**Architecture**:
```javascript
// When wiki entries are saved (in admin, popup, etc.):
function saveWikiEntries(wikiEntries) {
  const cacheData = buildWikiTermMapCache(wikiEntries);

  chrome.storage.local.set({
    wikiEntries,
    wikiTermMapCache: cacheData.termMap,    // trigger → entryId
    wikiEntriesById: cacheData.entriesById, // entryId → entry
    wikiCacheVersion: Date.now()
  });
}

// In content script loadData():
// Load the pre-built cache alongside wiki entries
chrome.storage.local.get({
  wikiEntries: [],
  wikiTermMapCache: null,
  wikiEntriesById: null,
  wikiCacheVersion: 0
}, (data) => {
  this.wikiTermMapCache = data.wikiTermMapCache;
  this.wikiEntriesById = data.wikiEntriesById;
});

// In wiki.js buildTermMap():
// Use pre-built cache if available, fallback to building from entries
buildTermMap(entries) {
  if (this.helper.wikiTermMapCache && this.helper.wikiEntriesById) {
    // Fast path: use pre-built cache (instant)
    return new Map(Object.entries(this.helper.wikiTermMapCache)
      .map(([trigger, id]) => [trigger, this.helper.wikiEntriesById[id]]));
  }
  // Fallback: build from entries array (backward compatible)
  // ... original logic
}
```

**Files modified**:
- `admin/shared.js` - `saveStorageData()` now builds cache
- `lib/storage.js` - `saveWikiEntries()` builds cache
- `popup/popup.js` - `saveWikiEntries()` builds cache
- `admin/admin.js` - `saveWikiEntries()` builds cache
- `background/background.js` - Sample data init includes cache
- `content/content.js` - Loads cache from storage
- `content/modules/wiki.js` - Uses pre-built cache with fallback

### Session Storage Layer
**Lesson**: `chrome.storage.local` is async and has overhead. For instant subsequent loads, use `sessionStorage`.

**Pattern**:
```javascript
// After loading from chrome.storage, save to sessionStorage
if (data.wikiTermMapCache) {
  sessionStorage.setItem('hshelper_wikiTermMapCache', JSON.stringify(data.wikiTermMapCache));
  sessionStorage.setItem('hshelper_wikiEntriesById', JSON.stringify(data.wikiEntriesById));
  sessionStorage.setItem('hshelper_wikiCacheVersion', String(data.wikiCacheVersion));
}

// On subsequent page loads, can check sessionStorage first (sync, instant)
const cachedVersion = sessionStorage.getItem('hshelper_wikiCacheVersion');
if (cachedVersion === this.wikiCacheVersion) {
  // Use session cache - instant load
}
```

**Benefits**:
- First page load: Slightly faster (no map building)
- Subsequent loads in session: Much faster (sync sessionStorage)

### Adaptive Scan Timing
**Lesson**: Fixed delays (500ms, 1500ms, 3000ms) waste time when content loads quickly.

**Before** (`applyForIndex`):
```javascript
setTimeout(() => this.apply(), 500);   // Always runs
setTimeout(() => this.apply(), 1500);  // Always runs
setTimeout(() => this.apply(), 3000);  // Always runs
```

**After**:
```javascript
// Immediate first pass - no delay with pre-built cache
this.apply();

// Second pass only if loading indicators present
setTimeout(() => {
  if (hasLoadingIndicators() || contentCountIncreased()) {
    this.apply();
  }
}, 800);

// Third pass only if content still being added
setTimeout(() => {
  if (contentCountIncreased() || hasLoadingIndicators()) {
    this.apply();
  }
}, 2000);
```

**Benefits**:
- Immediate first pass instead of 500ms delay
- Subsequent passes skip if not needed
- Reduces unnecessary DOM scanning

### Cache Invalidation
**Lesson**: When wiki entries change via storage listener, invalidate the wiki module's cache.

**Pattern**:
```javascript
// In storage change listener (content.js):
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.wikiEntries) {
    // Invalidate wiki module's term map cache
    this.wikiModule.invalidateTermMapCache();
    // Reload data (will pick up new pre-built cache)
    this.loadData().then(() => this.render());
  }
});

// In wiki.js:
invalidateTermMapCache() {
  this.termMapCache = null;
  this.termMapCacheKey = null;
}
```

---

*Last updated: December 2024*
