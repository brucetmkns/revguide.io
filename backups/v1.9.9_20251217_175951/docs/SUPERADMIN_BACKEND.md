# RevGuide Superadmin Backend

## Development Plan & Technical Specification

**Document Version:** 1.0
**Created:** December 2024
**Status:** Planning

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Technology Stack](#technology-stack)
4. [Database Schema](#database-schema)
5. [Feature Specifications](#feature-specifications)
6. [API Design](#api-design)
7. [Security & Permissions](#security--permissions)
8. [Implementation Phases](#implementation-phases)
9. [Roadmap](#roadmap)
10. [Deployment & Infrastructure](#deployment--infrastructure)
11. [Migration Strategy](#migration-strategy)

---

## Executive Summary

### Purpose

Build a centralized superadmin backend for RevGuide that enables:
- **Content Library Management** - Create, edit, and publish libraries without code
- **Email Notifications** - Configure automated emails for various triggers
- **Analytics Dashboard** - Track usage, engagement, and content performance

### Current State

RevGuide is currently a client-side Chrome extension where:
- All data stored in `chrome.storage.local` (per-user, no sync)
- Content libraries hosted as static JSON on GitHub
- No central user management or analytics
- Email invitations via Cloudflare Worker (basic)

### Target State

A web-based superadmin portal (`admin.revguide.io`) backed by Supabase that:
- Provides a no-code interface for managing all RevGuide content
- Syncs content to Chrome extensions in real-time
- Collects and displays usage analytics
- Sends automated email notifications
- Manages users and teams centrally

---

## Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SUPERADMIN WEB APP                               │
│                       (admin.revguide.io)                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Libraries  │  │   Emails    │  │  Analytics  │  │   Users     │    │
│  │   Editor    │  │   Config    │  │  Dashboard  │  │   & Teams   │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                                          │
│  Tech: Next.js 14 (App Router) + Tailwind CSS + shadcn/ui              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Supabase JS Client
                                    │ (Auth, Realtime, REST)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            SUPABASE                                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                         PostgreSQL                                │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │  │
│  │  │ libraries│ │  users   │ │ analytics│ │  emails  │            │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘            │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                       Edge Functions                              │  │
│  │  • send-email          (Resend integration)                      │  │
│  │  • record-analytics    (Batch event ingestion)                   │  │
│  │  • sync-library        (Webhook for library updates)             │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                         Auth                                      │  │
│  │  • Magic Link (email)                                            │  │
│  │  • Google OAuth                                                  │  │
│  │  • Role-based access (superadmin, admin, user)                   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                       Realtime                                    │  │
│  │  • Library update subscriptions                                  │  │
│  │  • Live analytics feed                                           │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
          │                              │                        │
          │ REST API                     │ Realtime               │ Edge Functions
          ▼                              ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        CHROME EXTENSION                                  │
│                                                                          │
│  Changes Required:                                                       │
│  • Add Supabase client to background worker                             │
│  • Fetch libraries from Supabase (replace GitHub)                       │
│  • Subscribe to library updates (realtime)                              │
│  • Send analytics events on user actions                                │
│  • Register user on first install                                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Analytics Events
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          END USERS                                       │
│              (HubSpot users with RevGuide extension)                    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Library Publishing Flow:**
   ```
   Superadmin edits library in web app
   → Saves to Supabase `libraries` table
   → Triggers realtime broadcast
   → Chrome extensions receive update
   → Users see new content immediately
   ```

2. **Analytics Collection Flow:**
   ```
   User views wiki entry / clicks banner
   → Extension sends event to Edge Function
   → Event stored in `analytics_events` table
   → Superadmin views aggregated data in dashboard
   ```

3. **Email Notification Flow:**
   ```
   Trigger occurs (signup, inactivity, etc.)
   → Supabase trigger/cron calls Edge Function
   → Edge Function calls Resend API
   → User receives email
   ```

---

## Technology Stack

### Frontend (Superadmin Web App)

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | **Next.js 14** (App Router) | SSR, API routes, great DX |
| Styling | **Tailwind CSS** | Rapid development, consistent design |
| UI Components | **shadcn/ui** | High-quality, accessible, customizable |
| State Management | **React Query (TanStack)** | Server state, caching, optimistic updates |
| Forms | **React Hook Form + Zod** | Type-safe validation |
| Rich Text Editor | **Tiptap** or **Plate** | Extensible, works well with React |
| Charts | **Recharts** | Simple, composable, React-native |
| Icons | **Lucide React** | Consistent with shadcn/ui |

### Backend (Supabase)

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Database | **Supabase PostgreSQL** | Relational, powerful, free tier |
| Auth | **Supabase Auth** | Built-in, supports magic link + OAuth |
| Realtime | **Supabase Realtime** | WebSocket subscriptions for live updates |
| Edge Functions | **Supabase Edge Functions** (Deno) | Serverless, low latency |
| Storage | **Supabase Storage** | For media/images in libraries (if needed) |

### External Services

| Service | Purpose | Existing? |
|---------|---------|-----------|
| **Resend** | Transactional emails | Yes (already integrated) |
| **Vercel** | Web app hosting | New |
| **GitHub** | Source code, CI/CD | Yes |

### Chrome Extension Changes

| Addition | Purpose |
|----------|---------|
| `@supabase/supabase-js` | API client for auth & data |
| Background sync service | Fetch & cache library updates |
| Analytics event dispatcher | Send usage events |

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│     teams       │       │     users       │       │   user_roles    │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK)         │──┐    │ id (PK)         │──┐    │ id (PK)         │
│ name            │  │    │ email           │  │    │ user_id (FK)    │
│ slug            │  │    │ team_id (FK)    │──┘    │ role            │
│ settings (JSON) │  └───│ created_at      │       │ granted_by (FK) │
│ created_at      │       │ last_active_at  │       │ created_at      │
└─────────────────┘       │ metadata (JSON) │       └─────────────────┘
         │                └─────────────────┘
         │                        │
         │                        │
         ▼                        ▼
┌─────────────────┐       ┌─────────────────┐
│   libraries     │       │ analytics_events│
├─────────────────┤       ├─────────────────┤
│ id (PK)         │       │ id (PK)         │
│ team_id (FK)    │       │ user_id (FK)    │
│ name            │       │ event_type      │
│ slug            │       │ event_data(JSON)│
│ description     │       │ timestamp       │
│ type            │       │ session_id      │
│ content (JSON)  │       └─────────────────┘
│ version         │
│ is_published    │       ┌─────────────────┐
│ published_at    │       │ email_templates │
│ created_at      │       ├─────────────────┤
│ updated_at      │       │ id (PK)         │
│ created_by (FK) │       │ team_id (FK)    │
└─────────────────┘       │ trigger_type    │
                          │ subject         │
┌─────────────────┐       │ body_html       │
│library_versions │       │ is_enabled      │
├─────────────────┤       │ settings (JSON) │
│ id (PK)         │       │ created_at      │
│ library_id (FK) │       │ updated_at      │
│ version         │       └─────────────────┘
│ content (JSON)  │
│ published_at    │       ┌─────────────────┐
│ published_by(FK)│       │  email_logs     │
│ changelog       │       ├─────────────────┤
└─────────────────┘       │ id (PK)         │
                          │ template_id(FK) │
                          │ user_id (FK)    │
                          │ sent_at         │
                          │ status          │
                          │ error_message   │
                          └─────────────────┘
```

### Table Definitions

```sql
-- Teams (organizations using RevGuide)
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (people using the extension)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  display_name TEXT,
  avatar_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW(),

  -- Link to Supabase Auth
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE
);

-- User Roles (superadmin, admin, member)
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('superadmin', 'admin', 'member')),
  granted_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, role)
);

-- Content Libraries
CREATE TABLE libraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('wiki', 'banners', 'plays', 'mixed')),
  icon TEXT, -- emoji or icon name
  content JSONB NOT NULL DEFAULT '{}',
  version INTEGER DEFAULT 1,
  is_published BOOLEAN DEFAULT FALSE,
  is_public BOOLEAN DEFAULT FALSE, -- available to all teams
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),

  UNIQUE(team_id, slug)
);

-- Library content structure (stored in `content` JSONB):
-- {
--   "wikiEntries": [...],
--   "bannerRules": [...],
--   "battleCards": [...],
--   "metadata": {
--     "hubspotObjects": ["contacts", "deals"],
--     "tags": ["sales", "onboarding"]
--   }
-- }

-- Library Version History
CREATE TABLE library_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id UUID REFERENCES libraries(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content JSONB NOT NULL,
  changelog TEXT,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  published_by UUID REFERENCES users(id),

  UNIQUE(library_id, version)
);

-- Analytics Events
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  session_id TEXT,
  page_url TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),

  -- Partition by month for performance
  created_month DATE GENERATED ALWAYS AS (DATE_TRUNC('month', timestamp)) STORED
);

