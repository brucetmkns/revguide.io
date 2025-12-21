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
- `admin/hubspot.js` - Frontend HubSpot OAuth client
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

## Email/Password Authentication (v2.5.0)

### Magic Links vs Passwords
**Lesson**: Magic links can be problematic with corporate email security systems like Outlook SafeLinks.

**Problem**: Outlook SafeLinks pre-fetches URLs in emails to scan for malware. This consumes one-time tokens (OTP) before the user clicks the link, causing "link expired" errors even seconds after receiving the email.

**Solution options**:
1. **Switch to password auth** (recommended) - No one-time tokens to expire
2. **Disable email confirmation** - Users can login immediately
3. **Increase OTP expiry** - Gives more time, but doesn't solve SafeLinks
4. **Resend confirmation** - Allow users to request new link

**Implementation**: We switched to email/password authentication:
```javascript
// Signup with password
await client.auth.signUp({
  email,
  password,
  options: {
    emailRedirectTo: redirectUrl,
    data: { full_name, company_name }  // Stored in user metadata
  }
});

// Login with password
await client.auth.signInWithPassword({ email, password });
```

### Persisting Data Through Email Confirmation
**Lesson**: Data entered on signup form is lost when email confirmation redirects to a different page/context.

**Problem**: User enters name/company on `/signup`, but after clicking email confirmation link:
- `sessionStorage` is cleared (different browser session/context)
- Form data is gone
- User must re-enter information

**Solution**: Store signup data in Supabase user metadata:
```javascript
// During signup - store in auth metadata
await client.auth.signUp({
  email,
  password,
  options: {
    data: {
      full_name: name,
      company_name: company
    }
  }
});

// Later - retrieve from authenticated user
const { data: { user } } = await client.auth.getUser();
const name = user.user_metadata?.full_name;
const company = user.user_metadata?.company_name;
```

**Key insight**: Supabase `user_metadata` persists across sessions and is available immediately after authentication.

### Forgot Password for Legacy Users
**Lesson**: When switching auth methods, provide migration path for existing users.

**Problem**: Users who previously used magic links don't have passwords. They can't login with the new password form.

**Solution**: Add "Forgot password?" link that sends password reset email:
```javascript
// Reset password flow
await client.auth.resetPasswordForEmail(email, {
  redirectTo: window.location.origin + '/reset-password'
});

// On reset-password page, update the password
await client.auth.updateUser({ password: newPassword });
```

---

## RLS INSERT + SELECT Combination Issues (v2.5.0)

### The Problem with .select() After INSERT
**Lesson**: PostgREST's `.select()` after `.insert()` can fail even when INSERT policy allows the operation.

**Problem**: This query fails with RLS even when INSERT policy is `WITH CHECK (true)`:
```javascript
const { data, error } = await client
  .from('organizations')
  .insert({ name: 'Test', slug: 'test' })
  .select()  // <-- This SELECT fails!
  .single();
```

**Why**: The INSERT succeeds, but the subsequent SELECT fails because:
1. SELECT policy: "Can only see organizations where user is a member"
2. User just created org but isn't linked to it yet (user record not created)
3. SELECT policy blocks returning the newly created row
4. Entire operation appears to fail with 403

**Diagnosis**: Test INSERT without `.select()`:
```javascript
// This returns status: 201 (success)
const result = await client
  .from('organizations')
  .insert({ name: 'Test', slug: 'test' });
// data is null, but row was created!
```

### Solution: SECURITY DEFINER Functions
**Lesson**: Use PostgreSQL functions with SECURITY DEFINER for atomic multi-table operations.

**Pattern**: Create a function that runs with elevated privileges:
```sql
CREATE OR REPLACE FUNCTION create_user_with_organization(
  p_name TEXT,
  p_company_name TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER  -- Runs as function owner, bypasses RLS
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
BEGIN
  v_user_id := auth.uid();

  -- Create organization
  INSERT INTO organizations (name, slug)
  VALUES (p_company_name, generate_slug(p_company_name))
  RETURNING id INTO v_org_id;

  -- Create user linked to org
  INSERT INTO users (auth_user_id, name, organization_id, role)
  VALUES (v_user_id, p_name, v_org_id, 'admin');

  RETURN json_build_object('success', true, 'organization_id', v_org_id);
END;
$$;
```

**Call from JavaScript**:
```javascript
const { data, error } = await client.rpc('create_user_with_organization', {
  p_name: name,
  p_company_name: companyName
});
```

**Benefits**:
- Atomic operation (both succeed or both fail)
- Bypasses RLS for internal operations
- Returns data without SELECT policy issues
- Cleaner client-side code

### RLS Policy Role Targeting
**Lesson**: RLS policies must explicitly target the `authenticated` role for client-side access.

**Problem**: Policy with `TO public` doesn't work for authenticated Supabase clients:
```sql
-- WRONG - {public} role doesn't include authenticated in Supabase context
CREATE POLICY "allow_insert" ON organizations FOR INSERT;  -- defaults to public
```

