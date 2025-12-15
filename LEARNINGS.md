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
The extension uses `[RevGuide]` prefix for all logs. Filter by this in DevTools.

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

## Wiki Tooltip System Architecture (Refactored v1.9.7)

### Single-Pass TreeWalker Approach (Supered-Style)
**Lesson**: Multiple querySelectorAll passes are slow and inconsistent. A single TreeWalker pass is faster and more reliable.

**Problem with old multi-method approach**:
- 7 separate methods with complex CSS selectors
- Multiple DOM traversals (6-7 querySelectorAll + 1 TreeWalker)
- Duplicate detection logic repeated in each method
- Still missed content in some areas

**New architecture** (inspired by Supered extension):
```javascript
// Single TreeWalker pass over ALL text nodes
const walker = document.createTreeWalker(
  document.body,
  NodeFilter.SHOW_TEXT,
  { acceptNode: (node) => /* filter logic */ }
);

while (walker.nextNode()) {
  const text = normalizeText(node.textContent);
  // Check against sorted terms (longest first)
  for (const { term, entry } of sortedTerms) {
    if (text === term) {
      // Match found - check section deduplication
    }
  }
}
```

**Key improvements**:
| Aspect | Old (7 methods) | New (TreeWalker) |
|--------|-----------------|------------------|
| DOM passes | 7+ querySelectorAll calls | 1 TreeWalker pass |
| Code size | ~1600 lines | ~875 lines |
| Matching | `includes()` (partial) | `===` (exact only) |
| Deduplication | Per-element tracking | Per-section tracking |

### Exact Match Only - Critical Fix
**Lesson**: Using `includes()` causes false positives. "Company" matches "Company Domain Name".

**Problem**: When sorted by length (longest first), a shorter term can still match if using `includes()`:
```javascript
// WRONG - "company domain name".includes("company") === true
if (normalizedText.includes(term)) { ... }

// CORRECT - exact match only
const textToMatch = normalizedText
  .replace(/\s*:\s*$/, '')        // Remove trailing colon
  .replace(/\s*\(\d+\)\s*$/, ''); // Remove count like "(3)"
if (textToMatch === term) { ... }
```

**Why sort by length still matters**: Even with exact matching, sorting ensures if you have both "Deal" and "Deal Stage" as triggers, longer terms get checked first so each text node matches the most specific term.

### Section-Based Deduplication
**Lesson**: Show first instance of each term per section, not every instance on the page.

**Sections defined**:
- `left-sidebar` - Property panel
- `middle-pane` - Main content area
- `right-sidebar` - Activity/timeline
- `header` - Record header
- `modal` - Dialogs/overlays
- `dropdown` - Open menus
- `filter-panel` - Filter editors
- `nav` - Navigation items
- `table` - Data tables
- `main` - Fallback main area

**Implementation**:
```javascript
const shownInSection = new Map();

for (const match of matches) {
  const section = getSectionForElement(match.parent);
  const key = `${section}:${entry.id}`;

  if (shownInSection.has(key)) continue; // Already shown in this section

  shownInSection.set(key, true);
  // Add icon...
}
```

### Text Normalization (Supered-Style)
**Lesson**: Zero-width characters and inconsistent whitespace cause match failures.

**Pattern**:
```javascript
normalizeText(text) {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width chars
    .trim()
    .toLowerCase();
}
```

### Performance Optimizations
**Lesson**: With 1000+ wiki terms, efficiency matters.

**Implemented optimizations**:
1. **Sorted term list**: Sort by length DESC, cache result
2. **Exact matching**: `===` is faster than `includes()` + avoids false positives
3. **Single DOM pass**: One TreeWalker vs 7+ querySelectorAll
4. **Section deduplication**: Fewer icons to render
5. **WeakSet tracking**: Prevents re-processing same elements
6. **Debounced observer**: 2000ms minimum between re-applies

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

## Observer Attachment Points

### Dynamic Content Renders as Siblings, Not Children
**Lesson**: HubSpot often renders dynamic content (menus, modals, popovers) as siblings to their trigger containers, not inside them.

**Problem**: Attaching MutationObserver to a specific container misses content that renders elsewhere in the DOM.

**Example**: Secondary navigation menus are rendered outside the main `VerticalNav` container. An observer on the nav container sees nothing.

**Solution**: When targeting lazy-loaded content, attach observer to `document.body` unless you're certain about the render location.

```javascript
// WRONG - misses content rendered as siblings
navContainer.observe(navElement, { childList: true, subtree: true });

// CORRECT - catches content anywhere
observer.observe(document.body, { childList: true, subtree: true });
```

**Trade-off**: More events to filter, but guarantees you catch the content.

---

## Icon Insertion Without Layout Breakage

### Padding + Absolute Positioning
**Lesson**: Inserting icons inline (`display: inline-flex`) can break text flow and layouts. Use reserved space with absolute positioning instead.

**Problem**: Adding an icon element inline shifts text, changes line heights, and can break HubSpot's CSS expectations.

**Solution**: Create space with `padding-left`, position icon absolutely within that space.

```html
<span style="padding-left: 1.15em; position: relative; display: inline-block;">
  <span style="position: absolute; left: 0; top: 0; bottom: 0; display: flex; align-items: center;">
    <icon/>
  </span>
  Original Text
</span>
```

**Benefits**:
- `em` units scale with font size
- Doesn't shift text flow
- Works across different HubSpot components
- Icon vertically centered regardless of line height

---

## Targeting Text in Complex Structures

### Target Innermost Text Container
**Lesson**: HubSpot wraps text in multiple layers of divs/spans. Always target the innermost container.

**Problem**: Targeting outer containers (like `<th>`) places icons at wrong position and breaks layout.

**Pattern**: Look for classes containing `Truncate`, `Label`, `Text` - these are usually the innermost text wrappers.

```javascript
// WRONG - targets structural container
'[role="columnheader"]'

// CORRECT - targets actual text wrapper
'[class*="TruncateDiv"]'
'[class*="TruncateString"] > span > span'
```

See `docs/HUBSPOT_DOM.md` for detailed DOM structures.

---

*Last updated: December 2024*