-- Index for analytics queries
CREATE INDEX idx_analytics_team_time ON analytics_events(team_id, timestamp DESC);
CREATE INDEX idx_analytics_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_user ON analytics_events(user_id);

-- Event types:
-- 'wiki_view', 'wiki_click', 'banner_view', 'banner_click',
-- 'banner_dismiss', 'play_view', 'play_click', 'library_install',
-- 'extension_install', 'extension_uninstall', 'session_start'

-- Email Templates
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT, -- plain text fallback
  is_enabled BOOLEAN DEFAULT TRUE,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(team_id, trigger_type)
);

-- Trigger types:
-- 'user_signup', 'weekly_digest', 'content_update',
-- 'inactivity_reminder', 'team_invitation'

-- Email template settings structure:
-- {
--   "delay_hours": 24,          -- for inactivity reminders
--   "send_day": "monday",       -- for weekly digest
--   "send_hour": 9,             -- UTC hour to send
--   "include_analytics": true   -- include stats in digest
-- }

-- Email Send Logs
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'bounced', 'opened', 'clicked')),
  resend_id TEXT, -- ID from Resend API
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ
);

-- Row Level Security Policies
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE libraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Superadmins can see everything
CREATE POLICY "Superadmins have full access" ON teams
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'superadmin'
    )
  );