**Solution**: Explicitly specify `TO authenticated`:
```sql
-- CORRECT - explicitly targets authenticated users
CREATE POLICY "allow_insert" ON organizations
FOR INSERT TO authenticated
WITH CHECK (true);
```

**Debugging**: Check policy roles:
```sql
SELECT policyname, roles, with_check
FROM pg_policies
WHERE tablename = 'organizations';
```

### Schema Cache Refresh
**Lesson**: PostgREST caches the schema. Policy changes may not take effect immediately.

**Pattern**: After changing policies, refresh the cache:
```sql
NOTIFY pgrst, 'reload schema';
```

Or wait ~30 seconds for automatic refresh.

---

## Auto-Profile Creation on First Login (v2.5.0)

### Handling Missing Profiles
**Lesson**: Auth users may exist without corresponding profile records. Handle gracefully.

**Problem**: User completes Supabase auth (email confirmation) but profile creation fails or is skipped. On next page load, user is authenticated but has no profile in `users` table.

**Solution**: Check and create profile in `checkAuth()`:
```javascript
async function checkAuth() {
  const { data: { session } } = await RevGuideAuth.getSession();
  if (!session) {
    redirect('/login');
    return false;
  }

  let { data: profile } = await RevGuideDB.getUserProfile();

  // Auto-create profile if missing
  if (!profile) {
    const { data: { user } } = await RevGuideAuth.getUser();
    const fullName = user.user_metadata?.full_name;
    const companyName = user.user_metadata?.company_name;

    if (fullName && companyName) {
      await RevGuideDB.createUserWithOrganization(fullName, companyName);
      profile = (await RevGuideDB.getUserProfile()).data;
    }
  }

  return true;
}
```

**Key insight**: User metadata from signup is always available via `auth.getUser()`, even if profile creation initially failed.

---

## Team Invitation System (v2.5.1)

### Database Role Constraints vs UI Values
**Lesson**: Database CHECK constraints must match the values used in the UI dropdown.

**Problem**: UI dropdown had `value="user"` but database constraint only allowed `('admin', 'editor', 'viewer')`. Insert failed with "violates check constraint".

**Solution**: Always verify database constraints match frontend values:
```sql
-- Check what values are allowed
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'invitations_role_check';
```

**Pattern**: UI select options must use exact values from database constraint:
```html
<select id="inviteRole">
  <option value="viewer">Viewer - Can view content</option>
  <option value="editor">Editor - Can edit content</option>
  <option value="admin">Admin - Can manage content and users</option>
</select>
```

### Cloudflare Worker CORS Configuration
**Lesson**: When calling a Cloudflare Worker from a web app, the worker must explicitly allow the origin.

**Problem**: Worker had `allowedOrigins: ['chrome-extension://*', 'https://app.revguide.io']` but CORS check logic was broken.

**Wrong approach**:
```javascript
// WRONG - includes() with wildcard replacement doesn't work correctly
const isAllowed = CONFIG.allowedOrigins.some(allowed =>
  origin.includes(allowed.replace('*', ''))
);
```

**Correct approach**:
```javascript
// CORRECT - check chrome extensions separately, then exact match for domains
const isAllowed = origin.startsWith('chrome-extension://') ||
                  CONFIG.allowedOrigins.includes(origin);
```

### Cloudflare Worker Secrets
**Lesson**: Worker environment variables (secrets) are not automatically available after deploy. They must be explicitly set.

**Pattern**: After deploying a worker that uses secrets:
```bash
cd api
npx wrangler secret put RESEND_API_KEY
# Paste key when prompted
```

**Debugging**: If API returns "Email service not configured", the secret is missing:
```javascript
const apiKey = env.RESEND_API_KEY;
if (!apiKey) {
  return new Response(JSON.stringify({ error: 'Email service not configured' }), {
    status: 500
  });
}
```

### Resend Email Domain Verification
**Lesson**: Resend requires domain verification before sending emails. The `from` address must use a verified domain.

**Problem**: `from: 'team@revguide.io'` failed because only `email.revguide.io` subdomain was verified.

**Solution**: Use the verified subdomain:
```javascript
const CONFIG = {
  fromEmail: 'RevGuide <notifications@email.revguide.io>',  // Verified subdomain
  // NOT: 'team@revguide.io'  // Root domain not verified
};
```

### Variable Renaming in Refactors
**Lesson**: When renaming variables during refactoring, search for ALL usages across the file.

**Problem**: Renamed `normalizedRole` to just `role` in the validation section but forgot to update the email template function calls:
```javascript
// Validation used new name
if (!role || !validRoles.includes(role)) { ... }

// But template calls still used old name
html: buildInvitationEmailHtml(normalizedRole, ...)  // ReferenceError!
```

**Pattern**: Use IDE "Rename Symbol" feature or search for all occurrences before renaming.

### RLS Policies for Multi-Table Operations
**Lesson**: When RLS policies on table A need to check data in table B, use SECURITY DEFINER functions to avoid permission errors.

**Problem**: Invitation INSERT policy needed to verify user is an admin:
```sql
-- This policy fails with "permission denied for table users"
CREATE POLICY "Admins can manage invitations" ON invitations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE auth_user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );
```

