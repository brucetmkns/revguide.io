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

### Smart Plural Matching
**Lesson**: Users expect "Company" to match "Companies" without adding aliases manually.

**Problem**: Exact matching (`===`) means "company" won't match "companies" - they're different strings.

**Solution**: Check common English plural forms automatically:
```javascript
const isMatch = textToMatch === term ||
  textToMatch === term + 's' ||           // deal → deals
  textToMatch === term + 'es' ||          // box → boxes
  (term.endsWith('y') && textToMatch === term.slice(0, -1) + 'ies') || // company → companies
  (textToMatch.endsWith('s') && textToMatch.slice(0, -1) === term) ||  // deals → deal
  (textToMatch.endsWith('es') && textToMatch.slice(0, -2) === term) || // boxes → box
  (textToMatch.endsWith('ies') && textToMatch.slice(0, -3) + 'y' === term); // companies → company
```

**Handles**:
- `company` ↔ `companies` (y → ies)
- `contact` ↔ `contacts` (+ s)
- `deal` ↔ `deals` (+ s)
- Works in both directions (singular trigger matches plural text, plural trigger matches singular text)

### HubSpot Custom Elements
**Lesson**: HubSpot uses custom HTML elements like `<i18n-string>` for internationalized labels.

**Problem**: These aren't standard HTML tags, so `isLikelyLabelContext()` rejected them.

**Solution**: Add HubSpot-specific tags to the accepted list:
```javascript
const labelTags = new Set([
  'SPAN', 'DIV', 'LABEL', /* ... standard tags ... */
  'I18N-STRING' // HubSpot's internationalization component
]);
```

**Where `I18N-STRING` appears**:
- Association card titles: "Contacts (3)", "Companies (0)"
- Count labels in sidebars
- Other internationalized UI text

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

## HubSpot OAuth Implementation (v2.0)

### Direct OAuth vs Nango Middleware
**Lesson**: Direct OAuth with Supabase edge functions is simpler and more reliable than using a third-party OAuth middleware like Nango.

**Previous architecture (Nango)**:
- Frontend → Nango Connect UI → HubSpot → Nango → Webhook → Database
- Tokens stored in Nango's vault
- Required NANGO_SECRET_KEY environment variable
- Multiple redirects and session token management
- Complex webhook handling for OAuth completion

**New architecture (Direct)**:
- Frontend → Edge Function → HubSpot OAuth → Edge Function callback → Database
- Tokens encrypted and stored directly in our database
- Simpler flow with fewer points of failure

### Edge Function JWT Verification
**Lesson**: OAuth callback endpoints must disable JWT verification since they're called by external redirects (no auth header).

**Problem**: Supabase edge functions require JWT by default. HubSpot redirects users to callback URL without any auth header.

**Solution**: Deploy with `--no-verify-jwt` flag:
```bash
supabase functions deploy hubspot-oauth --no-verify-jwt
```

Or create `config.toml` in function folder:
```toml
verify_jwt = false
```

### Database Schema Constraints
**Lesson**: When creating records during OAuth flow, ensure all NOT NULL constraints are satisfied.

**Issues encountered**:
1. `organizations.slug` required - generate from portal name:
```typescript
const slug = orgName.toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '') || `org-${portalId}`
```

2. `hubspot_connections.connected_by` FK references `users.id`, not `auth.users.id`:
```typescript
// WRONG - auth_user_id from oauth state
p_connected_by: oauthState.user_id

// CORRECT - users.id from users table
const { data: user } = await supabase
  .from('users')
  .select('id')
  .eq('auth_user_id', oauthState.user_id)
  .single()
p_connected_by: user?.id
```

### Token Storage Security
**Lesson**: Store OAuth tokens encrypted in database using pgcrypto.

**Pattern**:
```sql
-- Encrypt on store
pgp_sym_encrypt(access_token, encryption_key)

-- Decrypt on use
pgp_sym_decrypt(access_token_encrypted, encryption_key)
```

**Environment variable**: `TOKEN_ENCRYPTION_KEY` (32-byte random key)

### OAuth State for CSRF Protection
**Lesson**: Always use state parameter to prevent CSRF attacks.

