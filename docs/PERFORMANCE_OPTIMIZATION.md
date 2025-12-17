# Performance Optimization: Admin Page Loading

This document outlines the implementation plan for improving load times on `/banners`, `/plays`, and `/wiki` pages at app.revguide.io.

## Problem Statement

Users experience slow loading when navigating to `/banners`, `/plays`, and `/wiki` pages, particularly:
- On first visit or after cache expiry (5-10 minutes)
- When organizations have many entries
- After extended idle periods

## Root Cause Analysis

### Current Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Page Load                                                     │
│    - Load shared.js, supabase.js, hubspot.js, page-specific.js  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. checkAuth() - Sequential                                      │
│    Check session cache → If miss:                                │
│      → RevGuideAuth.getSession()                                 │
│      → RevGuideDB.getUserProfile()                               │
│        → Query users table                                       │
│        → Query organizations table                               │
│      → Cache result for 10 minutes                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. loadStorageData() - Blocked until auth completes              │
│    Check storage cache → If miss:                                │
│      → Promise.all([                                             │
│           RevGuideDB.getWikiEntries(),    // SELECT * WHERE org  │
│           RevGuideDB.getBanners(),        // SELECT * WHERE org  │
│           RevGuideDB.getPlays()           // SELECT * WHERE org  │
│         ])                                                        │
│      → Cache result for 5 minutes                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Page-specific init()                                          │
│    → Render UI with loaded data                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Identified Bottlenecks

| Bottleneck | Impact | Frequency |
|------------|--------|-----------|
| **Sequential auth → data loading** | Adds latency even when both could run in parallel | Every cold load |
| **No pagination** | Full table scans on every load | Every cold load |
| **Organization ID lookup** | Extra queries to resolve org context | Every cold load |
| **Short cache TTLs** | 5-10 minute caches mean frequent cold loads | Frequent |
| **No loading skeleton** | Blank screen during load | Every load |
| **Supabase cold start** | Initial connection establishment | First request after idle |

---

## Implementation Plan

### Phase 1: Loading Skeletons (Quick Win)

**Goal:** Improve perceived performance by showing UI structure immediately.

**Files to modify:**
- `admin/pages/banners.html`
- `admin/pages/plays.html`
- `admin/pages/wiki.html`
- `admin/shared.css`

**Implementation:**

1. Add skeleton HTML that displays immediately (no JS required):

```html
<!-- Example for banners.html -->
<div class="content-area">
  <div class="skeleton-container" id="loadingSkeleton">
    <div class="skeleton-header"></div>
    <div class="skeleton-table">
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
    </div>
  </div>
  <div class="actual-content" id="actualContent" style="display: none;">
    <!-- Existing content -->
  </div>
</div>
```

2. Add skeleton CSS:

```css
/* admin/shared.css */
.skeleton-container {
  padding: var(--space-6);
}

.skeleton-header,
.skeleton-row {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s infinite;
  border-radius: var(--radius-md);
}

.skeleton-header {
  height: 32px;
  width: 200px;
  margin-bottom: var(--space-4);
}

.skeleton-row {
  height: 48px;
  margin-bottom: var(--space-2);
}

@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

3. Swap skeleton for content when data loads:

```javascript
// In page init()
function showContent() {
  document.getElementById('loadingSkeleton').style.display = 'none';
  document.getElementById('actualContent').style.display = 'block';
}
```

**Estimated complexity:** Low
**Impact:** High (perceived performance)

---

### Phase 2: Persistent Organization ID

**Goal:** Eliminate repeated user profile queries for organization context.

**Files to modify:**
- `admin/supabase.js`
- `admin/shared.js`

**Current implementation:**
```javascript
// admin/supabase.js - getOrganizationId()
// Checks sessionStorage, then calls getUserProfile() which queries users + orgs
```

**New implementation:**

1. Store org ID in localStorage with longer TTL:

```javascript
// admin/supabase.js
const ORG_ID_STORAGE_KEY = 'revguide_org_id';
const ORG_ID_TTL = 24 * 60 * 60 * 1000; // 24 hours