**Solution**: Create SECURITY DEFINER helper functions:
```sql
-- Function bypasses RLS and runs as owner
CREATE OR REPLACE FUNCTION check_user_is_admin(p_auth_uid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_user_id = p_auth_uid
    AND role IN ('owner', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Policy uses function instead of direct query
CREATE POLICY "invitations_admin_insert" ON invitations
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_is_admin(auth.uid())
  );
```

### Cache Busting for JavaScript Files
**Lesson**: Browser caching can serve stale JavaScript even after deployment. Use version query parameters.

**Problem**: Fixed code deployed to production but browser served cached v=4 file instead of new v=5.

**Pattern**: Increment version parameter on script tags after changes:
```html
<script src="/admin/pages/settings.js?v=5"></script>
<!-- After next change: -->
<script src="/admin/pages/settings.js?v=6"></script>
```

**Alternative**: Use content hash in filename (requires build step).

---

## Extension Background Script Data Mapping

### Cloud Content Must Be Mapped to camelCase
**Lesson**: When fetching data from Supabase in the background script, apply snake_case to camelCase mapping before passing to content scripts.

**Problem**: Banner `tab_visibility` field from Supabase was not being mapped to `tabVisibility`. Content script checked `rule.tabVisibility` which was `undefined`, causing display rules to malfunction.

**Context**: The admin panel has mapping functions (`mapBannerFromSupabase`, etc.) but the background script's `fetchCloudContent()` was returning raw Supabase data without transformation.

**Solution**: Add mapping functions to `background/background.js` and apply them:
```javascript
// In fetchCloudContent()
const content = {
  rules: (banners || []).map(mapBannerFromSupabase),
  battleCards: (plays || []).map(mapPlayFromSupabase),
  wikiEntries: (wikiEntries || []).map(mapWikiFromSupabase)
};
```

**Key insight**: Data flows through multiple paths (admin panel, background script, content script). Each path must apply consistent field name transformations.

---

## JWT Token Management

### Automatic Token Refresh
**Lesson**: Supabase JWT tokens expire (default 1 hour). The extension must refresh tokens automatically to avoid 401 errors.

**Problem**: After ~1 hour of use, cloud content fetches failed with `JWT expired` error. Users had to re-login via the web app.

**Solution**: Check token validity before API calls and refresh if needed:
```javascript
async function ensureValidToken() {
  if (await isAuthValid()) return true;
  return await refreshAccessToken();
}

async function refreshAccessToken() {
  const authState = await getAuthState();
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refresh_token: authState.refreshToken })
  });
  // Update stored tokens with response
}

// Use before every API call
async function supabaseFetch(table, options = {}) {
  const tokenValid = await ensureValidToken();
  if (!tokenValid) throw new Error('Not authenticated - please log in again');
  // ... proceed with fetch
}
```

**Key insight**: Store both `accessToken` and `refreshToken` from auth. Check validity with 5-minute buffer before expiry.

---

## HubSpot Tab Detection

### Use data-test-id for Reliable Tab Identification
**Lesson**: HubSpot's `[role="tablist"]` may contain hidden elements (overflow menus, dropdowns). Counting tab elements leads to off-by-one errors.

**Problem**: Banner set to display on tab "1" (Overview) appeared on tab "2" (Activities). The tablist contained hidden elements being counted.

**Solution**: Extract tab number directly from HubSpot's `data-test-id` attribute:
```javascript
detectCurrentTab() {
  // HubSpot uses: data-test-id="tab-0-content", "tab-1-content", etc. (0-indexed)
  const tabContents = document.querySelectorAll('[data-test-id^="tab-"][data-test-id$="-content"]');
  for (const tab of tabContents) {
    if (tab.offsetHeight > 0 && tab.offsetWidth > 0) {
      const match = tab.getAttribute('data-test-id').match(/tab-(\d+)-content/);
      if (match) {
        const tabNumber = parseInt(match[1], 10) + 1; // Convert to 1-indexed
        return String(tabNumber);
      }
    }
  }
  return 'all';
}
```

**Key insight**: HubSpot's `data-test-id` attributes are stable and contain the actual tab index. More reliable than counting DOM elements.

---

## Invitation Signup Flow (v2.5.2)

### Skip Email Confirmation for Invited Users
**Lesson**: Users who click an invitation link have already verified their email. Don't make them confirm again.

**Problem**: Normal Supabase `signUp()` sends a confirmation email. For invited users, this creates friction - they already proved email ownership by clicking the invite link.

**Solution**: Use Supabase Admin API with `email_confirm: true`:
```javascript
// Cloudflare Worker using service role key
const createUserResponse = await fetch(
  `${SUPABASE_URL}/auth/v1/admin/users`,
  {
    method: 'POST',
    headers: {
      'apikey': serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: email,
      password: password,
      email_confirm: true,  // Skip email verification!
      user_metadata: { full_name: fullName }
    })
  }
);
```

**Key insight**: The Admin API (`/auth/v1/admin/users`) allows setting `email_confirm: true`, which the client-side `signUp()` method doesn't support.