-- Team members can see their own team
CREATE POLICY "Team members can view own team" ON teams
  FOR SELECT USING (
    id IN (
      SELECT team_id FROM users WHERE auth_user_id = auth.uid()
    )
  );

-- Similar policies for other tables...
```

### Analytics Aggregation Views

```sql
-- Daily active users
CREATE VIEW daily_active_users AS
SELECT
  team_id,
  DATE(timestamp) as date,
  COUNT(DISTINCT user_id) as active_users
FROM analytics_events
GROUP BY team_id, DATE(timestamp);

-- Content engagement summary
CREATE VIEW content_engagement AS
SELECT
  team_id,
  event_type,
  event_data->>'content_id' as content_id,
  event_data->>'content_name' as content_name,
  COUNT(*) as total_events,
  COUNT(DISTINCT user_id) as unique_users,
  DATE(MIN(timestamp)) as first_seen,
  DATE(MAX(timestamp)) as last_seen
FROM analytics_events
WHERE event_type IN ('wiki_view', 'banner_click', 'play_view')
GROUP BY team_id, event_type, event_data->>'content_id', event_data->>'content_name';
```

---

## Feature Specifications

### Feature 1: Content Library Management

#### User Stories

- As a superadmin, I want to create new content libraries without writing code
- As a superadmin, I want to edit existing wiki entries, banners, and plays visually
- As a superadmin, I want to publish library updates that sync to all users
- As a superadmin, I want to see version history and roll back if needed
- As a superadmin, I want to preview content before publishing

#### UI Components

1. **Library List View**
   - Grid/list of all libraries
   - Filter by type (wiki, banners, plays)
   - Search by name
   - Quick actions (edit, publish, duplicate, delete)
   - Status badges (draft, published, outdated)

2. **Library Editor**
   - Tabbed interface for different content types
   - Wiki editor with rich text (Tiptap)
   - Banner rule builder (drag & drop conditions)
   - Plays/battle card editor
   - Preview pane (shows how content appears in HubSpot)

3. **Version History**
   - Timeline of changes
   - Diff view between versions
   - One-click rollback
   - Changelog notes

#### Technical Requirements

- Real-time autosave (debounced)
- Optimistic UI updates
- Conflict detection for simultaneous edits
- JSON schema validation before save
- Image upload to Supabase Storage (for wiki media)

---

### Feature 2: Email Notifications

#### User Stories

- As a superadmin, I want to configure automated emails for user signup
- As a superadmin, I want to send weekly digest emails with usage stats
- As a superadmin, I want to notify users when content is updated
- As a superadmin, I want to re-engage inactive users with reminders
- As a superadmin, I want to see email delivery status and analytics

#### Email Triggers

| Trigger | Description | Default Timing |
|---------|-------------|----------------|
| `user_signup` | Welcome email on first extension install | Immediate |
| `weekly_digest` | Summary of activity and tips | Monday 9am UTC |
| `content_update` | New library content available | On publish |
| `inactivity_reminder` | Haven't used extension in X days | After 14 days inactive |
| `team_invitation` | Invited to join a team | Immediate |

#### UI Components

1. **Email Template List**
   - All configured templates
   - Enable/disable toggles
   - Last sent timestamp
   - Open/click rates

2. **Template Editor**
   - WYSIWYG email editor
   - Variable insertion ({{user.name}}, {{team.name}}, etc.)
   - Preview with sample data
   - Send test email button
   - Schedule settings

3. **Email Analytics**
   - Sent/delivered/opened/clicked counts
   - Bounce and complaint tracking
   - Per-template performance

#### Technical Requirements

- Resend API integration via Edge Function
- Webhook handler for delivery status updates
- Email queue for batch sending (weekly digest)
- Unsubscribe link handling
- GDPR compliance (consent tracking)

---

### Feature 3: Analytics Dashboard

#### User Stories

- As a superadmin, I want to see how many users are active
- As a superadmin, I want to see which content is most viewed/clicked
- As a superadmin, I want to track content performance over time
- As a superadmin, I want to identify underperforming content
- As a superadmin, I want to export analytics data

#### Metrics to Track

| Category | Metrics |
|----------|---------|
| **Users** | DAU, WAU, MAU, new users, churned users |
| **Wiki** | Views, clicks, unique viewers, time on tooltip |
| **Banners** | Impressions, clicks, dismissals, CTR |
| **Plays** | Views, clicks, completion rate |
| **Libraries** | Installs, updates, uninstalls |

#### UI Components

1. **Overview Dashboard**
   - Key metrics summary (cards)
   - Active users chart (line graph)
   - Top content leaderboard
   - Recent activity feed

2. **Content Performance**
   - Table of all content with stats
   - Sort by views, clicks, engagement
   - Filter by type, date range
   - Drill-down to individual items

3. **User Activity**
   - User list with last active date
   - Activity heatmap
   - User journey visualization

4. **Reports**
   - Date range selector
   - Export to CSV/PDF
   - Scheduled email reports

#### Technical Requirements

- Efficient aggregation queries (materialized views)
- Time-series data handling
- Client-side caching (React Query)
- Lazy loading for large datasets
- Real-time updates for live dashboard

---

## API Design

### Supabase REST Endpoints (Auto-generated)

```
# Libraries
GET    /rest/v1/libraries
POST   /rest/v1/libraries
PATCH  /rest/v1/libraries?id=eq.{id}
DELETE /rest/v1/libraries?id=eq.{id}