**Pattern**:
```typescript
// Generate state and store in database
const state = crypto.randomUUID()
await supabase.from('oauth_states').insert({
  state,
  user_id: userId,
  return_url: returnUrl,
  expires_at: new Date(Date.now() + 10 * 60 * 1000) // 10 min
})

// In callback, validate state exists and hasn't expired
const { data: oauthState } = await supabase
  .from('oauth_states')
  .select('*')
  .eq('state', state)
  .single()

if (!oauthState || new Date(oauthState.expires_at) < new Date()) {
  return redirectWithError('Invalid or expired session')
}

// Delete used state
await supabase.from('oauth_states').delete().eq('state', state)
```

### Token Refresh
**Lesson**: HubSpot access tokens expire in 30 minutes. Refresh proactively before expiry.

**Pattern**:
```typescript
async function getValidAccessToken(connectionId) {
  const { access_token, token_expires_at, refresh_token } = await getTokens(connectionId)

  // Refresh if expires within 5 minutes
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000)
  if (new Date(token_expires_at) > fiveMinutesFromNow) {
    return access_token // Still valid
  }

  // Refresh token
  const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: HUBSPOT_CLIENT_ID,
      client_secret: HUBSPOT_CLIENT_SECRET,
      refresh_token
    })
  })

  const newTokens = await response.json()
  await updateTokens(connectionId, newTokens)
  return newTokens.access_token
}
```

### Files for HubSpot OAuth
- `supabase/functions/hubspot-oauth/index.ts` - Edge function with all endpoints
- `admin/hubspot.js` - Frontend client (replaces nango.js)
- `admin/pages/settings.js` - Uses RevGuideHubSpot client
- `supabase/migrations/002_direct_hubspot_oauth.sql` - Token columns and oauth_states table

---

## Supabase Row Level Security (RLS) with PostgREST (v2.1.1)

### RLS + Joins = 500 Errors
**Lesson**: PostgREST queries with joins can fail with 500 errors when RLS policies create circular dependencies or permission conflicts.

**Problem**: A query like `users?select=*,organizations(*)` failed with a 500 Internal Server Error even though:
- User was authenticated
- Foreign key relationship was valid
- Both tables had data

**Root cause**: RLS policies on `users` and `organizations` tables created a circular dependency:
- Users policy: "Can only see users in my organization"
- Organizations policy: "Can only see my organization"
- To see users → need organization_id → need to query organizations → need to check if user belongs to org → need to query users

**Solution options**:
1. **Disable RLS** (NOT recommended - reduces security):
```sql
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
```

2. **Use separate queries** instead of joins (workaround):
```javascript
// WRONG - join query fails with RLS
const { data } = await client
  .from('users')
  .select('*, organizations(*)')
  .eq('auth_user_id', user.id)
  .single();

// WORKAROUND - separate queries work
const { data: userProfile } = await client
  .from('users')
  .select('*')
  .eq('auth_user_id', user.id)
  .single();

if (userProfile.organization_id) {
  const { data: org } = await client
    .from('organizations')
    .select('*')
    .eq('id', userProfile.organization_id)
    .single();
  userProfile.organizations = org;
}
```

3. **Fix RLS policies with SECURITY DEFINER function** (RECOMMENDED):
```sql
-- Create a helper function that bypasses RLS to get user's org
CREATE OR REPLACE FUNCTION get_user_organization_id(p_auth_uid UUID)
RETURNS UUID AS $$
  SELECT organization_id FROM users WHERE auth_user_id = p_auth_uid LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_user_organization_id TO authenticated;

-- Now policies can use this function instead of subqueries
CREATE POLICY "Users can view own organization" ON organizations
  FOR SELECT USING (
    id = get_user_organization_id(auth.uid())
  );

CREATE POLICY "Users can view org members" ON users
  FOR SELECT USING (
    organization_id = get_user_organization_id(auth.uid())
  );
```

The key insight: `SECURITY DEFINER` functions run with the privileges of the function owner (typically the DB owner), bypassing RLS. This breaks the circular dependency while still enforcing proper access control.

### Debugging RLS Issues
**Lesson**: When PostgREST returns 500, RLS is often the culprit.

**Debugging steps**:
1. Check if query works with RLS disabled
2. Check policy definitions: `SELECT * FROM pg_policies WHERE tablename = 'users';`
3. Test individual table access before testing joins
4. Look for circular policy references