### Database Role Constraint Mismatches
**Lesson**: When roles are used across multiple tables, ensure CHECK constraints are consistent.

**Problem**:
- Invitations table used roles: `viewer`, `editor`, `admin`
- Users table CHECK constraint only allowed: `owner`, `admin`, `member`
- Worker tried to insert `role: 'viewer'` into users table → constraint violation

**Solution**: Either:
1. **Update constraint** to allow all role values:
```sql
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'admin', 'editor', 'viewer', 'member'));
```

2. **Or map roles** in code when transferring between tables:
```javascript
const userRole = invitation.role === 'admin' ? 'admin' : 'member';
```

**Pattern**: Document which roles each table accepts and keep them synchronized.

### RLS Policies for Anonymous Pre-fill
**Lesson**: Signup pages need to fetch data before user is authenticated. Create limited RLS policies for anonymous access.

**Problem**: Signup page needed to fetch invitation details (email, org name) to pre-fill fields, but user isn't authenticated yet.

**Solution**: Create RLS policies for `anon` role with limited scope:
```sql
-- Allow anon to read invitations by token (tokens are unguessable UUIDs)
CREATE POLICY "invitations_public_by_token" ON invitations
  FOR SELECT TO anon
  USING (expires_at > now());

-- Allow anon to read org name via invitation join
CREATE POLICY "organizations_public_name_only" ON organizations
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM invitations
      WHERE invitations.organization_id = organizations.id
      AND invitations.expires_at > now()
    )
  );

GRANT SELECT ON invitations TO anon;
GRANT SELECT ON organizations TO anon;
```

**Security**: This is safe because:
- Tokens are random UUIDs (unguessable)
- Only returns data user already knows from invitation email
- Limits organization access to those with valid invitations

### Server-Side vs Client-Side Signup
**Lesson**: Complex signup flows (invite acceptance, profile creation, invitation marking) should be done server-side.

**Problem**: Client-side signup can't:
- Skip email confirmation (no access to Admin API)
- Atomically create user + profile + mark invitation
- Handle race conditions between steps

**Solution**: Create a dedicated server endpoint that handles everything:
```javascript
// POST /api/signup-invited
async function handleSignupInvited(request, env) {
  // 1. Validate invitation token
  // 2. Create auth user (Admin API, email pre-confirmed)
  // 3. Create user profile in users table
  // 4. Mark invitation as accepted
  // 5. Return success (client then signs in)
}
```

**Benefits**:
- Atomic operation (all succeed or all fail)
- Access to service role key for Admin API
- Cleaner error handling
- Single network round-trip from client

### Vercel Clean URLs
**Lesson**: Vercel automatically serves `page.html` at `/page`. Don't use `.html` in internal links.

**Problem**: Link `href="settings.html#team-members"` resulted in 404 because Vercel routes `/settings.html` differently than `/settings`.

**Solution**: Use clean URLs without extension:
```javascript
// WRONG
window.location.href = 'settings.html#team-members';

// CORRECT
window.location.href = '/settings#team-members';
```

**Pattern**: Always use absolute paths with leading `/` and no file extensions for internal navigation.

---

## Role-Based Access Control (v2.5.3)

### Multiple Role Values Across System
**Lesson**: When roles are used across multiple tables and UI components, ensure all code paths handle all possible role values.

**Problem**: The invitation system used roles `viewer`, `editor`, `admin`, but:
- `isMember()` only checked for `role === 'member'`
- Content pages used `isMember()` which returned `false` for `viewer` role
- Viewers saw edit controls because they weren't recognized as view-only users

**Solution**: Create comprehensive role-checking functions:
```javascript
// Check if user can edit content (owner, admin, or editor)
function canEditContent() {
  if (isExtensionContext) return true;
  const role = currentUser?.role;
  return role === 'owner' || role === 'admin' || role === 'editor';
}

// Check if user is view-only (viewer or legacy member)
function isMember() {
  if (isExtensionContext) return false;
  const role = currentUser?.role;
  return role === 'viewer' || role === 'member';
}

// In page scripts, use canEditContent() for view-only check
this.isViewOnly = !AdminShared.canEditContent();
```

**Key insight**: Always use positive capability checks (`canEditContent()`) rather than negative role checks (`!isAdmin()`). This makes it easier to add new roles later.

### RLS Policies Must Match Role Values
**Lesson**: Database RLS policies must include all role values that should have access.

**Problem**: Content table policies only allowed `owner` and `admin` to INSERT/UPDATE/DELETE:
```sql
-- Old policy - editors couldn't create content
AND role IN ('owner', 'admin')
```

**Solution**: Create a SECURITY DEFINER function that checks for all editing roles:
```sql
CREATE OR REPLACE FUNCTION check_user_can_edit_content(p_auth_uid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE auth_user_id = p_auth_uid
    AND role IN ('owner', 'admin', 'editor')  -- Include editor!
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Use in policies
CREATE POLICY "Editors can create banners" ON banners
  FOR INSERT WITH CHECK (
    organization_id = get_user_organization_id(auth.uid())
    AND check_user_can_edit_content(auth.uid())
  );
```

