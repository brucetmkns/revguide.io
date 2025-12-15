# HubSpot DOM Structure Reference

A reference guide for targeting text elements in HubSpot's UI. Use this when adding tooltip support to new areas.

---

## General Patterns

### Lazy-Loaded Content
Most HubSpot UI elements are lazy-loaded. Content appears:
- On page scroll (infinite scroll lists)
- On hover (navigation menus, tooltips)
- On click (modals, dropdowns, sidebars)
- After API calls complete (record data, search results)

**Implication**: A single-pass DOM scan on page load will miss content. Use MutationObserver to detect when content appears.

### Observer Attachment Points
When setting up MutationObserver, be aware that HubSpot often renders dynamic content as siblings to containers, not inside them.

**Pattern**: When in doubt, attach observer to `document.body` with `{ childList: true, subtree: true }`.

**Example**: Secondary navigation menus render outside the main nav container, not inside it.

---

## Navigation Elements

### Primary Navigation (Top-Level Categories)
```html
<a data-menu-item-level="primary" data-location="vertical-nav">
  <svg>...</svg>  <!-- Icon only, no text when collapsed -->
</a>
```

**Targeting**: Generally avoid - icons don't work well when nav is collapsed.

### Secondary Navigation (Sub-Menu Items)
Appears when hovering over primary nav items. Lazy-loaded.

```html
<a class="VerticalNavSecondaryMenuItem__StyledLink-..."
   data-menu-item-level="secondary"
   data-location="vertical-nav"
   role="menuitem">
  <span class="label">Companies</span>
  <div>...bookmark button...</div>
</a>
```

**Targeting**: `[data-menu-item-level="secondary"] > span.label`

**Key attributes**:
- `data-menu-item-level="secondary"` - Identifies secondary nav items
- `data-location="vertical-nav"` - Confirms it's in vertical nav
- `role="menuitem"` - Semantic role

**Lazy-loading**: Items don't exist until menu is expanded. Must observe `document.body` for `[data-menu-item-level="secondary"]` additions.

---

## Record Pages (Contacts, Companies, Deals, etc.)

### Left Sidebar Property Labels
```html
<div data-test-id="left-sidebar">
  <div class="PropertyLabel__StyledLabel-...">
    <span class="TruncateString__StyledSpan-...">
      <span>Property Name</span>
    </span>
  </div>
</div>
```

**Targeting**:
- `[data-test-id="left-sidebar"] [class*="PropertyLabel"]`
- `[data-selenium-test*="property-label"]`
- `[data-test-id="left-sidebar"] [class*="truncate"]`

### Property Values
```html
<div class="PropertyValue__...">
  <span>Value Text</span>
</div>
```

---

## Table Views (Index Pages)

### Column Headers
**Critical**: Never target `<th>` directly - text is deeply nested.

```html
<th role="columnheader">
  <div data-test-id="drag-header-...">
    <div class="Flex__StyledFlex...">
      ...multiple wrapper divs...
      <div class="TruncateDiv__NoWrapDiv-...">
        Actual Label Text Here  <!-- TARGET THIS -->
      </div>
    </div>
  </div>
</th>
```

**Targeting**:
- `[data-test-id*="truncated-object-label"]`
- `[class*="TruncateDiv"]`
- `[class*="TruncateString"] > span > span`

**Wrong** (causes layout issues):
- `[role="columnheader"]`
- `table th`

### Table Cells
Similar nesting pattern. Target innermost text container.

---

## Dropdowns & Menus

### Select Dropdowns
```html
<div role="listbox">
  <div role="option" data-option-text="true">
    Option Text
  </div>
</div>
```

**Targeting**:
- `[role="option"]`
- `[data-option-text="true"]`

### Menu Items
```html
<div role="menuitem" class="MenuItem__...">
  Menu Item Text
</div>
```

**Targeting**:
- `[role="menuitem"]`
- `[class*="MenuItem"]`

---

## Modals & Dialogs

### Modal Content
```html
<div role="dialog" class="Modal__...">
  <div class="ModalHeader__...">Title</div>
  <div class="ModalBody__...">
    ...content...
  </div>
</div>
```

**Targeting**: Target text inside modal body, not the modal container.

---

## Common Class Patterns

HubSpot uses styled-components with predictable naming:

| Pattern | Example | Purpose |
|---------|---------|---------|
| `__Styled*` | `PropertyLabel__StyledLabel-abc123` | Styled component |
| `*__StyledFlex-*` | `Flex__StyledFlex-xyz789` | Flexbox container |
| `*Truncate*` | `TruncateString__StyledSpan-...` | Text truncation wrapper |
| `*MenuItem*` | `VerticalNavSecondaryMenuItem__StyledLink-...` | Menu items |

---

## Data Attributes

Reliable for targeting:

| Attribute | Example | Use |
|-----------|---------|-----|
| `data-test-id` | `data-test-id="companies"` | Test identifiers, stable |
| `data-selenium-test` | `data-selenium-test="property-label"` | Selenium test hooks |
| `data-menu-item-level` | `"primary"` or `"secondary"` | Nav menu hierarchy |
| `data-location` | `"vertical-nav"` | UI location context |
| `role` | `"menuitem"`, `"option"`, `"columnheader"` | ARIA roles |

---

## Icon Insertion Strategies

### Strategy 1: Wrap Element (Default)
Wrap the target element in a span with padding-left for icon space.

```html
<!-- Before -->
<span class="label">Companies</span>

<!-- After -->
<span class="hshelper-wiki-wrapper" style="padding-left: 1.15em; position: relative;">
  <span class="hshelper-wiki-icon-container" style="position: absolute; left: 0;">
    <span class="hshelper-wiki-icon">...</span>
  </span>
  <span class="label">Companies</span>
</span>
```

**Pros**: Works with any element, doesn't modify original element.
**Cons**: Adds DOM depth.

### Strategy 2: Prepend to Element
Insert icon as first child of target element.

**Pros**: Simpler DOM structure.
**Cons**: May break layouts if element has specific CSS expectations.

### Strategy 3: Wrap Text Node
For raw text nodes, wrap just the text.

```html
<!-- Before -->
<span class="label">Companies</span>

<!-- After -->
<span class="label">
  <span class="hshelper-wiki-wrapper">
    <span class="hshelper-wiki-icon-container">...</span>
    Companies
  </span>
</span>
```

---

## Debugging Tips

### Find elements by attribute
```javascript
document.querySelectorAll('[data-menu-item-level="secondary"]')
```

### Check if elements exist but hidden
```javascript
// Elements may exist but be display:none or visibility:hidden
document.querySelectorAll('[data-menu-item-level]').length
```

### Test observer detection
```javascript
const testObserver = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType === 1 && node.matches?.('[your-selector]')) {
        console.log('FOUND:', node);
      }
    }
  }
});
testObserver.observe(document.body, { childList: true, subtree: true });
```

### Inspect disappearing elements
For elements that disappear on mouse move (menus, tooltips):
```javascript
setTimeout(() => { debugger; }, 3000)
// Then hover over element within 3 seconds
```

---

*Last updated: December 2024*