async getOrganizationId() {
  // Check localStorage first (persists across sessions)
  const cached = localStorage.getItem(ORG_ID_STORAGE_KEY);
  if (cached) {
    const { orgId, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < ORG_ID_TTL) {
      return orgId;
    }
  }

  // Fall back to session cache, then API
  // ... existing logic ...

  // Store in localStorage on success
  localStorage.setItem(ORG_ID_STORAGE_KEY, JSON.stringify({
    orgId: result,
    timestamp: Date.now()
  }));

  return result;
}
```

2. Clear on logout:

```javascript
// admin/shared.js - logout()
function clearAllCaches() {
  sessionStorage.removeItem('revguide_user_cache');
  sessionStorage.removeItem('revguide_storage_cache');
  localStorage.removeItem('revguide_org_id'); // Add this
}
```

**Estimated complexity:** Low
**Impact:** Medium (eliminates 2 queries on most loads)

---

### Phase 3: Pagination

**Goal:** Limit initial data load to improve response times.

**Files to modify:**
- `admin/supabase.js`
- `admin/pages/banners.js`
- `admin/pages/plays.js`
- `admin/pages/wiki.js`
- `admin/shared.js`

**Database considerations:**
- Ensure indexes exist on `organization_id` columns
- Add composite indexes for common query patterns

**Implementation:**

1. Update Supabase queries:

```javascript
// admin/supabase.js
async getBanners(options = {}) {
  const { page = 1, limit = 50, search = '' } = options;
  const offset = (page - 1) * limit;

  let query = supabase
    .from('banners')
    .select('*', { count: 'exact' }) // Get total count
    .eq('organization_id', orgId)
    .order('priority', { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    query = query.or(`name.ilike.%${search}%,title.ilike.%${search}%`);
  }

  const { data, error, count } = await query;
  return { data, error, total: count };
}
```

2. Add pagination UI component:

```javascript
// admin/shared.js
AdminShared.renderPagination = function(containerId, currentPage, totalItems, limit, onPageChange) {
  const totalPages = Math.ceil(totalItems / limit);
  const container = document.getElementById(containerId);

  container.innerHTML = `
    <div class="pagination">
      <button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''}
              onclick="window.paginationCallback(${currentPage - 1})">
        Previous
      </button>
      <span class="pagination-info">Page ${currentPage} of ${totalPages}</span>
      <button class="pagination-btn" ${currentPage >= totalPages ? 'disabled' : ''}
              onclick="window.paginationCallback(${currentPage + 1})">
        Next
      </button>
    </div>
  `;

  window.paginationCallback = onPageChange;
};
```

3. Update page components to use pagination:

```javascript
// admin/pages/banners.js
const BannersPage = {
  currentPage: 1,
  pageSize: 50,
  totalItems: 0,

  async loadBanners(page = 1) {
    const { data, total } = await RevGuideDB.getBanners({
      page,
      limit: this.pageSize
    });

    this.rules = data;
    this.totalItems = total;
    this.currentPage = page;

    this.renderRules();
    AdminShared.renderPagination(
      'bannersPagination',
      this.currentPage,
      this.totalItems,
      this.pageSize,
      (newPage) => this.loadBanners(newPage)
    );
  }
};
```

**Estimated complexity:** Medium
**Impact:** High for large datasets

---

### Phase 4: Parallel Auth + Data Loading

**Goal:** Load auth and data concurrently where possible.

**Files to modify:**
- `admin/shared.js`

**Current flow:**
```javascript
// Sequential - data loading waits for auth
await checkAuth();
const data = await loadStorageData();
```

**New flow:**

```javascript
// admin/shared.js
async function initializePage(pageInitCallback) {
  // Start both in parallel
  const authPromise = checkAuth();
  const dataPromise = loadStorageDataOptimistic();

  // Wait for auth (required for sidebar)
  const authResult = await authPromise;
  if (!authResult.authenticated) {
    window.location.href = '/login';
    return;
  }

  // Render sidebar immediately
  renderSidebar(authResult.user);

  // Wait for data
  const data = await dataPromise;

  // Initialize page with data
  pageInitCallback(data);
}

async function loadStorageDataOptimistic() {
  // Try to load from cache first (doesn't need org ID)
  const cached = getStorageCache();
  if (cached) return cached;

  // Otherwise, wait for org ID (which may need auth)
  const orgId = await RevGuideDB.getOrganizationId();
  return fetchStorageData(orgId);
}
```

**Complexity:** Medium
**Impact:** Medium (saves ~200-500ms on cold loads)

---

### Phase 5: Stale-While-Revalidate Caching

**Goal:** Show cached data immediately while fetching fresh data in background.

**Files to modify:**
- `admin/shared.js`

**Implementation:**

```javascript
// admin/shared.js
const STALE_CACHE_MAX_AGE = 30 * 60 * 1000; // 30 minutes (stale but usable)
const FRESH_CACHE_MAX_AGE = 5 * 60 * 1000;  // 5 minutes (fresh)

async function loadStorageData(options = {}) {
  const { forceRefresh = false } = options;
  const cacheKey = 'revguide_storage_cache';

  // Check cache
  const cached = sessionStorage.getItem(cacheKey);
  if (cached && !forceRefresh) {
    const { data, timestamp } = JSON.parse(cached);
    const age = Date.now() - timestamp;

    // Fresh cache: return immediately
    if (age < FRESH_CACHE_MAX_AGE) {
      return data;
    }

    // Stale cache: return immediately, but refresh in background
    if (age < STALE_CACHE_MAX_AGE) {
      // Fire-and-forget background refresh
      refreshStorageDataInBackground().catch(console.error);
      return data;
    }
  }

  // Cache miss or expired: fetch fresh data
  return await fetchAndCacheStorageData();
}

async function refreshStorageDataInBackground() {
  const freshData = await fetchStorageData();
  cacheStorageData(freshData);

  // Optionally notify page of new data
  window.dispatchEvent(new CustomEvent('revguide:data-refreshed', {
    detail: freshData
  }));
}
```

**Complexity:** Medium
**Impact:** High (near-instant loads for returning users)

---

### Phase 6: Database Indexing (Supabase)

**Goal:** Ensure database queries are optimized.

**SQL migrations to add:**

```sql
-- migrations/004_add_performance_indexes.sql

-- Ensure organization_id indexes exist (may already exist from RLS)
CREATE INDEX IF NOT EXISTS idx_banners_org_id ON banners(organization_id);
CREATE INDEX IF NOT EXISTS idx_plays_org_id ON plays(organization_id);
CREATE INDEX IF NOT EXISTS idx_wiki_entries_org_id ON wiki_entries(organization_id);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_banners_org_priority
  ON banners(organization_id, priority DESC);

CREATE INDEX IF NOT EXISTS idx_plays_org_name
  ON plays(organization_id, name);

CREATE INDEX IF NOT EXISTS idx_wiki_entries_org_title
  ON wiki_entries(organization_id, title);

-- Index for user profile lookups
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id
  ON users(auth_user_id);
```

**Verification query:**

```sql
-- Check existing indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('banners', 'plays', 'wiki_entries', 'users');

-- Check query performance
EXPLAIN ANALYZE
SELECT * FROM banners
WHERE organization_id = 'your-org-id'
ORDER BY priority DESC;
```

**Complexity:** Low
**Impact:** Variable (depends on current indexing state)

---

## Implementation Order

| Priority | Phase | Effort | Impact | Dependencies |
|----------|-------|--------|--------|--------------|
| 1 | Phase 1: Loading Skeletons | Low | High | None |
| 2 | Phase 2: Persistent Org ID | Low | Medium | None |
| 3 | Phase 6: Database Indexes | Low | Variable | Supabase access |
| 4 | Phase 5: Stale-While-Revalidate | Medium | High | None |
| 5 | Phase 4: Parallel Loading | Medium | Medium | Phase 2 |
| 6 | Phase 3: Pagination | Medium | High* | UI changes |

*Pagination has high impact only for organizations with 50+ entries per table.

---

## Success Metrics

### Before Optimization
- Measure and document current load times:
  - [ ] Cold load (no cache): ___ms
  - [ ] Warm load (with cache): ___ms
  - [ ] Time to first render: ___ms

### Target Performance
| Metric | Current | Target |
|--------|---------|--------|
| Cold load (skeleton visible) | TBD | < 200ms |
| Cold load (data rendered) | TBD | < 1500ms |
| Warm load (cached data) | TBD | < 100ms |
| Time to interactive | TBD | < 2000ms |

### Measurement Approach

1. Add performance logging:

```javascript
// admin/shared.js
const perfMarks = {};

function perfStart(name) {
  perfMarks[name] = performance.now();
}

function perfEnd(name) {
  const duration = performance.now() - perfMarks[name];
  console.log(`[Perf] ${name}: ${duration.toFixed(2)}ms`);

  // Optional: send to analytics
  if (window.gtag) {
    gtag('event', 'timing_complete', {
      name: name,
      value: Math.round(duration)
    });
  }
}

// Usage
perfStart('pageLoad');
// ... loading logic ...
perfEnd('pageLoad');
```

2. Test with simulated slow network (Chrome DevTools → Network → Slow 3G)

3. Test with large datasets (100+ entries per table)

---

## Rollback Plan

Each phase is independent and can be rolled back individually:

1. **Skeletons:** Remove skeleton HTML/CSS, restore original structure
2. **Persistent Org ID:** Revert to sessionStorage-only caching
3. **Pagination:** Revert API calls to non-paginated versions
4. **Parallel Loading:** Restore sequential auth → data flow
5. **Stale-While-Revalidate:** Restore simple cache-or-fetch logic
6. **Database Indexes:** `DROP INDEX` commands (indexes don't affect correctness)

---

## Testing Checklist

Before deploying each phase:

- [ ] Test in Chrome extension context
- [ ] Test in web app context (app.revguide.io)
- [ ] Test with empty organization (new user)
- [ ] Test with populated organization (existing user)
- [ ] Test cache invalidation on save/update/delete
- [ ] Test logout clears appropriate caches
- [ ] Test multiple browser tabs don't conflict
- [ ] Verify no console errors
- [ ] Verify data integrity (compare with Supabase dashboard)

---

## Related Documentation

- `docs/ARCHITECTURE.md` - Overall system architecture
- `admin/shared.js` - Caching implementation details
- `admin/supabase.js` - Database client implementation
- `supabase/migrations/` - Database schema