### UI Element Hiding by ID vs Class
**Lesson**: When hiding UI elements for view-only mode, use specific element IDs rather than class selectors that may not exist.

**Problem**: Wiki page tried to hide `.wiki-card-actions` class which didn't exist in the DOM:
```javascript
// WRONG - class doesn't exist
const cardActions = document.querySelector('.wiki-card-actions');
if (cardActions) cardActions.style.display = 'none';  // Never executes
```

**Solution**: Hide elements by their specific IDs:
```javascript
// CORRECT - target specific elements
const duplicateBtn = document.getElementById('duplicateEntryBtn');
const deleteBtn = document.getElementById('deleteEntryBtn');
if (duplicateBtn) duplicateBtn.style.display = 'none';
if (deleteBtn) deleteBtn.style.display = 'none';
```

### Organization ID Mismatch Debugging
**Lesson**: When users can't see content, first check if they're in the correct organization.

**Debugging steps**:
1. Check user's organization_id: `SELECT organization_id FROM users WHERE email = '...'`
2. Check content's organization_id: `SELECT organization_id FROM banners/plays/wiki_entries`
3. Compare - they must match for RLS to allow access
4. If mismatched, check invitation flow to see where user got wrong org_id

**Common causes**:
- User signed up directly instead of through invite link (creates new org)
- Invitation acceptance failed but auth user was created
- Manual data fix put user in wrong organization

---

## Service Worker importScripts Path Resolution (v2.6.0)

### Relative Paths in importScripts
**Lesson**: `importScripts()` in Chrome Extension service workers resolves paths relative to the service worker file's location, NOT relative to the extension root.

**Problem**: Service worker registration failed with "Status code: 15" error:
```
Uncaught NetworkError: Failed to execute 'importScripts' on 'WorkerGlobalScope':
The script at 'chrome-extension://xxx/background/lib/wiki-cache.js' failed to load.
```

**Root cause**: The service worker at `background/background.js` used:
```javascript
// WRONG - resolves to background/lib/wiki-cache.js
importScripts('lib/wiki-cache.js');
```

This resolved to `background/lib/wiki-cache.js` because `background/` is the script's directory. The actual file was at `lib/wiki-cache.js` (extension root).

**Solution**: Use `../` to navigate up to extension root:
```javascript
// CORRECT - resolves to lib/wiki-cache.js
importScripts('../lib/wiki-cache.js');
```

**Key insight**: Unlike HTML script tags which resolve from the document root, `importScripts()` uses the calling script's directory as the base path.

---

## Supabase Field Mapping for Cloud Content (v2.6.0)

### Complete Field Mapping is Critical
**Lesson**: When mapping Supabase data to JavaScript objects, include ALL fields the consuming code expects, not just the obvious ones.

**Problem**: Wiki tooltips showed "Built sorted term list: 0 terms" despite 7 wiki entries loading successfully.

**Root cause**: The `mapWikiFromSupabase()` function only mapped basic fields:
```javascript
// WRONG - incomplete mapping
function mapWikiFromSupabase(data) {
  return {
    id: data.id,
    term: data.term,
    definition: data.definition,
    objectTypes: data.object_types,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}
```

The wiki module's `buildTermMap()` requires `trigger` and `aliases` fields to build the searchable term list. Without these, the term list was empty.

**Solution**: Map ALL fields the module needs:
```javascript
function mapWikiFromSupabase(data) {
  if (!data) return null;
  return {
    id: data.id,
    term: data.term,
    trigger: data.trigger || data.term,  // Critical for term matching!
    definition: data.definition,
    aliases: data.aliases || [],          // Critical for aliases!
    category: data.category || 'general',
    link: data.link || '',
    enabled: data.enabled !== false,      // Default to enabled
    objectTypes: data.object_types,
    objectType: data.object_type,
    propertyGroup: data.property_group,
    matchType: data.match_type || 'exact',
    frequency: data.frequency || 'first',
    includeAliases: data.include_aliases !== false,
    priority: data.priority || 50,
    pageType: data.page_type || 'record',
    urlPatterns: data.url_patterns,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}
```

**Pattern**: When writing mapping functions:
1. Check ALL consumers of the mapped object
2. Identify which fields each consumer accesses
3. Provide sensible defaults for optional fields
4. Use `|| fallback` for string/array fields, `!== false` for booleans that default true

---

## Cloud Content Cache Invalidation (v2.6.0)

### Clearing Cache After Code Fixes
**Lesson**: After fixing data transformation bugs, cached data still uses the old (broken) transformation. You must clear the cache for fixes to take effect.

**Problem**: After fixing `mapWikiFromSupabase()`, wiki still showed 0 terms because content was loading from `cloud-cached` (cached in `chrome.storage.local`).

**Solution**: Clear the cloud content cache:
```javascript
// Run in service worker console
chrome.storage.local.remove(['cloudContent', 'cloudContentLastFetch']);
```

**When to clear cache**:
- After changing field mapping functions
- After changing data transformation logic
- After fixing bugs in data processing
- After schema changes in database

