# HubSpot DOM Structure Guide

This document describes the HubSpot CRM record page DOM structure and how to properly inject UI elements that scroll with the page content.

## Key Findings

### URL Structure
HubSpot uses a unified URL pattern for all record types:
```
https://app.hubspot.com/contacts/PORTAL_ID/record/OBJECT_TYPE_ID/RECORD_ID
```

Object type IDs:
- `0-1` = Contact
- `0-2` = Company
- `0-3` = Deal
- `0-5` = Ticket

**Important:** The URL always contains `/contacts/` regardless of object type. The actual type is determined by the `OBJECT_TYPE_ID` in the `/record/X-X/` segment.

### Page Layout

The record page has three columns:
1. **Left sidebar** (`data-test-id="left-sidebar"`) - Contains deal/contact highlights and properties
2. **Middle pane** (`data-test-id="middle-pane"`) - Contains tabs (Overview, Activities, etc.) with cards
3. **Right sidebar** (`data-test-id="records-right-sidebar"`) - Contains associations, attachments, etc.

### Middle Pane Structure

```
[data-test-id="middle-pane"]
├── Tab navigation (role="tablist")
├── [data-test-id="tab-0-content"] (Overview tab)
│   └── ScrollOverhang__Wrapper
│       └── FullHeightScrollContainer / ScrollContainer__DefaultScrollContainer
│           └── Card container (View__StyledView with multiple children)
│               ├── [data-test-id="card-wrapper-DATA_HIGHLIGHTS/..."]
│               ├── [data-test-id="card-wrapper-ACTIVITIES_V2/..."]
│               └── ... more cards
└── [data-test-id="tab-1-content"] (Activities tab)
    └── Similar structure but may vary
```

### Critical: Scroll Container

**The scroll container is NOT at a consistent level across tabs.**

- Cards are inside a container with class containing `ScrollContainer`
- To scroll with content, injected elements MUST be inside this ScrollContainer
- The ScrollContainer can be found with: `querySelector('[class*="ScrollContainer"]')`

### Property Extraction

HubSpot uses styled-components with randomized class names (e.g., `View__StyledView-dJETNi`). Properties cannot be reliably extracted via class names.

**Working approach:** Parse the page's `innerText` for label-value patterns:
```javascript
// Properties appear as:
// "Amount: "
// "$125,000"
// "Close Date: "
// "2024-01-15"

const lines = document.body.innerText.split('\n').map(l => l.trim()).filter(l => l);
for (let i = 0; i < lines.length - 1; i++) {
  if (lines[i].endsWith(':') || lines[i].endsWith(': ')) {
    const label = lines[i].replace(/:$/, '').trim();
    const value = lines[i + 1];
    // Store as property
  }
}
```

**Important:** Values like `$125,000` need to be cleaned for numeric comparisons:
```javascript
const parseNumber = (val) => {
  const cleaned = String(val).replace(/[^0-9.\-]/g, '');
  return parseFloat(cleaned);
};
```

## Injection Strategy

### Finding the Correct Container

```javascript
function findInjectTarget() {
  // 1. Find the visible tab content
  const tabContents = document.querySelectorAll('[data-test-id^="tab-"][data-test-id$="-content"]');
  let visibleTab = null;

  for (const tab of tabContents) {
    if (tab.offsetHeight > 0 && tab.offsetWidth > 0) {
      visibleTab = tab;
      break;
    }
  }

  // 2. Find the scroll container within the visible tab
  const scrollContainer = visibleTab.querySelector('[class*="ScrollContainer"]');
  const searchRoot = scrollContainer || visibleTab;

  // 3. Find cards and locate the container with most children
  const cards = searchRoot.querySelectorAll('[data-test-id*="card-wrapper"]');
  let bestContainer = null;
  let maxChildren = 0;

  for (const card of cards) {
    let parent = card.parentElement;
    for (let i = 0; i < 5; i++) {
      if (parent && parent.children.length > maxChildren && searchRoot.contains(parent)) {
        maxChildren = parent.children.length;
        bestContainer = parent;
      }
      parent = parent?.parentElement;
    }
  }

  if (bestContainer && maxChildren > 3) {
    return bestContainer;
  }

  return scrollContainer || visibleTab;
}
```

