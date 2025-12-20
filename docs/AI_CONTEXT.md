# RevGuide - AI Context Reference

Quick reference for AI assistants working on this codebase. For detailed documentation, see linked files.

---

## Project Overview

**RevGuide** is a Chrome extension + SaaS web app that displays contextual guidance (banners, plays/battle cards, wiki tooltips) on HubSpot CRM pages based on property-based rules.

- **Extension**: Chrome Manifest V3
- **Web App**: app.revguide.io (admin panel)
- **Backend**: Supabase (database + edge functions)
- **Email**: Cloudflare Workers (invitations)

---

## Directory Structure

```
plugin/
├── manifest.json          # Extension manifest (v3)
├── package.json           # Build dependencies
│
├── admin/                 # Admin panel (web + extension popup)
│   ├── admin.js           # Main admin controller
│   ├── shared.js          # Shared utilities
│   ├── supabase.js        # Database client (RevGuideAuth, RevGuideDB)
│   ├── hubspot.js         # HubSpot OAuth client
│   ├── nango.js           # Legacy OAuth (still used in home.js)
│   └── pages/             # Multi-page admin UI
│       ├── home.js        # Dashboard
│       ├── banners.js     # Banner CRUD
│       ├── plays.js       # Battle cards CRUD
│       ├── wiki.js        # Wiki glossary CRUD
│       ├── libraries.js   # Content library browser
│       ├── settings.js    # Settings & team management
│       ├── partner.js     # Managed Accounts page (v2.8.0+)
│       ├── partner-home.js # Partner Home page (v2.8.2+)
│       └── login.js       # Web authentication
│
├── background/
│   └── background.js      # Service worker (API proxy, message routing)
│
├── content/               # Content scripts (injected into HubSpot)
│   ├── content.js         # Main orchestrator
│   ├── content.css        # Injection styles
│   └── modules/
│       ├── banners.js     # Banner rendering
│       ├── wiki.js        # Wiki tooltips
│       ├── sidepanel.js   # FAB button & sidepanel
│       └── presentations.js # Media embeds (Google Slides, etc.)
│
├── sidepanel/
│   └── sidepanel.js       # Chrome side panel UI
│
├── lib/                   # Shared libraries
│   ├── rules-engine.js    # Condition evaluation (RevGuideRulesEngine)
│   ├── storage.js         # Chrome storage wrapper (StorageManager)
│   ├── wiki-cache.js      # Wiki term caching (RevGuideWikiCache)
│   └── icons.js           # SVG icon definitions
│
├── styles/                # Shared CSS
│   ├── base.css
│   ├── components.css
│   └── icons.css
│
├── supabase/
│   ├── functions/         # Edge functions
│   │   └── hubspot-oauth/ # OAuth token exchange
│   └── migrations/        # Database schema
│
├── api/
│   └── invite-worker.js   # Cloudflare Worker for email invitations
│
├── website/               # Marketing site (revguide.io)
│
├── scripts/
│   └── build.js           # Minification build script
│
├── tests/                 # Test files
│
└── docs/                  # Documentation
```

---

## Key Global Objects

| Object | File | Purpose |
|--------|------|---------|
| `RevGuideAuth` | admin/supabase.js | Supabase auth wrapper |
| `RevGuideDB` | admin/supabase.js | Database operations |
| `RevGuideHubSpot` | admin/hubspot.js | HubSpot OAuth |
| `RevGuideNango` | admin/nango.js | Legacy OAuth (still used) |
| `RevGuideRulesEngine` | lib/rules-engine.js | Condition evaluation |
| `RevGuideWikiCache` | lib/wiki-cache.js | Wiki term caching |
| `StorageManager` | lib/storage.js | Chrome storage wrapper |
| `AdminPanel` | admin/admin.js | Admin UI controller |
| `AdminShared` | admin/shared.js | Shared admin utilities |

---

## Data Flow

```
HubSpot Page Load
    ↓
content.js detects page type (record vs index)
    ↓
background.js fetches data from Supabase
    ↓
content.js extracts page properties from DOM
    ↓
RulesEngine evaluates conditions
    ↓
Modules render matching content:
├── banners.js → Banners
├── wiki.js → Tooltips
├── sidepanel.js → FAB button
└── presentations.js → Media embeds
```

---

## Terminology Mapping

The codebase uses mixed terminology due to evolution:

| UI Label | Code Variable | Database Table | Notes |
|----------|---------------|----------------|-------|
| Plays | `battleCards` | `plays` | Sales/battle cards |
| Banners | `rules`, `banners` | `banners` | Conditional banners |
| Wiki | `wikiEntries` | `wiki_entries` | Field glossary |
| Media Embeds | `presentations` | (via banners) | Part of banner system |

---

## Authentication

**Dual context:**
- **Web app** (app.revguide.io): Supabase JWT auth
- **Extension**: Chrome storage + message passing to background.js

**Account Types (v2.8.0+):**
- `standard` - Regular users (owner, admin, editor, viewer roles)
- `partner` - Agency/freelancer accounts with dedicated Partner Dashboard

**Roles:** Owner > Admin > Editor > Viewer > Partner (external access to client orgs)

**HubSpot OAuth:** Direct integration via `admin/hubspot.js` (replaced Nango in v2.1.0, but `nango.js` still referenced in `home.js`)

See: [AUTHENTICATION.md](AUTHENTICATION.md)

---

## Multi-Portal & Partner Accounts (v2.7.0+, v2.8.0+)

**For agencies/consultants managing multiple HubSpot portals:**

- Users can belong to multiple organizations via `organization_members` table
- `active_organization_id` tracks which portal is currently active
- Portal selector dropdown appears in sidebar when user has 2+ portals
- **Import/Export** (v2.7.2+): JSON export from one portal, import to another with Replace All or Merge mode