**Alternative**: Add a cache version that invalidates on code changes:
```javascript
const CACHE_VERSION = 2;  // Increment when mapping logic changes

const cached = await chrome.storage.local.get(['cloudContent', 'cloudCacheVersion']);
if (cached.cloudCacheVersion !== CACHE_VERSION) {
  // Cache is stale, fetch fresh
  await chrome.storage.local.remove(['cloudContent', 'cloudContentLastFetch']);
}
```

---

## Debugging Data Flow Issues

### Tracing Data Through Extension Components
**Lesson**: When content isn't displaying, add logging at each transformation point to identify where data gets lost.

**Debug logging pattern**:
```javascript
// 1. Log raw data from source
console.log('[RevGuide] Raw wiki data from Supabase:', wikiResponse.data);

// 2. Log after mapping
const mapped = wikiEntries.map(mapWikiFromSupabase);
console.log('[RevGuide] Mapped wiki entries:', mapped);
console.log('[RevGuide] First entry fields:', Object.keys(mapped[0] || {}));

// 3. Log in consuming module
console.log('[RevGuide Wiki] Building term map from', entries.length, 'entries');
console.log('[RevGuide Wiki] First entry trigger:', entries[0]?.trigger);

// 4. Log result
console.log('[RevGuide Wiki] Built sorted term list:', sortedTerms.length, 'terms');
```

**Key insight**: The issue is usually at a transformation boundary - where data passes from one component to another with different expectations.

---

## Multi-Portal Role Permissions (v2.7.3)

### Org-Specific Roles vs Primary Role
**Lesson**: In multi-portal systems, users have different roles per organization. Permission checks must use the role for the *current* organization, not the user's primary role.

**Problem**: User with `admin` role in their primary org and `consultant` role in another org could access admin features (team invites) in both, because `isAdmin()` only checked `currentUser.role`.

**Solution**: Create `getEffectiveRole()` that checks `organization_members` for the current org:
```javascript
function getEffectiveRole() {
  // If we have org memberships and a current org, use the org-specific role
  if (userOrganizations.length > 0 && currentOrganization?.id) {
    const membership = userOrganizations.find(
      o => o.organization_id === currentOrganization.id
    );
    if (membership?.role) {
      return membership.role;
    }
  }
  // Fallback to user's primary role
  return currentUser?.role || null;
}

// Update all role helpers to use it
function isAdmin() {
  const role = getEffectiveRole();
  return role === 'owner' || role === 'admin';
}
```

**Key insight**: The `organization_members` table stores per-org roles. The `users.role` field is just the primary/default role.

### Populating Organization Data from Multiple Sources
**Lesson**: When one data source fails (RLS blocking org query), use data that's already successfully loaded.

**Problem**: `currentOrganization` was `undefined` because the direct organizations query failed due to RLS, even though `userOrganizations` (from RPC function) had the correct data including org names.

**Solution**: In `loadUserOrganizations()`, populate `currentOrganization` from `userOrganizations` if not set:
```javascript
if (!currentOrganization && userOrganizations.length > 0 && currentUser) {
  const activeOrgId = currentUser.active_organization_id || currentUser.organization_id;
  const activeOrg = userOrganizations.find(o => o.organization_id === activeOrgId);

  if (activeOrg) {
    currentOrganization = {
      id: activeOrg.organization_id,
      name: activeOrg.organization_name,
      hubspot_portal_id: activeOrg.portal_id
    };
  }
}
```

**Key insight**: RPC functions with `SECURITY DEFINER` bypass RLS and can return data that direct queries can't. Use that data as a fallback.

---

## Web vs Extension Context: Data Operations (v2.7.4)

### The Dual-Context Problem
**Lesson**: The admin panel runs in two contexts - as a Chrome extension popup AND as a standalone web app. Data operations must handle both.

**Problem**: Many data operations (bulk delete, library install/uninstall, JSON import) were written for Chrome storage but failed silently in the web app context because they just modified local arrays without persisting to Supabase.

**Symptoms**:
- Success message shown but data not persisted
- Data reappears after page refresh
- Import shows "0 entries imported"

### The Pattern
Always check context and use appropriate storage backend:

```javascript
if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
  // Web context: Use Supabase directly
  for (const entry of entries) {
    const { error } = await RevGuideDB.createWikiEntry(mappedEntry);
    if (error) console.error('Failed:', error);
  }
  AdminShared.clearStorageCache();
} else {
  // Extension context: Use Chrome storage
  await AdminShared.saveStorageData({ wikiEntries });
}
```

### Field Name Mapping
**Lesson**: JavaScript uses camelCase, Supabase/PostgreSQL uses snake_case. Always map before database operations.

**Functions added** (`admin/shared.js`):
- `mapWikiToSupabase(data)` - Maps wiki entry fields
- `mapBannerToSupabase(data)` - Maps banner fields
- `mapPlayToSupabase(data)` - Maps play fields

**Example mapping**:
```javascript
function mapWikiToSupabase(data) {
  return {
    title: data.title,
    object_type: data.objectType,      // camelCase → snake_case
    property_group: data.propertyGroup,
    match_type: data.matchType,
    include_aliases: data.includeAliases,
    page_type: data.pageType,
    url_patterns: data.urlPatterns,
    enabled: data.enabled !== false
  };
}
```

