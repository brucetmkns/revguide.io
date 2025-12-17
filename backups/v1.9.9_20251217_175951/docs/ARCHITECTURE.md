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
│   │   ├── login.html/js         # Web app login (Supabase)
│   │   ├── signup.html           # Web app signup
│   │   ├── invite.html/js        # Invitation acceptance page
│   │   ├── onboarding.html/js    # New user onboarding
│   │   └── extension-logged-in.html/js  # Extension auth callback
│   ├── lib/                 # Bundled third-party libraries
│   │   └── supabase.min.js  # Supabase JS v2 (local for CSP compliance)
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
| `lib/supabase.min.js` | Bundled Supabase JS library (CSP compliance for extensions) |

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
- **External message listener** for web app authentication bridge
- Auth state management (token storage, session validation)
- Supabase REST API client for cloud content fetching
- HubSpot API proxy (for extension context)
- Invite email sending (via Cloudflare Worker)

### 4. Side Panel (`sidepanel/`)

Chrome's native side panel with auth-aware UI:
- **Logged out state**: Shows "Sign In Required" with login button
- **Logged in state**: Shows user email and Sign Out button
- **Plays tab**: Contextual battle cards for current record
- **Settings tab**: Quick toggles, auth status, admin panel link

### 5. Supabase Backend (`supabase/`)

**Database Tables:**
| Table | Purpose |
|-------|---------|
| `organizations` | Teams/workspaces |
| `users` | User profiles linked to auth.users |
| `hubspot_connections` | OAuth tokens (encrypted) |
| `oauth_states` | CSRF protection for OAuth |
| `invitations` | Pending team invites with tokens |
| `banners` | Banner configurations |
| `plays` | Play/battle card configurations |
| `wiki_entries` | Wiki glossary entries |

**Edge Functions:**
- `hubspot-oauth` - Handles OAuth flow: `/authorize`, `/callback`, `/connection`, `/disconnect`, `/proxy`

### 6. Cloudflare Worker (`api/`)

Single worker handling team invitation emails via Resend SMTP.
- Endpoint: `https://revguide-api.revguide.workers.dev/api/invite`

## Team Invitation System

RevGuide supports two methods for adding users to organizations:

### Method 1: Token Link (Direct Accept)
```
Admin sends invitation → User receives email with token link
    ↓
User clicks link → /invite?token=xxx
    ↓
If logged in → Shows invitation details → Accept/Decline
If not logged in → Redirects to login → Returns to invite page
    ↓
Accept → Creates user profile with org link → Redirects to dashboard
```

### Method 2: Email Match (Auto-Join During Onboarding)
```
Admin sends invitation → Invitation stored with user's email
    ↓
User signs up (with invited email) → Redirects to onboarding
    ↓
Onboarding checks for pending invitation → Shows "Join Team" flow
    ↓
User confirms name → Accepts invitation → Joins organization
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| Invite page | `admin/pages/invite.html/js` | Token-based acceptance UI |
| Onboarding | `admin/pages/onboarding.js` | Auto-join detection |
| Settings | `admin/pages/settings.js` | Send invitations |
| Supabase | `admin/supabase.js` | `acceptInvitation()`, `getInvitationByToken()`, `getPendingInvitationByEmail()` |
| Email worker | `api/invite-worker.js` | Sends branded emails with token links |

### Invitation Data Structure
```javascript
{
  id: "uuid",
  organization_id: "org-uuid",
  email: "user@example.com",
  role: "member" | "admin",
  token: "secure-random-token",
  expires_at: "2025-12-23T00:00:00Z",  // 7 days
  accepted_at: null,  // Set when accepted
  created_at: "2025-12-16T00:00:00Z"
}
```

## Data Flow

### Extension Context (Authenticated)
```
HubSpot Page → content.js → background.js → Supabase REST API
                    ↓                              ↓
              sidepanel.js ←──────────── organization content
                    ↓
         app.revguide.io (admin panel)
```

### Extension Context (Not Authenticated)
```
HubSpot Page → content.js → chrome.storage.local
                    ↓
              sidepanel.js ← chrome.runtime.sendMessage → background.js
                    ↓                                          ↓
         local admin pages                             HubSpot API (proxy)
```

### Web App Context
```
app.revguide.io → admin pages → Supabase (via RevGuideDB)
                       ↓
                 RevGuideHubSpot → Edge Function → HubSpot OAuth
```

## Extension ↔ Web App Authentication Bridge

The extension authenticates via the web app using Chrome's external messaging API.

### Authentication Flow
```
User clicks "Sign In" in extension sidepanel
    ↓
Opens: app.revguide.io/login?request_path=/extension/logged-in&eid={extensionId}
    ↓
User logs in (or already logged in → auto-redirects)
    ↓
Callback page (/extension/logged-in) sends message to extension:
    chrome.runtime.sendMessage(extensionId, { type: 'AUTH_STATE_CHANGED', payload: {...} })
    ↓
Extension background.js receives via onMessageExternal listener
    ↓
Stores auth token in chrome.storage.local
    ↓
Extension fetches content from Supabase using stored token
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| External listener | `background/background.js` | `onMessageExternal` receives auth messages |
| Callback page | `admin/pages/extension-logged-in.html/js` | Sends auth token to extension |
| Login redirect | `admin/pages/login.js` | Handles `request_path` parameter |
| Sidepanel auth | `sidepanel/sidepanel.js` | Auth state UI, login button |
| Manifest config | `manifest.json` | `externally_connectable` for app.revguide.io |

### Auth State Storage
```javascript
// Stored in chrome.storage.local
{
  authState: {
    isAuthenticated: true,
    accessToken: "eyJ...",
    refreshToken: "...",
    expiresAt: 1702000000,
    user: { id: "uuid", email: "user@example.com" },
    profile: { id: "uuid", name: "User Name", organizationId: "org-uuid", role: "admin" }
  }
}
```

### UI States

| Auth State | Sidepanel Plays Tab | Settings Tab | Admin Panel Button |
|------------|---------------------|--------------|-------------------|
| Logged Out | "Sign In Required" | Shows API token field | Opens local admin |
| Logged In | Organization content | Shows email + Sign Out | Opens app.revguide.io |

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
  // Content (local mode)
  rules: [],           // Banners
  battleCards: [],     // Plays
  presentations: [],   // Media embeds
  wikiEntries: [],     // Wiki glossary

  // Settings
  settings: {},        // User preferences
  invitedUsers: [],    // Team invites (legacy)

  // Wiki cache
  wikiTermMapCache: {},    // Pre-built term map
  wikiEntriesById: {},     // Entry lookup by ID
  wikiCacheVersion: 0,     // Cache invalidation

  // Authentication (when signed in via web app)
  authState: {
    isAuthenticated: true,
    accessToken: "...",
    refreshToken: "...",
    expiresAt: 0,
    user: { id, email },
    profile: { id, name, organizationId, role }
  },

  // Cloud content cache
  cloudContent: {        // Cached org content from Supabase
    rules: [],
    battleCards: [],
    wikiEntries: []
  },
  cloudContentLastFetch: 0  // Timestamp
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

Current: **v2.4.0** (December 2024) - Team Invitation System

See `CHANGELOG.md` for full history.