**Partner Account System (v2.8.0+, v2.8.2+):**
- `account_type` column: `'standard'` or `'partner'`
- `home_organization_id` tracks partner's agency org
- Partner Home (`/partner-home`) - 3-step onboarding for partners (v2.8.2+)
- Managed Accounts (`/managed-accounts`) - dedicated UI for client management (renamed from `/partner`)
- Sidebar dropdown: Partner → Home, Managed Accounts
- Partners have `partner` role in client orgs (distinct from legacy `consultant`)
- Admins can invite partners or convert their account to partner

**Key tables:**
- `organization_members` - Many-to-many user↔org with per-org roles
- `consultant_libraries` - Reusable content packages
- `library_installations` - Track installed libraries per org

**Key functions (RevGuideDB):**
- `getUserOrganizations()` - Get all portals user can access
- `switchOrganization(orgId)` - Switch active portal
- `isConsultant()` - Check consultant privileges (includes partners)
- `isPartner()` - Check if user is a partner (v2.8.0+)
- `getPartnerClients()` - Get client portals for partner (v2.8.0+)
- `getPartnerStats()` - Get dashboard stats for partner (v2.8.0+)
- `convertToPartner(agencyName)` - Convert admin to partner (v2.8.0+)

**Partner Signup Paths:**
1. **Invited by client**: Accept invitation → `/signup?token=xxx&role=partner` → Creates partner account + joins client org → Redirects to `/partner-home`
2. **Convert existing**: Settings → "Become a Partner" → Creates agency org, updates account_type
3. **New signup**: Settings → "Sign Up with a New Account" → Signs out → `/signup?new_partner=true` → Fresh partner account → Redirects to `/partner-home`

**Role helpers (AdminShared) - v2.7.3+:**
- `getEffectiveRole()` - Returns org-specific role from `organization_members`, falls back to `currentUser.role`
- `isAdmin()`, `isMember()`, `canEditContent()` - All use `getEffectiveRole()` for per-org permissions

**Import/Export (AdminShared):**
- `saveStorageData(data, {importMode})` - Bulk insert with 'replace' or 'merge' mode
- `sanitizeImportData(data)` - XSS protection via DOMPurify

See: [MULTI_PORTAL_DEV.md](MULTI_PORTAL_DEV.md)

---

## Build System

```bash
npm install              # Install dependencies
npm run build            # Production build (minified → dist/)
npm run build:dev        # Development build (unminified)
npm run package          # Build + create revguide-extension.zip
```

Build script: `scripts/build.js`
- Minifies JS (Terser) and CSS (CleanCSS)
- Excludes: docs, tests, backups, website, supabase, api

---

## Database (Supabase)

**Key tables:**
- `organizations` - Multi-tenant orgs
- `users` - Team members (role-based, with `active_organization_id` for portal switching)
- `organization_members` - Many-to-many user↔org with per-org roles (v2.7.0+)
- `banners` - Banner rules
- `plays` - Battle cards
- `wiki_entries` - Wiki glossary
- `hubspot_connections` - OAuth tokens (encrypted)
- `consultant_libraries` - Reusable content packages (v2.7.0+)
- `library_installations` - Track installed libraries per org (v2.7.0+)

**RLS:** Row-level security enforced for all tables.

See: [SUPERADMIN_BACKEND.md](SUPERADMIN_BACKEND.md)

---

## HubSpot DOM Targeting

**Critical patterns:**
- URL: Always `/contacts/PORTAL_ID/record/OBJECT_TYPE_ID/RECORD_ID`
- Object types: `0-1`=Contact, `0-2`=Company, `0-3`=Deal, `0-5`=Ticket
- Scroll container: `querySelector('[class*="ScrollContainer"]')`
- Table headers: Target `[data-test-id*="truncated-object-label"]`, NOT `<th>`

See: [HUBSPOT_DOM.md](HUBSPOT_DOM.md)

---

## Common Tasks

### Add a new admin page
1. Create `admin/pages/newpage.html`, `.js`, `.css`
2. Add route in `admin/admin.js`
3. Add nav item in admin HTML

### Add a new banner type
1. Update `lib/rules-engine.js` with new operators
2. Update `content/modules/banners.js` for rendering
3. Update `admin/pages/banners.js` for UI

### Add wiki support to new HubSpot area
1. Add selectors in `content/modules/wiki.js`
2. Test with MutationObserver for lazy-loaded content
3. See [HUBSPOT_DOM.md](HUBSPOT_DOM.md) for selector patterns

---

## Known Issues / Tech Debt

1. **nango.js still used** - `home.js:322` calls `RevGuideNango` despite OAuth migration
2. **Terminology inconsistency** - "plays" vs "battleCards" vs "presentations"
3. **CSS @import warnings** - Build shows warnings for CSS imports (non-blocking)

See: [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md)

---

## Quick Links

| Topic | File |
|-------|------|
| Installation | [INSTALL.md](INSTALL.md) |
| Architecture | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Authentication | [AUTHENTICATION.md](AUTHENTICATION.md) |
| HubSpot DOM | [HUBSPOT_DOM.md](HUBSPOT_DOM.md) |
| Deployment | [DEPLOYMENT.md](DEPLOYMENT.md) |
| Performance | [PERFORMANCE_OPTIMIZATION.md](PERFORMANCE_OPTIMIZATION.md) |
| Lessons Learned | [LEARNINGS.md](LEARNINGS.md) |
| Tech Debt | [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md) |
| Roadmap | [../ROADMAP.md](../ROADMAP.md) |
| Changelog | [../CHANGELOG.md](../CHANGELOG.md) |

---

*Last updated: December 2024 (v2.8.2)*
