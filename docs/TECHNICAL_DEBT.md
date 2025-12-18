# Technical Debt & Future Improvements

This document tracks technical debt items, architectural improvements, and refactoring opportunities for RevGuide.

---

## High Priority

### 1. Server-Side Rule Evaluation

**Status:** Deferred
**Added:** December 2025
**Effort:** 8-12 hours
**Priority:** Medium (privacy/competitive positioning)

#### Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Chrome Extension                                             │
│                                                              │
│  content.js ──► background.js ──► api.hubapi.com            │
│       │              │                   │                   │
│       │              │         ◄─────────┘                   │
│       │              │         (all record properties)       │
│       ▼              ▼                                       │
│  rules-engine.js evaluates rules in browser                  │
│       │                                                      │
│       ▼                                                      │
│  Renders banners/plays                                       │
└─────────────────────────────────────────────────────────────┘
```

**Issue:** The Chrome extension directly fetches HubSpot CRM record properties to evaluate display rules. While we don't *store* this data, the extension *accesses* it.

**Privacy Policy Impact:** Current policy accurately states "we access but don't store." Competitor (Supered) claims "Chrome Extension does not ever access HubSpot CRM data."

#### Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Chrome Extension                                             │
│                                                              │
│  content.js ──► background.js ──► Supabase Edge Function    │
│       │              │                   │                   │
│       │              │                   ▼                   │
│       │              │           ┌───────────────┐           │
│       │              │           │ Edge Function │           │
│       │              │           │  1. Get rules │           │
│       │              │           │  2. Fetch HS  │──► HubSpot│
│       │              │           │  3. Evaluate  │           │
│       │              │           │  4. Return    │           │
│       │              │           │     matches   │           │
│       │              │           └───────────────┘           │
│       │              │                   │                   │
│       │              ◄───────────────────┘                   │
│       │         (only: banner IDs, play IDs to show)         │
│       ▼                                                      │
│  Renders banners/plays (no CRM data in extension)            │
└─────────────────────────────────────────────────────────────┘
```

**Benefit:** Extension receives only IDs of content to display, never sees CRM data.

#### Implementation Plan

| Task | Files Affected | Effort |
|------|----------------|--------|
| Create `evaluate-rules` edge function | `supabase/functions/evaluate-rules/index.ts` | 3-4 hours |
| Port rules-engine.js to TypeScript | New file in edge function | 1-2 hours |
| Modify content.js to call edge function | `content/content.js` | 1-2 hours |
| Remove direct HubSpot calls from background.js | `background/background.js` | 30 min |
| Testing & debugging | All | 2-3 hours |

#### Edge Function Pseudocode

```typescript
// supabase/functions/evaluate-rules/index.ts

interface EvaluateRequest {
  portalId: string;
  objectType: string;
  recordId: string;
  orgId: string;
}

interface EvaluateResponse {
  banners: string[];  // IDs of matching banners
  plays: string[];    // IDs of matching plays
}

export default async function handler(req: Request): Promise<Response> {
  const { portalId, objectType, recordId, orgId } = await req.json();

  // 1. Get OAuth token for this portal from hubspot_connections table
  const token = await getOAuthToken(portalId, orgId);

  // 2. Get rules for this org (banners, plays)
  const banners = await getBannersForOrg(orgId, objectType);
  const plays = await getPlaysForOrg(orgId, objectType);

  // 3. Extract only the properties needed for rule evaluation
  const neededProps = extractPropertiesFromRules([...banners, ...plays]);

  // 4. Fetch record with only needed properties
  const record = await fetchHubSpotRecord(token, objectType, recordId, neededProps);

  // 5. Evaluate rules (same logic as lib/rules-engine.js)
  const matchingBanners = evaluateRules(banners, record.properties);
  const matchingPlays = evaluateRules(plays, record.properties);

  // 6. Return only IDs - no CRM data leaves the server
  return new Response(JSON.stringify({
    banners: matchingBanners.map(b => b.id),
    plays: matchingPlays.map(p => p.id)
  }));
}
```

#### Trade-offs

| Factor | Client-Side (Current) | Server-Side (Proposed) |
|--------|----------------------|------------------------|
| Privacy claim | "We access but don't store" | "Extension never accesses CRM data" |
| Latency | Fast (direct API call) | Slower (+1 network hop) |
| Offline support | Works with cached data | Requires server connection |
| API rate limits | Uses user's HubSpot quota | Uses RevGuide's quota |
| Complexity | Simpler | More moving parts |
| Cost | No server cost | Edge function invocations |

#### Why Deferred

1. Current privacy policy is accurate and honest
2. No immediate customer complaints about privacy
3. Other features have higher priority
4. Implementation can happen later without breaking changes or data migration

#### When to Implement

- If privacy becomes a competitive differentiator
- If enterprise customers require "no CRM data access" for compliance
- If pursuing HubSpot Marketplace listing (may have stricter requirements)

---

## Medium Priority

### 2. Duplicate Trigger Word Validation

**Status:** Not Started
**Effort:** 2-3 hours

**Issue:** Users can save wiki entries with trigger words that already exist, causing unpredictable tooltip behavior.

**Solution:** Add validation in `admin/pages/wiki.js` to check for existing triggers before save, show warning dialog.

---

### 3. SPA Conversion for Admin Panel

**Status:** Not Started
**Effort:** 2-3 days

**Issue:** Each admin page is a full HTML page load, causing slower navigation and flash of unstyled content.

**Solution:** Convert to client-side routing with a single HTML shell, loading page content dynamically.

---

### 4. Bulk Entry Management

**Status:** Not Started
**Effort:** 1-2 days

**Issue:** No way to select multiple wiki/banner/play entries for bulk operations.

**Solution:** Add checkbox selection, bulk delete, bulk enable/disable.

---

## Low Priority

### 5. Test Coverage Expansion

**Status:** Ongoing
**Current:** 23 tests (conditions, storage)

**Gaps:**
- No tests for rules-engine.js
- No tests for content script modules
- No integration tests

---

### 6. Error Boundary Components

**Status:** Not Started

**Issue:** JavaScript errors can crash entire admin pages.

**Solution:** Add try/catch wrappers and error UI for graceful degradation.

---

## Completed

| Item | Completed | Notes |
|------|-----------|-------|
| Snake_case/camelCase mapping | v2.2.1 | Fixed data persistence bug |
| RLS policy circular dependencies | v2.1.2 | Added `get_user_organization_id()` |
| OAuth token encryption | v2.1.0 | Using pgcrypto |

---

## Adding New Items

When adding technical debt:

1. Add to appropriate priority section
2. Include: Status, Effort estimate, Issue description, Solution outline
3. If implementation plan exists, add detailed breakdown
4. Note any trade-offs or dependencies