# Users
GET    /rest/v1/users
GET    /rest/v1/users?team_id=eq.{team_id}

# Analytics
GET    /rest/v1/analytics_events?team_id=eq.{team_id}&timestamp=gte.{start}

# Email Templates
GET    /rest/v1/email_templates?team_id=eq.{team_id}
PATCH  /rest/v1/email_templates?id=eq.{id}
```

### Edge Functions

#### `POST /functions/v1/record-analytics`

Batch insert analytics events from Chrome extension.

```typescript
// Request
{
  "events": [
    {
      "event_type": "wiki_view",
      "event_data": {
        "content_id": "uuid",
        "content_name": "MRR Definition"
      },
      "session_id": "abc123",
      "page_url": "https://app.hubspot.com/contacts/..."
    }
  ]
}

// Response
{ "received": 5, "processed": 5 }
```

#### `POST /functions/v1/send-email`

Send transactional email via Resend.

```typescript
// Request
{
  "template_id": "uuid",
  "to_user_id": "uuid",
  "variables": {
    "user_name": "Bruce",
    "action_url": "https://..."
  }
}

// Response
{ "success": true, "resend_id": "..." }
```

#### `POST /functions/v1/sync-library`

Webhook called when library is published.

```typescript
// Request (internal)
{
  "library_id": "uuid",
  "action": "publish"
}

