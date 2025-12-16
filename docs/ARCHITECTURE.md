# RevGuide Information Architecture

This document provides a comprehensive overview of the RevGuide codebase structure, explaining where everything is and what each component does.

## Project Overview

RevGuide is a dual-platform solution:
1. **Chrome Extension** - Injects contextual guidance into HubSpot CRM
2. **SaaS Web App** - Admin panel hosted at app.revguide.io

Both share the same codebase, with context detection determining which storage/auth backend to use.

## Directory Structure

```
plugin/
├── admin/                    # Admin panel (shared between web & extension)
│   ├── pages/               # Multi-page admin architecture
│   │   ├── home.html/js/css      # Dashboard with onboarding
│   │   ├── banners.html/js/css   # Banner management
│   │   ├── plays.html/js/css     # Plays/battle cards
│   │   ├── wiki.html/js/css      # Wiki glossary
│   │   ├── libraries.html/js/css # Content library browser
│   │   ├── settings.html/js      # Settings & team management
│   │   ├── login.html            # Web app login (Supabase)
│   │   └── signup.html           # Web app signup
│   ├── shared.js            # Common utilities (AdminShared)
│   ├── shared.css           # Design system & components
│   ├── supabase.js          # Supabase client (RevGuideAuth, RevGuideDB)
│   └── hubspot.js           # HubSpot OAuth client (RevGuideHubSpot)
│
├── background/              # Extension background script
│   └── background.js        # Service worker, message handling, API calls
│
├── content/                 # Content scripts (injected into HubSpot)
│   ├── content.js           # Main orchestrator
│   ├── content.css          # Injected styles
│   └── modules/             # Feature modules
│       ├── banners.js       # Banner rendering
│       ├── wiki.js          # Wiki tooltips
│       ├── sidepanel.js     # FAB and sidepanel triggers
│       └── presentations.js # Media embed cards
│
├── sidepanel/               # Chrome side panel
│   ├── sidepanel.html       # Panel structure
│   ├── sidepanel.js         # Panel logic
│   └── sidepanel.css        # Panel styles
│
├── supabase/                # Supabase backend
│   ├── functions/           # Edge functions
│   │   └── hubspot-oauth/   # HubSpot OAuth handler
│   │       └── index.ts
│   └── migrations/          # Database migrations
│       ├── 001_add_hubspot_connection.sql
│       ├── 002_direct_hubspot_oauth.sql
│       └── 003_fix_rls_policies.sql
│
├── api/                     # Cloudflare Worker
│   ├── invite-worker.js     # Email invitation API
│   ├── wrangler.toml        # Worker config
│   └── README.md            # API documentation
│
├── content-library/         # Pre-built content packs
│   ├── packs/               # JSON pack files
│   └── manifest.json        # Pack index
│
├── tests/                   # Test suite
│   ├── setup.js             # Test runner & mocks
│   ├── conditions.test.js   # Condition engine tests
│   ├── storage.test.js      # Storage tests
│   └── run-tests.js         # Test runner script
│
├── icons/                   # Extension icons
├── lib/                     # Shared libraries
├── docs/                    # Documentation
│
├── manifest.json            # Chrome extension manifest
├── vercel.json              # Vercel deployment config
├── .env.example             # Environment variable template
└── .github/workflows/       # CI/CD pipelines
    ├── ci.yml               # Main CI pipeline
    └── release.yml          # Release automation
```

## Core Components

### 1. Admin Panel (`admin/`)

The admin panel is the main interface for managing RevGuide content.

| File | Purpose |
|------|---------|
| `shared.js` | `AdminShared` global with utilities: auth, storage, toasts, condition builder, rich text editor |
| `shared.css` | Design system: CSS variables, component styles, layout classes |
| `supabase.js` | `RevGuideAuth` (auth) and `RevGuideDB` (database) clients |
| `hubspot.js` | `RevGuideHubSpot` client for OAuth flow |

**Context Detection:**
```javascript
const isExtensionContext = typeof chrome !== 'undefined' && chrome.storage;
// Extension: uses chrome.storage.local
// Web: uses Supabase
```

### 2. Content Scripts (`content/`)

Injected into HubSpot pages to display contextual content.

| Module | Purpose |
|--------|---------|
| `content.js` | Orchestrator - initializes modules, handles URL changes, coordinates rendering |
| `banners.js` | Renders alert banners at top of record pages |
| `wiki.js` | TreeWalker-based text scanner, renders tooltips on property labels |
| `sidepanel.js` | FAB button, triggers side panel opening |
| `presentations.js` | Embedded media cards (YouTube, Loom, etc.) |

**Module Interface:**
```javascript
class Module {
  constructor(helper) { }  // Reference to orchestrator
  apply(data) { }          // Render content
  remove() { }             // Cleanup
}
```

### 3. Background Script (`background/`)

Service worker handling:
- Extension icon clicks → opens side panel
- Message routing between content script, side panel, admin
- HubSpot API proxy (for extension context)
- Invite email sending (via Cloudflare Worker)

### 4. Side Panel (`sidepanel/`)

Chrome's native side panel showing:
- **Plays tab**: Contextual battle cards for current record
- **Settings tab**: Quick toggles and configuration

### 5. Supabase Backend (`supabase/`)