### HubSpot OAuth - Organization Naming
**Lesson**: Don't use technical identifiers as organization names.

**Problem**: HubSpot OAuth was creating organizations with names like "app.hubspot.com" because it used the portal domain when the portal name was unavailable.

**Solution**: Validate organization names before using them:
```typescript
let orgName = 'My Organization'
if (portalInfo.portalName &&
    portalInfo.portalName !== portalInfo.portalDomain &&
    !portalInfo.portalName.includes('hubspot.com')) {
  orgName = portalInfo.portalName
}
```

### Foreign Key References Across Tables
**Lesson**: Carefully check which table a FK references - `auth.users.id` vs `public.users.id` are different.

**Problem**: `hubspot_connections.connected_by` was a FK to `users.id` (our custom users table), but code was passing `auth.users.id` (Supabase auth user ID).

**Pattern**: When storing user references:
```javascript
// Need users.id, not auth_user_id
const { data: userRecord } = await client
  .from('users')
  .select('id')  // This is users.id
  .eq('auth_user_id', authUserId)  // Match by auth ID
  .single();

// Use userRecord.id for FK references
connection.connected_by = userRecord.id;
```

---

## Supabase Column Naming Conventions (v2.2.1)

### Snake_Case vs CamelCase Mapping
**Lesson**: Supabase/PostgreSQL uses snake_case for column names, but JavaScript frontend uses camelCase. You MUST map between them.

**Problem**: Saving data with camelCase keys (e.g., `objectType`, `displayOnAll`) to Supabase fails with "Could not find the 'objectType' column" because the actual column is `object_type`.

**Solution**: Create explicit mapping functions for each entity type:

```javascript
// When SAVING to Supabase (camelCase → snake_case)
const supabaseData = {
  name,
  card_type: cardType,        // camelCase → snake_case
  object_type: objectType,
  display_on_all: displayOnAll,
  // ... etc
};

// When LOADING from Supabase (snake_case → camelCase)
function mapPlayFromSupabase(data) {
  return {
    id: data.id,
    name: data.name,
    cardType: data.card_type,       // snake_case → camelCase
    objectType: data.object_type,
    displayOnAll: data.display_on_all,
    // ... etc
  };
}
```

**Files affected**:
- `admin/shared.js` - Global mapping functions for `loadStorageData()`
- `admin/pages/banners.js` - `mapBannerFromSupabase()` method
- `admin/pages/plays.js` - `mapPlayFromSupabase()` method
- `admin/pages/wiki.js` - `mapWikiFromSupabase()` method

### Direct Database Operations vs Cache
**Lesson**: In web context, save directly to Supabase, not just to local cache.

**Problem**: The original `saveStorageData()` function was only updating sessionStorage cache, not actually persisting to Supabase. Data appeared to save but was lost on page navigation.

**Solution**: Each page's save function should:
1. Save directly to Supabase via `RevGuideDB.createX()` / `updateX()`
2. Clear the storage cache so next load fetches fresh data
3. Update local state with the response from Supabase

```javascript
// WRONG - only updates cache, doesn't persist
await AdminShared.saveStorageData({ rules: this.rules });

// CORRECT - saves to database, clears cache
if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
  const { data, error } = await RevGuideDB.createBanner(supabaseData);
  if (error) throw error;
  AdminShared.clearStorageCache(); // Force fresh load next time
  this.rules.push(this.mapBannerFromSupabase(data));
}
```

### Missing Database Columns
**Lesson**: Supabase tables may not have all columns your frontend expects. Add them via migration.

**Problem**: Saving plays failed with "Could not find the 'object_type' column" because the plays table was created without that column.

**Solution**: Create a migration to add missing columns:
```sql
-- Migration 006: Add missing columns
ALTER TABLE plays ADD COLUMN IF NOT EXISTS object_type TEXT;
ALTER TABLE plays ADD COLUMN IF NOT EXISTS display_on_all BOOLEAN DEFAULT false;

ALTER TABLE banners ADD COLUMN IF NOT EXISTS object_type TEXT;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS embed_url TEXT;
-- ... etc
```

**Important**: Run migrations via Supabase Dashboard → SQL Editor, not just by creating the file.

---

*Last updated: December 2024*