### Tracking Database-Generated IDs
**Lesson**: When Supabase creates records, it generates UUIDs. Don't store locally-generated IDs for later operations.

**Problem**: Library install generated local IDs like `wiki_1234...`, stored them for uninstall, but Supabase created different UUIDs. Uninstall couldn't find entries.

**Solution**: Capture the actual ID returned by Supabase:
```javascript
const { data, error } = await RevGuideDB.createWikiEntry(mappedEntry);
if (!error && data?.id) {
  createdEntryIds.push(data.id); // Store actual Supabase UUID
}
```

### Operations That Needed Fixing
1. **Bulk delete** (wiki.js) - Was saving filtered array, not calling delete API
2. **JSON import** (settings.js, shared.js) - Missing field mapping
3. **Library install** (libraries.js) - Not calling Supabase at all
4. **Library uninstall** (libraries.js) - Not deleting from Supabase, wrong IDs stored

### Debugging Tips
- Add context logging: `console.log('[Import] Web context:', !AdminShared.isExtensionContext)`
- Log mapped data before insert: `console.log('[Import] Mapped:', mappedEntry)`
- Check for 400 errors in Network tab - usually means wrong field names
- If data "saves" but disappears on refresh, it's not reaching Supabase

---

## RLS Infinite Recursion (v2.7.5)

### The Problem: Self-Referencing Policies
**Lesson**: RLS policies that reference their own table in the USING clause cause infinite recursion errors.

**Problem**: Policy on `organization_members` tried to check if user belongs to the organization:
```sql
-- WRONG - causes "infinite recursion detected in policy for relation 'organization_members'"
CREATE POLICY "Users can view org memberships" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = auth.uid()
    )
  );
```

The policy references `organization_members` → triggers the same policy → infinite loop.

**Error**: `42P17: infinite recursion detected in policy for relation "organization_members"`

### Solution: SECURITY DEFINER Helper Functions
**Lesson**: Create `SECURITY DEFINER` functions to perform internal lookups that bypass RLS.

**Pattern**:
```sql
-- Helper function bypasses RLS (runs as function owner)
CREATE OR REPLACE FUNCTION get_user_org_ids(p_auth_uid UUID)
RETURNS SETOF UUID AS $$
  SELECT om.organization_id
  FROM organization_members om
  JOIN users u ON u.id = om.user_id
  WHERE u.auth_user_id = p_auth_uid;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_user_org_ids TO authenticated;

-- Policy uses function instead of subquery
CREATE POLICY "Users can view org memberships" ON organization_members
  FOR SELECT USING (
    user_id = get_user_id(auth.uid())
    OR organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );
```

**Key insight**: `SECURITY DEFINER` functions run with the privileges of the function owner (typically DB owner), bypassing RLS entirely. This breaks the recursion cycle.

### Additional Helper Functions
Common helpers that prevent recursion:

```sql
-- Get user's internal ID from auth ID
CREATE OR REPLACE FUNCTION get_user_id(p_auth_uid UUID)
RETURNS UUID AS $$
  SELECT id FROM users WHERE auth_user_id = p_auth_uid LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Check if user is admin of specific org
CREATE OR REPLACE FUNCTION user_is_org_admin(p_auth_uid UUID, p_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users u
    LEFT JOIN organization_members om ON om.user_id = u.id AND om.organization_id = p_org_id
    WHERE u.auth_user_id = p_auth_uid
    AND (
      (u.organization_id = p_org_id AND u.role IN ('owner', 'admin'))
      OR om.role IN ('owner', 'admin', 'consultant')
    )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### When to Use This Pattern
- Policy needs to check membership in a table that has RLS
- Policy references its own table in WHERE/USING clause
- Complex multi-table checks needed for authorization
- Error message contains "infinite recursion detected in policy"

### Files
- `supabase/migrations/019_fix_org_members_recursion.sql` - Example implementation

---

## RLS for Invited Users (v2.7.5)

### Viewing Data Before Membership
**Lesson**: Users accepting invitations need to see organization details before becoming members. Standard membership-based policies block this.

**Problem**: User receives invitation email, clicks to accept, but can't see organization name because:
1. They're not a member yet (haven't accepted)
2. RLS policy only allows viewing orgs you're a member of
3. Results in "Unknown Organization" in UI

**Solution**: Add a policy that allows viewing orgs via valid invitation:
```sql
CREATE POLICY "Users can view org for invitation" ON organizations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM invitations
      WHERE invitations.organization_id = organizations.id
      AND LOWER(invitations.email) = LOWER(auth.jwt() ->> 'email')
      AND invitations.expires_at > now()
    )
  );