**Database Tables:**
| Table | Purpose |
|-------|---------|
| `organizations` | Teams/workspaces |
| `users` | User profiles linked to auth.users |
| `hubspot_connections` | OAuth tokens (encrypted) |
| `oauth_states` | CSRF protection for OAuth |
| `invitations` | Pending team invites |
| `banners` | Banner configurations |
| `plays` | Play/battle card configurations |
| `wiki_entries` | Wiki glossary entries |

**Edge Functions:**
- `hubspot-oauth` - Handles OAuth flow: `/authorize`, `/callback`, `/connection`, `/disconnect`, `/proxy`

### 6. Cloudflare Worker (`api/`)

Single worker handling team invitation emails via Resend SMTP.
- Endpoint: `https://revguide-api.revguide.workers.dev/api/invite`

## Data Flow

### Extension Context
```
HubSpot Page → content.js → chrome.storage.local
                    ↓
              sidepanel.js ← chrome.runtime.sendMessage → background.js
                    ↓                                          ↓
              admin pages                              HubSpot API (proxy)
```

### Web App Context
```
app.revguide.io → admin pages → Supabase (via RevGuideDB)
                       ↓
                 RevGuideHubSpot → Edge Function → HubSpot OAuth
```

## Key Files Reference

### Configuration Files

| File | Purpose |
|------|---------|
| `manifest.json` | Chrome extension configuration |
| `vercel.json` | Vercel URL rewrites and headers |
| `.env.example` | Environment variable template |
| `wrangler.toml` | Cloudflare Worker config |

### Documentation

| File | Purpose |
|------|---------|
| `README.md` | Project overview |
| `CHANGELOG.md` | Version history |
| `ROADMAP.md` | Feature roadmap |
| `LEARNINGS.md` | Development patterns and gotchas |
| `INSTALL.md` | Installation guide |
| `docs/DEPLOYMENT.md` | Production deployment guide |
| `docs/ARCHITECTURE.md` | This document |
| `docs/PRIVACY_POLICY.md` | Privacy policy |
| `docs/CHROME_WEB_STORE.md` | Store submission guide |
| `docs/BETA_PROGRAM.md` | Beta tester documentation |
| `docs/ERROR_MONITORING.md` | Sentry setup guide |

### HubSpot-Specific

| File | Purpose |
|------|---------|
| `HUBSPOT_DOM_STRUCTURE.md` | HubSpot page DOM patterns |
| `docs/HUBSPOT_DOM.md` | Detailed DOM reference |

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Vanilla JS, CSS (no frameworks) |
| **Extension** | Chrome Manifest V3 |
| **Database** | Supabase (PostgreSQL) |
| **Auth** | Supabase Auth (Magic Link, Google OAuth) |
| **Edge Functions** | Deno (Supabase Functions) |
| **Email** | Resend SMTP |
| **Worker** | Cloudflare Workers |
| **Hosting** | Vercel |
| **CI/CD** | GitHub Actions |

## Design System

Defined in `admin/shared.css`:

**Colors:**
- Primary: `#b2ef63` (lime green)
- Primary Dark: `#1a2e05`
- Surface: `#ffffff`
- Text: `#111827` / `#6b7280`

**Typography:**
- Font: Manrope
- Sizes: 12px (xs) → 24px (2xl)

**Spacing:**
- Scale: 4px base (space-1 → space-12)

**Components:**
- Buttons (`.btn`, `.btn-primary`, `.btn-secondary`)
- Cards (`.settings-card`, `.stat-card`)
- Tables (`.data-table`)
- Modals (`.modal`)
- Toasts (`.toast`)
- Tabs (`.tab-nav`)

## Storage Keys

### Chrome Storage (Extension)
```javascript
{
  rules: [],           // Banners
  battleCards: [],     // Plays
  presentations: [],   // Media embeds
  wikiEntries: [],     // Wiki glossary
  settings: {},        // User preferences
  invitedUsers: [],    // Team invites (legacy)
  wikiTermMapCache: {},    // Pre-built term map
  wikiEntriesById: {},     // Entry lookup by ID
  wikiCacheVersion: 0      // Cache invalidation
}
```

### Supabase Tables (Web App)
- Same data structure, stored per-organization
- Row Level Security ensures data isolation

## Environment Variables

See `.env.example` for complete list:

| Variable | Used By | Purpose |
|----------|---------|---------|
| `SUPABASE_URL` | Web app, Edge functions | Database URL |
| `SUPABASE_ANON_KEY` | Web app | Public API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge functions | Admin API key |
| `HUBSPOT_CLIENT_ID` | Edge functions | OAuth app ID |
| `HUBSPOT_CLIENT_SECRET` | Edge functions | OAuth secret |
| `TOKEN_ENCRYPTION_KEY` | Edge functions | Token encryption |
| `RESEND_API_KEY` | Cloudflare Worker | Email API |

## Build & Deploy

**Local Development:**
```bash
# Load extension in Chrome
chrome://extensions → Load unpacked → Select plugin folder

# Run tests
node tests/run-tests.js
```

**Production Deploy:**
```bash
# Supabase edge functions
supabase functions deploy hubspot-oauth

# Cloudflare worker
cd api && wrangler deploy

# Vercel (automatic via GitHub)
git push origin main
```

## Version History

Current: **v2.2.0** (December 2024) - Beta Release

See `CHANGELOG.md` for full history.