// Response
{ "notified_users": 150 }
```

---

## Security & Permissions

### Role Hierarchy

```
superadmin
├── Full access to all teams and data
├── Can create/delete teams
├── Can promote users to admin
└── Can access global analytics

admin (team-level)
├── Full access to own team's data
├── Can manage team libraries
├── Can configure email templates
├── Can view team analytics
└── Can invite team members

member
├── Read-only access to libraries
├── Can view own analytics
└── Cannot access admin features
```

### Row-Level Security Summary

| Table | superadmin | admin | member |
|-------|------------|-------|--------|
| teams | CRUD all | Read own | Read own |
| users | CRUD all | Read own team | Read self |
| libraries | CRUD all | CRUD own team | Read published |
| analytics_events | Read all | Read own team | Read self |
| email_templates | CRUD all | CRUD own team | None |

### API Security

- All Supabase requests require JWT (from Auth)
- Edge Functions verify JWT and check roles
- Rate limiting on analytics ingestion (100 events/min per user)
- CORS restricted to extension and admin domain

---

## Implementation Phases

### Phase 1: Foundation (MVP)

**Goal:** Basic superadmin web app with library management

**Deliverables:**
- [ ] Supabase project setup
- [ ] Database schema (core tables)
- [ ] Next.js app scaffolding
- [ ] Authentication (magic link)
- [ ] Library list view
- [ ] Basic library editor (JSON view)
- [ ] Publish/unpublish functionality
- [ ] Chrome extension: fetch libraries from Supabase

**Definition of Done:**
- Superadmin can log in and see libraries
- Superadmin can edit library JSON and publish
- Chrome extension fetches published libraries

---

### Phase 2: Visual Editors

**Goal:** No-code editing experience

**Deliverables:**
- [ ] Wiki entry visual editor (rich text)
- [ ] Banner rule builder (condition UI)
- [ ] Plays/battle card editor
- [ ] Preview pane
- [ ] Version history view
- [ ] Library duplication

**Definition of Done:**
- Superadmin can create/edit content without touching JSON
- All existing library features supported visually

---

### Phase 3: Analytics

**Goal:** Usage tracking and dashboard

**Deliverables:**
- [ ] Analytics events table + indexes
- [ ] Chrome extension: event dispatch
- [ ] Edge Function: record-analytics
- [ ] Dashboard overview page
- [ ] Content performance table
- [ ] User activity view
- [ ] Date range filtering

**Definition of Done:**
- Events flowing from extension to database
- Dashboard shows meaningful metrics
- Can identify top-performing content

---

### Phase 4: Email Notifications

**Goal:** Automated email system

**Deliverables:**
- [ ] Email templates table
- [ ] Template editor UI
- [ ] Edge Function: send-email (Resend)
- [ ] Webhook for delivery tracking
- [ ] Trigger: user signup
- [ ] Trigger: content update
- [ ] Email logs and analytics

**Definition of Done:**
- Superadmin can configure email templates
- Emails sent automatically on triggers
- Delivery status visible in UI

---

### Phase 5: Advanced Features

**Goal:** Polish and power features

**Deliverables:**
- [ ] Weekly digest email (scheduled)
- [ ] Inactivity reminders
- [ ] Team management UI
- [ ] User invitation flow
- [ ] Export analytics to CSV
- [ ] Scheduled reports
- [ ] Audit log

**Definition of Done:**
- All email triggers working
- Full team management capability
- Production-ready system

---

## Roadmap

```
2025 Q1                          2025 Q2                          2025 Q3
────────────────────────────────────────────────────────────────────────────────