```

**Security considerations**:
- Only works for user's own email (from JWT)
- Invitation must be valid (not expired)
- Read-only access (SELECT only)
- Once invitation expires, access revoked

### Email Case Sensitivity
**Lesson**: Always use case-insensitive email comparison in policies.

**Problem**: `auth.jwt() ->> 'email'` returns email as user entered it, which may not match case of invitation.

**Solution**: Use `LOWER()` on both sides:
```sql
AND LOWER(invitations.email) = LOWER(auth.jwt() ->> 'email')
```

### Files
- `supabase/migrations/020_allow_org_view_for_invites.sql` - Example implementation

---

## RPC Field Naming Conventions (v2.8.6)

### RPC Returns Different Field Names Than Table Columns
**Lesson**: Supabase RPC functions often alias columns to different names (e.g., `id` → `request_id`). Always check the RPC definition for actual return field names.

**Problem**: JavaScript code used `request.id` but the RPC function returned `request_id`:
```sql
-- RPC definition returns request_id, NOT id
CREATE OR REPLACE FUNCTION get_consultant_access_requests(p_auth_uid UUID)
RETURNS TABLE (
  request_id UUID,  -- Aliased from car.id
  organization_id UUID,
  ...
) AS $$
  SELECT
    car.id as request_id,  -- Alias here!
    ...
```

**Symptom**: Buttons with `data-id="${request.id}"` had `data-id="undefined"`, causing "invalid input syntax for type uuid" errors.

**Solution**: Check RPC definition and use correct field name:
```javascript
// WRONG - uses table column name
data-id="${request.id}"

// CORRECT - uses RPC return field name
data-id="${request.request_id}"
```

**Pattern**: When consuming RPC responses, always:
1. Check the RPC's `RETURNS TABLE (...)` definition
2. Note any column aliases (e.g., `car.id as request_id`)
3. Use the aliased names in JavaScript

---

## User Enumeration Prevention (v2.8.6)

### Password-Reset-Style Neutral Responses
**Lesson**: For security-sensitive email lookups, always return neutral success messages regardless of whether the email exists.

**Problem**: Revealing "email not found" or "not an admin" allows attackers to enumerate valid admin emails.

**Pattern** (similar to password reset flows):
```javascript
// Frontend - always show neutral message
this.showSuccessMessage();
// Message: "If this email is linked to an Admin account, they will receive an access request email."

// Backend - validate silently
if (!adminUser || adminUser.length === 0) {
  console.log('No user found'); // Log for debugging
  return successResponse();     // Same response as success
}
```

**Key insight**: Move validation logic to the backend (Cloudflare Worker) so the frontend can't distinguish between valid/invalid emails.

---

## Worker REST API Empty Response Handling (v2.8.6)

### Supabase PATCH Returns Empty on Success
**Lesson**: Supabase REST API returns empty body (204 No Content) for PATCH requests unless you request the result back.

**Problem**: `response.json()` on empty response throws `SyntaxError: Unexpected end of JSON input`.

**Solution**: Add `Prefer: return=representation` header OR handle empty responses:
```javascript
async function supabaseFetch(path, method = 'GET', body = null) {
  const options = {
    headers: {
      'Prefer': 'return=representation'  // Request updated record back
    }
  };

  const response = await fetch(url, options);

  // Handle empty responses
  const text = await response.text();
  if (!text) {
    return [];  // Success but no data
  }
  return JSON.parse(text);
}
```

---

## Querying Multiple User Sources (v2.8.6)

### Team Members from Multiple Tables
**Lesson**: Users can belong to an organization via different mechanisms that need to be queried separately.

**Problem**: `getTeamMembers()` only queried `users.organization_id` but partners are stored in `organization_members` table.

**Solution**: Query both sources and merge results:
```javascript
async getTeamMembers() {
  // 1. Get regular members (users with organization_id set)
  const { data: regularMembers } = await client
    .from('users')
    .select('*')
    .eq('organization_id', orgId);

  // 2. Get partners from organization_members
  const { data: partnerMembers } = await client
    .from('organization_members')
    .select('user_id, role, joined_at, users(id, name, email, ...)')
    .eq('organization_id', orgId)
    .in('role', ['consultant', 'partner']);

  // 3. Transform partners to match regular member format
  const transformedPartners = partnerMembers.map(pm => ({
    ...pm.users,
    role: 'partner',
    is_partner: true  // Flag for different handling
  }));

  // 4. Merge and deduplicate
  return [...regularMembers, ...uniquePartners];
}
```

**Key insight**: Add an `is_partner` flag so downstream code (delete handlers, UI rendering) can handle partners differently.

---

## Worker Endpoint Field Name Consistency (v2.8.6)

### Match Field Names Between Frontend and Worker
**Lesson**: When calling worker endpoints, field names in the request body must exactly match what the worker expects.

**Problem**: Frontend sent `partnerEmail` but worker expected `consultantEmail`:
```javascript
// Frontend sent:
body: { partnerEmail: email }

// Worker expected:
const { consultantEmail } = await request.json();
// consultantEmail was undefined!
```

**Solution**: Always check the worker endpoint code for expected field names:
```javascript
// Match exactly what worker expects
body: JSON.stringify({
  consultantEmail: request.consultant_email,  // Not partnerEmail
  consultantName: request.consultant_name,
  orgName: org?.name
})
```

---

*Last updated: December 2024*