### Tab Switching

HubSpot is a SPA - tab content changes without page reload. Listen for tab clicks:

```javascript
const middlePane = document.querySelector('[data-test-id="middle-pane"]');
middlePane.addEventListener('click', (e) => {
  const target = e.target.closest('[role="tab"], [class*="Tab"], button');
  if (target) {
    setTimeout(() => {
      // Check if banner is visible (offsetParent is null if hidden)
      const banner = document.getElementById('my-banner');
      if (!banner || !banner.offsetParent) {
        // Re-render banner in new tab
        render();
      }
    }, 300);
  }
});
```

### Cleanup

When re-rendering, remove ALL instances of injected elements:

```javascript
function cleanup() {
  const banners = document.querySelectorAll('#my-banner, .my-banner-class');
  banners.forEach(el => el.remove());
}
```

## CSS for Inline Banners

```css
.banner-container.inline {
  position: relative;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 0;  /* Match HubSpot card padding */
  margin: 0;
  width: auto;
  box-sizing: border-box;
}

.banner-container.inline .banner {
  max-width: none;
  margin: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  border: 1px solid #e5e5e5;
}
```

## Debugging Tips

### Check if element is visible
```javascript
element.offsetParent !== null  // true if visible
```

### Find scroll container
```javascript
document.querySelector('[class*="ScrollContainer"]')
```

### Check if banner is inside scroll container
```javascript
scrollContainer.contains(bannerElement)  // must be true for scrolling
```

### Trace parent hierarchy
```javascript
var el = targetElement;
for (var i = 0; i < 8; i++) {
  console.log(i, el?.className?.slice(0,50), el?.children?.length);
  el = el?.parentElement;
}
```

### Find visible tab
```javascript
const tabs = document.querySelectorAll('[data-test-id^="tab-"][data-test-id$="-content"]');
tabs.forEach(t => console.log(t.dataset.testId, t.offsetHeight > 0 ? 'visible' : 'hidden'));
```

## Common Pitfalls

1. **URL Detection**: Don't use `/contacts/` vs `/deals/` in URL - all records use `/contacts/`. Check the object type ID instead.

2. **Scroll Container**: The scroll container is at different levels on different tabs. Always search for it dynamically.

3. **Tab Switching**: Content in hidden tabs still exists in DOM. Use `offsetParent` or `offsetHeight` to check visibility.

4. **Class Names**: HubSpot uses styled-components with random suffixes. Use partial matches: `[class*="ScrollContainer"]`

5. **Numeric Values**: Currency values like `$125,000` won't parse correctly. Strip non-numeric characters first.

6. **Multiple Instances**: When re-rendering on tab switch, clean up ALL instances of your injected elements, not just the main container.

## Property Label Selectors

HubSpot uses many different DOM structures for property labels across different contexts. Use multiple selectors to catch them all.

### Record Page Selectors (Left Sidebar)
```javascript
// Primary property labels
'[data-selenium-test*="property-label"]'
'[class*="PropertyLabel"]'
'[class*="property-label"]'

// Sidebar-specific
'[data-test-id="left-sidebar"] [class*="label"]'
'[data-test-id="left-sidebar"] [class*="Label"]'
'[data-test-id="left-sidebar"] [class*="truncate"]'
'[data-test-id="left-sidebar"] [class*="Truncate"]'

// Highlighted property sidebar
'[data-selenium-test="highlightedPropertySidebar"] [class*="label"]'
'[data-selenium-test="highlightedPropertySidebar"] [class*="Label"]'

// Property list items
'[data-test-id="left-sidebar"] li'
'[data-test-id="left-sidebar"] [class*="property"] span:first-child'
```

### Index/List Page Selectors (Table Headers)

**IMPORTANT**: Table headers have deeply nested structures. Target the INNERMOST text container, NOT the `<th>` or `[role="columnheader"]` itself.

```javascript
// WRONG - causes layout issues (icon at top of cell, column stacking):
'[role="columnheader"]'
'table th'
'th[data-test-id]'

// CORRECT - targets the actual text container inside:
'[data-test-id*="truncated-object-label"]'  // The innermost text wrapper
'[class*="TruncateDiv"]'                     // Truncated text container
'[class*="TruncateString"] > span > span'    // Alternative text wrapper
```