Jan         Feb         Mar         Apr         May         Jun         Jul
 │           │           │           │           │           │           │
 │  Phase 1  │           │  Phase 2  │           │  Phase 3  │           │
 │  ────────►│           │  ────────►│           │  ────────►│           │
 │           │           │           │           │           │           │
 │  • Supabase setup     │  • Wiki editor        │  • Analytics tracking │
 │  • Auth               │  • Banner builder     │  • Dashboard          │
 │  • Library CRUD       │  • Plays editor       │  • Reporting          │
 │  • Extension sync     │  • Version history    │                       │
 │           │           │           │           │           │           │
 │           │           │           │           │  Phase 4  │  Phase 5  │
 │           │           │           │           │  ────────►│  ────────►│
 │           │           │           │           │           │           │
 │           │           │           │           │  • Email  │  • Teams  │
 │           │           │           │           │    system │  • Polish │
 │           │           │           │           │  • Resend │  • Reports│
 │           │           │           │           │    integ  │           │
 ▼           ▼           ▼           ▼           ▼           ▼           ▼


MILESTONES:

[M1] End of Jan    → MVP: Superadmin can manage libraries via web UI
[M2] End of Mar    → Visual: No-code editing for all content types
[M3] End of May    → Analytics: Full usage dashboard live
[M4] End of Jun    → Emails: Automated notification system complete
[M5] End of Jul    → Production: All features polished, teams ready
```

### Version Releases

| Version | Target | Features |
|---------|--------|----------|
| v0.1.0 | Jan 2025 | Auth + Library JSON editor |
| v0.2.0 | Feb 2025 | Visual wiki editor |
| v0.3.0 | Mar 2025 | Banner + Plays editors |
| v0.4.0 | Apr 2025 | Analytics tracking |
| v0.5.0 | May 2025 | Analytics dashboard |
| v0.6.0 | Jun 2025 | Email notifications |
| v1.0.0 | Jul 2025 | Production release |

---

## Deployment & Infrastructure

### Environments

| Environment | Purpose | URL |
|-------------|---------|-----|
| Development | Local testing | localhost:3000 |
| Staging | Pre-production | staging-admin.revguide.io |
| Production | Live | admin.revguide.io |

### Supabase Projects

- **Development:** Local Supabase (Docker) or free cloud project
- **Staging:** Separate Supabase project
- **Production:** Production Supabase project (paid plan recommended)

### Vercel Deployment

```yaml
# vercel.json
{
  "framework": "nextjs",
  "regions": ["iad1"],
  "env": {
    "NEXT_PUBLIC_SUPABASE_URL": "@supabase-url",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": "@supabase-anon-key",
    "SUPABASE_SERVICE_ROLE_KEY": "@supabase-service-key"
  }
}
```

### CI/CD Pipeline

```
GitHub Push
    │
    ▼
┌─────────────────┐
│  GitHub Actions │
│  • Lint         │
│  • Type check   │
│  • Unit tests   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Vercel Build   │
│  • Preview URL  │
│  (for PRs)      │
└────────┬────────┘
         │
         ▼ (merge to main)
┌─────────────────┐
│  Production     │
│  Deployment     │
└─────────────────┘
```

### Monitoring

- **Vercel Analytics:** Page performance, Web Vitals
- **Supabase Dashboard:** Database metrics, API usage
- **Resend Dashboard:** Email delivery metrics
- **Sentry (optional):** Error tracking

---

## Migration Strategy

### Migrating Existing Data

1. **GitHub Libraries → Supabase**
   - One-time import script
   - Map existing JSON structure to database schema
   - Preserve library IDs for backward compatibility

2. **Chrome Extension Updates**
   - Gradual rollout via Chrome Web Store
   - Fallback to GitHub if Supabase unavailable
   - Migration prompt for existing users

### Backward Compatibility

```javascript
// Extension library fetching with fallback
async function fetchLibraries() {
  try {
    // Try Supabase first
    const { data } = await supabase
      .from('libraries')
      .select('*')
      .eq('is_published', true);
    return data;
  } catch (error) {
    // Fallback to GitHub
    const response = await fetch(GITHUB_LIBRARIES_URL);
    return response.json();
  }
}
```

### Data Migration Script

```javascript
// scripts/migrate-libraries.js
import { createClient } from '@supabase/supabase-js';

const GITHUB_BASE = 'https://raw.githubusercontent.com/brucetmkns/revguide.io/main/libraries';

async function migrateLibraries() {
  // 1. Fetch index from GitHub
  const index = await fetch(`${GITHUB_BASE}/index.json`).then(r => r.json());

  // 2. Fetch each library
  for (const lib of index.libraries) {
    const content = await fetch(`${GITHUB_BASE}/${lib.file}`).then(r => r.json());

    // 3. Insert into Supabase
    await supabase.from('libraries').insert({
      name: lib.name,
      slug: lib.id,
      description: lib.description,
      type: lib.type,
      content: content,
      is_published: true,
      is_public: true
    });
  }
}
```

---

## Appendix

### A. Useful Commands

```bash
# Start local development
npm run dev

# Run Supabase locally
supabase start

# Generate TypeScript types from database
supabase gen types typescript --local > types/database.ts

# Deploy Edge Functions
supabase functions deploy send-email
supabase functions deploy record-analytics

# Run database migrations
supabase db push
```

### B. Environment Variables

```env
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Server-side only
RESEND_API_KEY=re_xxx
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### C. File Structure (Proposed)

```
superadmin/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── callback/
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Overview
│   │   ├── libraries/
│   │   │   ├── page.tsx          # List
│   │   │   └── [id]/
│   │   │       ├── page.tsx      # Editor
│   │   │       └── versions/
│   │   ├── analytics/
│   │   │   ├── page.tsx          # Dashboard
│   │   │   └── content/
│   │   ├── emails/
│   │   │   ├── page.tsx          # Templates
│   │   │   └── [id]/
│   │   └── settings/
│   └── api/
│       └── webhooks/
│           └── resend/
├── components/
│   ├── ui/                       # shadcn components
│   ├── editors/
│   │   ├── wiki-editor.tsx
│   │   ├── banner-builder.tsx
│   │   └── plays-editor.tsx
│   ├── charts/
│   └── layout/
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── middleware.ts
│   ├── hooks/
│   └── utils/
├── types/
│   └── database.ts               # Generated
└── supabase/
    ├── migrations/
    └── functions/
        ├── send-email/
        └── record-analytics/
```

### D. References

- [Supabase Documentation](https://supabase.com/docs)
- [Next.js App Router](https://nextjs.org/docs/app)
- [shadcn/ui Components](https://ui.shadcn.com)
- [Resend API](https://resend.com/docs)
- [Tiptap Editor](https://tiptap.dev)

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Dec 2024 | Claude | Initial draft |