**Why this matters**: HubSpot table headers wrap text in 5-6 levels of nested divs. If you inject an icon into the `<th>` directly, it appears at the TOP of the cell instead of next to the text, causing:
- Extra row height
- Columns appearing to "stack" on top of each other
- Icons in wrong position

### Filter Panel Selectors
```javascript
'[data-test-id="filter-panel"] label'
'[data-test-id="filter-panel"] [class*="label"]'
'[class*="FilterEditor"] label'
'[class*="FilterEditor"] [class*="label"]'
'[class*="filter-property"] label'
'[data-selenium-test*="filter"] label'

// Filter dropdown buttons
'[class*="DropdownButtonLabel"] [class*="TruncateString"] span:not([class])'
'[class*="FilterEditor"] [class*="TruncateString"] span:not([class])'
```

### Getting Direct Text Content
HubSpot often nests elements. To get just the label text (not child values):
```javascript
function getDirectTextContent(element) {
  let text = '';
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    }
  }
  return text.trim();
}
```

## Lazy Loading Behavior

### Index Pages
Index/list pages lazy-load table rows and content as you scroll. A single pass won't catch everything.

**Pattern**: Multiple delayed passes + scroll listener
```javascript
// Initial passes
setTimeout(() => applyHighlighting(), 500);
setTimeout(() => applyHighlighting(), 1500);
setTimeout(() => applyHighlighting(), 3000);

// Scroll listener for new content
scrollContainer.addEventListener('scroll', () => {
  clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => applyHighlighting(), 1000);
}, { passive: true });
```

### Record Pages
Record pages load sidebar content dynamically. Use MutationObserver.

**Pattern**: Watch specific containers
```javascript
const observer = new MutationObserver((mutations) => {
  // Debounce and reapply
  clearTimeout(updateTimeout);
  updateTimeout = setTimeout(() => applyHighlighting(), 500);
});

const leftSidebar = document.querySelector('[data-test-id="left-sidebar"]');
if (leftSidebar) {
  observer.observe(leftSidebar, { childList: true, subtree: true });
}
```

## Index Page Structure

```
Index pages (e.g., /contacts/PORTAL_ID/objects/0-1/views/all/list)
├── Filter panel (top)
│   └── [data-test-id="filter-panel"]
├── Table container
│   └── [data-test-id="table"] or [class*="IndexPage"]
│       ├── <thead>
│       │   └── <tr>
│       │       └── <th role="columnheader" data-test-id="header-0-2-propertyname">
│       │           └── <div data-test-id="drag-header-...">
│       │               └── <div class="Flex__StyledFlex...">
│       │                   └── <div class="Box__StyledBox...">
│       │                       └── <span class="TruncateString__...">
│       │                           └── <span class="TruncateStringInner...">
│       │                               └── <div data-test-id="truncated-object-label">
│       │                                   └── "Property Label Text"  ← TARGET THIS
│       └── <tbody>
│           └── <tr> (lazy-loaded rows)
└── Scroll container
    └── [class*="IndexPage"] or <main>
```

**Key insight**: The actual label text is 6-7 levels deep inside the `<th>`. Target `[data-test-id*="truncated-object-label"]` or `[class*="TruncateDiv"]` to inject icons next to text.

## Data Attributes Reference

| Attribute | Location | Purpose |
|-----------|----------|---------|
| `data-test-id="left-sidebar"` | Record page | Left property panel |
| `data-test-id="middle-pane"` | Record page | Main content area |
| `data-test-id="records-right-sidebar"` | Record page | Associations panel |
| `data-test-id="tab-N-content"` | Record page | Tab content containers |
| `data-test-id="card-wrapper-*"` | Record page | Individual cards |
| `data-test-id="filter-panel"` | Index page | Filter controls |
| `data-test-id="table"` | Index page | Data table |
| `data-selenium-test="highlightedPropertySidebar"` | Record page | Key properties section |
| `data-selenium-test*="property-label"` | Various | Property labels |
| `role="columnheader"` | Index page | Table column headers |
| `role="tablist"` | Record page | Tab navigation |

---

*Last updated: December 2024*
