# Content Libraries & Marketplace Architecture

> Technical specification for enabling users to create content libraries and publish to a marketplace.

## Table of Contents

1. [Overview](#overview)
2. [Conceptual Model](#conceptual-model)
3. [Database Schema](#database-schema)
4. [API Specification](#api-specification)
5. [Edge Functions](#edge-functions)
6. [Admin UI Pages](#admin-ui-pages)
7. [Installation Flow](#installation-flow)
8. [Publishing Flow](#publishing-flow)
9. [Update & Sync Strategy](#update--sync-strategy)
10. [Security & RLS Policies](#security--rls-policies)
11. [Storage Requirements](#storage-requirements)
12. [Future Considerations](#future-considerations)

---

## Overview

This document outlines the infrastructure needed for RevGuide users to:

1. **Create Libraries** - Bundle banners, plays, and wiki entries into reusable packages
2. **Publish to Marketplace** - Share libraries publicly for others to install
3. **Install Libraries** - Add community content to their organization
4. **Receive Updates** - Stay current with library improvements

### Key Principles

- **Organization-scoped**: Libraries belong to organizations, not individual users
- **Version-controlled**: Published libraries are immutable snapshots; updates create new versions
- **Non-destructive installs**: Installed content is cloned, not referenced
- **Customization-aware**: User modifications are preserved during updates

---

## Conceptual Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                          MARKETPLACE                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │ SaaS Sales  │  │ Competitor  │  │ HubSpot     │  ...more        │
│  │ Playbook    │  │ Intel Pack  │  │ Field Guide │                 │
│  │ by UserX    │  │ by UserY    │  │ by RevGuide │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
                              ↓ Install
┌─────────────────────────────────────────────────────────────────────┐
│                     USER'S ORGANIZATION                              │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ My Content Library (private)                                     ││
│  │ ├─ Custom Banners                                               ││
│  │ ├─ Custom Plays                                                 ││
│  │ └─ Custom Wiki Entries                                          ││
│  └─────────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Installed Packages (from marketplace)                           ││
│  │ ├─ SaaS Sales Playbook (v2.1)  [auto-updates]                  ││
│  │ └─ HubSpot Field Guide (v1.0)  [locked]                        ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### Terminology

| Term | Definition |
|------|------------|
| **Library** | A bundled collection of banners, plays, and wiki entries |
| **Listing** | A marketplace entry for a published library |
| **Installation** | A record of a library installed in an organization |
| **Snapshot** | Frozen copy of library content at publish time |
| **Source tracking** | Links installed content back to its origin library |

---

## Database Schema

### New Tables

#### 1. `libraries` - User-created content bundles

```sql
CREATE TABLE libraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,

  -- Metadata
  name TEXT NOT NULL,
  slug TEXT NOT NULL,                    -- URL-friendly identifier
  description TEXT,
  category TEXT,                         -- 'sales', 'marketing', 'support', 'onboarding'
  tags TEXT[],                           -- ['saas', 'b2b', 'enterprise']
  icon_url TEXT,
  cover_image_url TEXT,

  -- Versioning
  version TEXT NOT NULL DEFAULT '1.0.0',
  changelog JSONB,                       -- [{ version, date, notes }]

  -- Publishing
  visibility TEXT NOT NULL DEFAULT 'private',  -- 'private', 'unlisted', 'public'
  published_at TIMESTAMPTZ,

  -- Content snapshot (frozen at publish time)
  content_snapshot JSONB,

  -- Stats
  install_count INTEGER DEFAULT 0,

  -- Audit
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, slug)
);

CREATE INDEX idx_libraries_visibility ON libraries(visibility);
CREATE INDEX idx_libraries_category ON libraries(category);
CREATE INDEX idx_libraries_published ON libraries(published_at)
  WHERE visibility = 'public';
```

#### 2. `library_items` - Links content to libraries

```sql
CREATE TABLE library_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id UUID REFERENCES libraries(id) ON DELETE CASCADE,

  item_type TEXT NOT NULL,    -- 'banner', 'play', 'wiki_entry'
  item_id UUID NOT NULL,      -- Reference to actual content

  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(library_id, item_type, item_id)
);

CREATE INDEX idx_library_items_library ON library_items(library_id);
```

#### 3. `marketplace_listings` - Public marketplace entries

```sql
CREATE TABLE marketplace_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  library_id UUID REFERENCES libraries(id) ON DELETE CASCADE UNIQUE,

  -- Publisher info
  publisher_org_id UUID REFERENCES organizations(id),
  publisher_name TEXT NOT NULL,
  publisher_verified BOOLEAN DEFAULT FALSE,

  -- Listing details
  title TEXT NOT NULL,
  short_description TEXT,          -- 160 chars max, for cards
  long_description TEXT,           -- Full markdown description
  screenshots TEXT[],              -- Array of image URLs
  demo_video_url TEXT,

  -- Categorization
  category TEXT NOT NULL,
  subcategory TEXT,
  tags TEXT[],
  target_audience TEXT[],          -- ['sales_reps', 'sales_managers', 'revops']
  compatible_objects TEXT[],       -- ['contacts', 'companies', 'deals']

  -- Pricing (future)
  pricing_type TEXT DEFAULT 'free',  -- 'free', 'paid', 'freemium'
  price_cents INTEGER,

  -- Review workflow
  review_status TEXT DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  rejection_reason TEXT,

  -- Stats
  install_count INTEGER DEFAULT 0,
  rating_average DECIMAL(2,1),
  rating_count INTEGER DEFAULT 0,

  -- SEO & discovery
  slug TEXT UNIQUE NOT NULL,
  featured BOOLEAN DEFAULT FALSE,
  featured_order INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_marketplace_category ON marketplace_listings(category);
CREATE INDEX idx_marketplace_featured ON marketplace_listings(featured, featured_order);
CREATE INDEX idx_marketplace_status ON marketplace_listings(review_status);
```

#### 4. `library_installations` - Track installed libraries

```sql
CREATE TABLE library_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  library_id UUID REFERENCES libraries(id) ON DELETE CASCADE,

  -- Version tracking
  installed_version TEXT NOT NULL,
  current_version TEXT NOT NULL,     -- Latest available version
  auto_update BOOLEAN DEFAULT TRUE,

  -- State
  status TEXT DEFAULT 'active',      -- 'active', 'paused', 'uninstalled'

  -- Content mapping
  installed_content JSONB,           -- { banners: [ids], plays: [ids], wiki: [ids] }

  -- Audit
  installed_by UUID REFERENCES users(id),
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(organization_id, library_id)
);

CREATE INDEX idx_installations_org ON library_installations(organization_id);
CREATE INDEX idx_installations_library ON library_installations(library_id);
```

#### 5. `library_reviews` - User reviews and ratings

```sql
CREATE TABLE library_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  library_id UUID REFERENCES libraries(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),

  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  body TEXT,

  -- Moderation
  status TEXT DEFAULT 'published',   -- 'published', 'hidden', 'flagged'

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(library_id, organization_id)  -- One review per org per library
);

CREATE INDEX idx_reviews_library ON library_reviews(library_id);
```

### Schema Modifications

Add source tracking columns to existing content tables:

```sql
-- Add to banners table
ALTER TABLE banners
  ADD COLUMN source_library_id UUID REFERENCES libraries(id),
  ADD COLUMN source_item_id UUID,
  ADD COLUMN is_customized BOOLEAN DEFAULT FALSE;

-- Add to plays table
ALTER TABLE plays
  ADD COLUMN source_library_id UUID REFERENCES libraries(id),
  ADD COLUMN source_item_id UUID,
  ADD COLUMN is_customized BOOLEAN DEFAULT FALSE;

-- Add to wiki_entries table
ALTER TABLE wiki_entries
  ADD COLUMN source_library_id UUID REFERENCES libraries(id),
  ADD COLUMN source_item_id UUID,
  ADD COLUMN is_customized BOOLEAN DEFAULT FALSE;

-- Indexes for efficient lookups
CREATE INDEX idx_banners_source ON banners(source_library_id)
  WHERE source_library_id IS NOT NULL;
CREATE INDEX idx_plays_source ON plays(source_library_id)
  WHERE source_library_id IS NOT NULL;
CREATE INDEX idx_wiki_source ON wiki_entries(source_library_id)
  WHERE source_library_id IS NOT NULL;
```

---

## API Specification

### Library Management

```javascript
// Get all libraries for current organization
RevGuideDB.getLibraries()
// Returns: Library[]

// Get single library with all items
RevGuideDB.getLibraryWithItems(libraryId)
// Returns: { library: Library, items: LibraryItem[] }

// Create new library
RevGuideDB.createLibrary({
  name: string,
  slug: string,
  description?: string,
  category?: string,
  tags?: string[]
})
// Returns: Library

// Update library metadata
RevGuideDB.updateLibrary(libraryId, updates)
// Returns: Library

// Delete library (cascades to items)
RevGuideDB.deleteLibrary(libraryId)
// Returns: void

// Add content item to library
RevGuideDB.addItemToLibrary(libraryId, itemType, itemId)
// Returns: LibraryItem

// Remove content item from library
RevGuideDB.removeItemFromLibrary(libraryId, itemType, itemId)
// Returns: void

// Reorder items within library
RevGuideDB.reorderLibraryItems(libraryId, orderedItemIds)
// Returns: void
```

### Publishing

```javascript
// Publish library to marketplace
RevGuideDB.publishLibrary(libraryId, {
  version: string,
  changelog?: string
})
// Returns: { library: Library, listing: MarketplaceListing }

// Unpublish (remove from marketplace)
RevGuideDB.unpublishLibrary(libraryId)
// Returns: void

// Submit for review (required before first publish)
RevGuideDB.submitForReview(libraryId, {
  title: string,
  shortDescription: string,
  longDescription: string,
  category: string,
  screenshots?: string[]
})
// Returns: MarketplaceListing
```

### Marketplace Discovery

```javascript
// Browse marketplace listings
RevGuideDB.getMarketplaceListings({
  category?: string,
  tags?: string[],
  search?: string,
  sortBy?: 'popular' | 'recent' | 'rating',
  limit?: number,
  offset?: number
})
// Returns: { listings: MarketplaceListing[], total: number }

// Get featured listings for homepage
RevGuideDB.getFeaturedListings()
// Returns: MarketplaceListing[]

// Get single listing by slug
RevGuideDB.getListingBySlug(slug)
// Returns: MarketplaceListing & { library: Library }

// Search marketplace (full-text)
RevGuideDB.searchMarketplace(query)
// Returns: MarketplaceListing[]

// Get reviews for a listing
RevGuideDB.getListingReviews(listingId)
// Returns: LibraryReview[]
```

### Installation Management

```javascript
// Install library to organization
RevGuideDB.installLibrary(libraryId)
// Returns: LibraryInstallation & { installedContent: ContentIds }

// Get all installed libraries
RevGuideDB.getInstalledLibraries()
// Returns: (LibraryInstallation & { library: Library })[]

// Update installed library to latest version
RevGuideDB.updateInstalledLibrary(installationId)
// Returns: LibraryInstallation

// Toggle auto-update setting
RevGuideDB.setAutoUpdate(installationId, enabled)
// Returns: void

// Uninstall library
RevGuideDB.uninstallLibrary(installationId, { keepContent?: boolean })
// Returns: void
```

### Reviews

```javascript
// Create review (requires installation)
RevGuideDB.createReview(libraryId, {
  rating: number,      // 1-5
  title?: string,
  body?: string
})
// Returns: LibraryReview

// Update existing review
RevGuideDB.updateReview(reviewId, updates)
// Returns: LibraryReview

// Delete review
RevGuideDB.deleteReview(reviewId)
// Returns: void
```

---

## Edge Functions

### `marketplace-install`

Handles library installation by cloning content to the target organization.

**Location**: `/supabase/functions/marketplace-install/index.ts`

```typescript
interface InstallRequest {
  libraryId: string;
  organizationId: string;
  userId: string;
}

interface InstallResponse {
  success: boolean;
  installation: LibraryInstallation;
  installedContent: {
    banners: string[];
    plays: string[];
    wikiEntries: string[];
  };
}

// Process:
// 1. Verify user has editor/admin permission
// 2. Check library exists and is public (or same org)
// 3. Fetch content_snapshot from library
// 4. Clone each item to organization:
//    - Generate new UUIDs
//    - Set organization_id to target org
//    - Set source_library_id and source_item_id
//    - Set is_customized = false
// 5. Create library_installations record
// 6. Increment install_count on listing
// 7. Return installation with content mapping
```

### `marketplace-publish`

Handles the publishing workflow including content snapshotting.

**Location**: `/supabase/functions/marketplace-publish/index.ts`

```typescript
interface PublishRequest {
  libraryId: string;
  version: string;
  changelog?: string;
}

// Process:
// 1. Verify user has editor/admin permission
// 2. Fetch all library_items for this library
// 3. Fetch full content for each item (banners, plays, wiki)
// 4. Create content_snapshot JSON
// 5. Update library with:
//    - version
//    - content_snapshot
//    - visibility = 'public'
//    - published_at = now()
// 6. Create/update marketplace_listing
// 7. Return updated library and listing
```

### `marketplace-update`

Syncs updates to organizations with auto-update enabled.

**Location**: `/supabase/functions/marketplace-update/index.ts`

```typescript
interface UpdateRequest {
  installationId: string;
}

// Process:
// 1. Fetch installation and library
// 2. Compare installed_version with library.version
// 3. For each item in new snapshot:
//    a. Find local item by source_item_id
//    b. If not found: create new item
//    c. If found and is_customized = false: update
//    d. If found and is_customized = true: skip
// 4. Handle deletions (items removed from library)
// 5. Update installation record with new version
```

### `marketplace-stats`

Tracks analytics and aggregates statistics.

**Location**: `/supabase/functions/marketplace-stats/index.ts`

```typescript
// Endpoints:
// POST /track-view - Record listing view
// POST /track-install - Record installation
// GET /publisher-stats - Get stats for publisher's listings
```

---

## Admin UI Pages

### 1. Libraries Page (`/admin/pages/libraries.js`)

Main library management interface.

```
┌─────────────────────────────────────────────────────────────────┐
│  My Libraries                                    [+ New Library] │
├─────────────────────────────────────────────────────────────────┤
│  [Search libraries...]                                          │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 📦 SaaS Competitor Playbook                    v2.1.0      ││
│  │ 12 plays, 45 wiki entries, 8 banners                       ││
│  │ ○ Private                        [Edit] [Publish] [Delete] ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 📦 Onboarding Kit                              v1.0.0      ││
│  │ 5 plays, 20 wiki entries, 3 banners                        ││
│  │ ● Published (142 installs)      [Edit] [Manage] [Delete]   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ 📦 New Hire Training                           v1.2.0      ││
│  │ 8 plays, 30 wiki entries, 2 banners                        ││
│  │ ◐ Pending Review                [Edit] [Cancel] [Delete]   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- List all organization libraries
- Quick stats (content counts, install count)
- Status indicators (private, published, pending)
- Actions: Edit, Publish/Manage, Delete

### 2. Library Editor Modal

Modal for creating and editing libraries.

```
┌─────────────────────────────────────────────────────────────────┐
│  Edit Library: SaaS Competitor Playbook                    [×]  │
├─────────────────────────────────────────────────────────────────┤
│  LIBRARY DETAILS                                                │
│  ───────────────────────────────────────────────────────────    │
│                                                                  │
│  Name                                                           │
│  [SaaS Competitor Playbook_________________________________]    │
│                                                                  │
│  Description                                                    │
│  [Battle cards and competitive intelligence for SaaS sales___] │
│  [teams. Includes plays for major competitors and objection__] │
│  [handlers.__________________________________________________|] │
│                                                                  │
│  Category              Tags                                     │
│  [Sales         ▼]     [saas] [b2b] [competitors] [+ Add]      │
│                                                                  │
│  ───────────────────────────────────────────────────────────    │
│  LIBRARY CONTENTS                            [+ Add Content]    │
│  ───────────────────────────────────────────────────────────    │
│                                                                  │
│  ☰ 📋 Salesforce Competitive Overview              [Remove]    │
│  ☰ 📋 HubSpot CRM Comparison                       [Remove]    │
│  ☰ 📋 Pipedrive Battle Card                        [Remove]    │
│  ☰ 📖 ARR Definition                               [Remove]    │
│  ☰ 📖 MRR Definition                               [Remove]    │
│  ☰ 🚩 Competitor Detected Alert                    [Remove]    │
│                                                                  │
│  ───────────────────────────────────────────────────────────    │
│                                                                  │
│                              [Cancel]  [Save]  [Publish v2.2.0] │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- Library metadata editing
- Drag-and-drop content ordering
- Add content picker (select from existing banners/plays/wiki)
- Remove items from library
- Save draft or publish

### 3. Marketplace Browse Page (`/admin/pages/marketplace.js`)

Public marketplace discovery interface.

```
┌─────────────────────────────────────────────────────────────────┐
│  Marketplace                              [Search libraries...] │
├─────────────────────────────────────────────────────────────────┤
│  [All] [Sales] [Marketing] [Support] [RevOps] [Onboarding]     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ★ FEATURED                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ 🏆           │ │ 📊           │ │ 🎯           │            │
│  │ RevGuide     │ │ RevOps       │ │ Enterprise   │            │
│  │ Starter Kit  │ │ Metrics Pack │ │ Sales Plays  │            │
│  │              │ │              │ │              │            │
│  │ ★★★★★ (234)  │ │ ★★★★☆ (89)   │ │ ★★★★★ (156)  │            │
│  │ [Installed ✓]│ │ [Install]    │ │ [Install]    │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
│                                                                  │
│  ───────────────────────────────────────────────────────────    │
│  POPULAR IN SALES                                    [See all]  │
│  ───────────────────────────────────────────────────────────    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ MEDDIC Qualification Framework                              ││
│  │ by SalesOps Pro                    ★★★★☆ (67)  1.2k installs││
│  │ Complete MEDDIC implementation with qualification plays,   ││
│  │ discovery questions, and deal stage guidance.               ││
│  │                                          [View] [Install]   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Objection Handler Toolkit                                   ││
│  │ by CloserAcademy                   ★★★★★ (112) 890 installs ││
│  │ 25+ common sales objections with proven response            ││
│  │ frameworks and talk tracks.                                 ││
│  │                                          [View] [Install]   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- Category filtering
- Search functionality
- Featured listings carousel
- Category sections with "See all"
- Install/Installed status
- Ratings and install counts

### 4. Listing Detail Modal

Detailed view of a marketplace listing.

```
┌─────────────────────────────────────────────────────────────────┐
│  MEDDIC Qualification Framework                            [×]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    [Screenshot carousel]                    ││
│  │     ◀  ○ ○ ● ○  ▶                                          ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  by SalesOps Pro (Verified ✓)          ★★★★☆ 4.2 (67 reviews)  │
│  Version 2.1.0  •  1,234 installs  •  Updated 2 weeks ago      │
│                                                                  │
│  ───────────────────────────────────────────────────────────    │
│                                                                  │
│  Complete MEDDIC sales methodology implementation for HubSpot. │
│  Includes:                                                      │
│  • 8 qualification plays with discovery questions              │
│  • 25 wiki entries for MEDDIC terminology                      │
│  • 3 deal stage banners with next-step guidance                │
│  • Field definitions for Metrics, Economic Buyer, etc.         │
│                                                                  │
│  Perfect for B2B sales teams adopting MEDDIC methodology.      │
│                                                                  │
│  ───────────────────────────────────────────────────────────    │
│  CONTENTS                                                       │
│  ───────────────────────────────────────────────────────────    │
│  📋 8 Plays  •  📖 25 Wiki Entries  •  🚩 3 Banners            │
│                                                                  │
│  ───────────────────────────────────────────────────────────    │
│  REVIEWS                                         [Write Review] │
│  ───────────────────────────────────────────────────────────    │
│                                                                  │
│  ★★★★★  "Game changer for our sales process"                   │
│  Great content, well organized. Saved us weeks of work.        │
│  — Acme Corp, 3 days ago                                        │
│                                                                  │
│  ───────────────────────────────────────────────────────────    │
│                                                                  │
│                                    [Cancel]  [Install Library]  │
└─────────────────────────────────────────────────────────────────┘
```

### 5. Installed Libraries Page (`/admin/pages/installed.js`)

Manage installed library content.

```
┌─────────────────────────────────────────────────────────────────┐
│  Installed Libraries                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ RevGuide Starter Kit                           v1.2.0      ││
│  │ by RevGuide (Verified ✓)                                   ││
│  │                                                             ││
│  │ ● Auto-update ON                                           ││
│  │ 3 banners  •  5 plays  •  12 wiki entries                  ││
│  │                                                             ││
│  │ Installed Jan 15, 2025 by John Smith                       ││
│  │                                                             ││
│  │                    [View Contents]  [Settings]  [Remove]   ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ MEDDIC Framework                               v2.0.1      ││
│  │ by SalesOps Pro                                            ││
│  │                                                             ││
│  │ ○ Auto-update OFF                  ⚠️ Update available     ││
│  │ 0 banners  •  8 plays  •  25 wiki entries                  ││
│  │ 2 items customized (won't be updated)                      ││
│  │                                                             ││
│  │ Installed Dec 3, 2024 by Jane Doe                          ││
│  │                                                             ││
│  │              [View Contents]  [Update Now]  [Settings]  [Remove]││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Features:**
- List all installed libraries
- Version and update status
- Auto-update toggle
- Content counts and customization indicators
- Update, settings, and remove actions

---

## Installation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     INSTALLATION PROCESS                         │
└─────────────────────────────────────────────────────────────────┘

User clicks "Install" on marketplace listing
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. PERMISSION CHECK                                              │
│    • Verify user has editor or admin role                       │
│    • Check library is public or from same org                   │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. FETCH CONTENT SNAPSHOT                                        │
│    • Get library.content_snapshot JSON                          │
│    • Contains all banners, plays, wiki entries                  │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. CLONE CONTENT                                                 │
│    For each item in snapshot:                                   │
│    • Generate new UUID                                          │
│    • Set organization_id = installing org                       │
│    • Set source_library_id = library.id                        │
│    • Set source_item_id = original item ID                     │
│    • Set is_customized = FALSE                                  │
│    • Insert into appropriate table                              │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. CREATE INSTALLATION RECORD                                    │
│    • Link organization to library                               │
│    • Store installed_version                                    │
│    • Store installed_content mapping                            │
│    • Set auto_update preference                                 │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. UPDATE STATS                                                  │
│    • Increment install_count on listing                         │
│    • Track installation event for analytics                     │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
        Content appears in Banners/Plays/Wiki
              with "📦 From Library" badge
```

---

## Publishing Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     PUBLISHING PROCESS                           │
└─────────────────────────────────────────────────────────────────┘

User clicks "Publish" on library
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: LIBRARY DETAILS                                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Title: [MEDDIC Qualification Framework__________________]   │ │
│ │                                                             │ │
│ │ Short description (shown on cards):                         │ │
│ │ [Complete MEDDIC sales methodology for HubSpot. Includes_] │ │
│ │ [qualification plays, terminology wiki, and stage banners] │ │
│ │                                                             │ │
│ │ Full description (markdown):                                │ │
│ │ [__________________________________________________|▼]     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                              [Back] [Next →]    │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: CATEGORIZATION                                           │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Category: [Sales ▼]         Subcategory: [Methodology ▼]   │ │
│ │                                                             │ │
│ │ Tags: [meddic] [qualification] [b2b] [enterprise] [+]      │ │
│ │                                                             │ │
│ │ Target audience:                                            │ │
│ │ [✓] Sales Reps  [✓] Sales Managers  [ ] RevOps             │ │
│ │                                                             │ │
│ │ Compatible with:                                            │ │
│ │ [✓] Contacts  [✓] Companies  [✓] Deals  [ ] Tickets        │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                          [← Back] [Next →]      │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: MEDIA & SCREENSHOTS                                      │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Screenshots (up to 5):                                      │ │
│ │ ┌────┐ ┌────┐ ┌────┐ ┌────────────┐                        │ │
│ │ │ 📷 │ │ 📷 │ │ 📷 │ │ + Add more │                        │ │
│ │ └────┘ └────┘ └────┘ └────────────┘                        │ │
│ │                                                             │ │
│ │ Demo video URL (optional):                                  │ │
│ │ [https://www.loom.com/share/abc123___________________]     │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                          [← Back] [Next →]      │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: REVIEW & SUBMIT                                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ CONTENT SUMMARY                                             │ │
│ │ ───────────────────────────────────────────────────────     │ │
│ │ 📋 8 Plays                                                  │ │
│ │    • MEDDIC Discovery Questions                            │ │
│ │    • Metrics Qualification Play                            │ │
│ │    • Economic Buyer Identification                         │ │
│ │    ... and 5 more                                          │ │
│ │                                                             │ │
│ │ 📖 25 Wiki Entries                                          │ │
│ │ 🚩 3 Banners                                                │ │
│ │                                                             │ │
│ │ ───────────────────────────────────────────────────────     │ │
│ │ [ ] I confirm this content is original or properly         │ │
│ │     licensed, and does not contain sensitive data          │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                      [← Back] [Submit for Review]│
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ REVIEW PROCESS (RevGuide Admin)                                  │
│                                                                  │
│ • Check content quality and accuracy                            │
│ • Verify no PII or sensitive data                               │
│ • Ensure appropriate categorization                             │
│ • Review screenshots and description                            │
│                                                                  │
│ ┌─────────────┐              ┌─────────────┐                    │
│ │  APPROVE    │              │   REJECT    │                    │
│ │             │              │             │                    │
│ │ • Set       │              │ • Set       │                    │
│ │   status =  │              │   status =  │                    │
│ │   approved  │              │   rejected  │                    │
│ │ • Publish   │              │ • Send      │                    │
│ │   to market │              │   feedback  │                    │
│ └─────────────┘              └─────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Update & Sync Strategy

### Update Scenarios

| Scenario | Behavior |
|----------|----------|
| Publisher releases new version | Subscribers with auto-update get changes automatically |
| User edits installed content | `is_customized = TRUE`, item excluded from future updates |
| User resets item to original | `is_customized = FALSE`, item re-syncs with library |
| Publisher deletes library | Installed content remains, marked as "orphaned" |
| User uninstalls library | Option to keep or delete all installed content |
| Publisher adds new items | New items added to subscribers on next update |
| Publisher removes items | Removed items optionally deleted from subscribers |

### Update Algorithm

```javascript
async function updateInstalledLibrary(installationId) {
  const installation = await getInstallation(installationId);
  const latestSnapshot = await getLibrarySnapshot(installation.library_id);
  const currentSnapshot = installation.installed_content;

  const results = {
    added: [],
    updated: [],
    skipped: [],    // Customized items
    removed: []
  };

  // Process items in new snapshot
  for (const item of latestSnapshot.items) {
    const localItem = await findBySourceItemId(
      item.type,
      item.source_item_id,
      installation.organization_id
    );

    if (!localItem) {
      // New item - create it
      const newId = await createContent(item, installation.organization_id, {
        source_library_id: installation.library_id,
        source_item_id: item.id,
        is_customized: false
      });
      results.added.push(newId);

    } else if (!localItem.is_customized) {
      // Existing, not customized - update it
      await updateContent(localItem.id, item);
      results.updated.push(localItem.id);

    } else {
      // Customized - skip
      results.skipped.push(localItem.id);
    }
  }

  // Handle deletions (items in local but not in new snapshot)
  const newItemIds = new Set(latestSnapshot.items.map(i => i.id));
  for (const localItem of currentSnapshot.items) {
    if (!newItemIds.has(localItem.source_item_id)) {
      // Item was removed from library
      // Option: delete or mark as orphaned
      await markAsOrphaned(localItem.id);
      results.removed.push(localItem.id);
    }
  }

  // Update installation record
  await updateInstallation(installationId, {
    installed_version: latestSnapshot.version,
    current_version: latestSnapshot.version,
    installed_content: buildContentMapping(results),
    updated_at: new Date()
  });

  return results;
}
```

### Customization Detection

Content is marked as customized when users edit it:

```javascript
// In updateBanner, updatePlay, updateWikiEntry functions:
async function updateBanner(id, updates) {
  const banner = await getBanner(id);

  // If this banner came from a library and user is editing it
  if (banner.source_library_id && !banner.is_customized) {
    updates.is_customized = true;
  }

  return await supabase
    .from('banners')
    .update(updates)
    .eq('id', id);
}
```

---

## Security & RLS Policies

### Libraries Table

```sql
-- Users can view their org's libraries
CREATE POLICY "View own org libraries"
  ON libraries FOR SELECT
  USING (organization_id = get_user_organization_id());

-- Users can view public libraries
CREATE POLICY "View public libraries"
  ON libraries FOR SELECT
  USING (visibility = 'public');

-- Editors can create/update/delete org libraries
CREATE POLICY "Manage own org libraries"
  ON libraries FOR ALL
  USING (
    organization_id = get_user_organization_id()
    AND check_user_can_edit_content()
  );
```

### Marketplace Listings Table

```sql
-- Anyone can view approved listings
CREATE POLICY "View approved listings"
  ON marketplace_listings FOR SELECT
  USING (review_status = 'approved');

-- Publishers can view their pending listings
CREATE POLICY "View own pending listings"
  ON marketplace_listings FOR SELECT
  USING (publisher_org_id = get_user_organization_id());

-- Publishers can manage their listings
CREATE POLICY "Manage own listings"
  ON marketplace_listings FOR ALL
  USING (
    publisher_org_id = get_user_organization_id()
    AND check_user_can_edit_content()
  );
```

### Installations Table

```sql
-- Users can view org installations
CREATE POLICY "View org installations"
  ON library_installations FOR SELECT
  USING (organization_id = get_user_organization_id());

-- Editors can manage installations
CREATE POLICY "Manage installations"
  ON library_installations FOR ALL
  USING (
    organization_id = get_user_organization_id()
    AND check_user_can_edit_content()
  );
```

### Reviews Table

```sql
-- Anyone can view published reviews
CREATE POLICY "View published reviews"
  ON library_reviews FOR SELECT
  USING (status = 'published');

-- Users can manage their org's reviews
CREATE POLICY "Manage own reviews"
  ON library_reviews FOR ALL
  USING (organization_id = get_user_organization_id());
```

---

## Storage Requirements

### Library Assets Bucket

Store library icons, cover images, and screenshots in Supabase Storage:

```sql
-- Create storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('library-assets', 'library-assets', true);

-- RLS policies for storage
CREATE POLICY "Anyone can view library assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'library-assets');

CREATE POLICY "Org members can upload assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'library-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM libraries
      WHERE organization_id = get_user_organization_id()
    )
  );
```

### File Structure

```
library-assets/
├── {library-id}/
│   ├── icon.png           # 256x256 library icon
│   ├── cover.png          # 1200x630 cover image
│   └── screenshots/
│       ├── 1.png          # Up to 5 screenshots
│       ├── 2.png
│       └── ...
```

### Upload Helper

```javascript
async function uploadLibraryAsset(libraryId, type, file) {
  const path = type === 'screenshot'
    ? `${libraryId}/screenshots/${Date.now()}.png`
    : `${libraryId}/${type}.png`;

  const { data, error } = await supabase.storage
    .from('library-assets')
    .upload(path, file, {
      contentType: 'image/png',
      upsert: true
    });

  if (error) throw error;

  return supabase.storage
    .from('library-assets')
    .getPublicUrl(path).data.publicUrl;
}
```

---

## Future Considerations

### Phase 2 Features

| Feature | Description |
|---------|-------------|
| **Paid Libraries** | Stripe integration for monetization; revenue sharing |
| **Publisher Analytics** | Dashboard with install trends, usage metrics, revenue |
| **Library Dependencies** | Libraries that require other libraries as prerequisites |
| **Forking** | Create derivative libraries from existing ones |
| **Collaboration** | Multiple publishers contributing to one library |
| **Private Marketplace** | Enterprise-only listings visible to specific orgs |
| **Bundles** | Discounted packages of multiple libraries |

### Content Moderation

| Feature | Description |
|---------|-------------|
| **Automated Scanning** | PII detection, inappropriate content filtering |
| **Community Flagging** | Users can report problematic content |
| **Publisher Verification** | Badge for verified/trusted publishers |
| **Quality Scoring** | Algorithm-based quality indicators |
| **Review Moderation** | Flag and hide inappropriate reviews |

### Technical Improvements

| Feature | Description |
|---------|-------------|
| **Differential Updates** | Only sync changed items, not full snapshot |
| **Conflict Resolution** | Smart merging when both user and publisher change item |
| **Rollback** | Ability to revert to previous library version |
| **Preview Mode** | Try library content before installing |
| **Bulk Operations** | Install/update multiple libraries at once |

---

## Implementation Checklist

### Database
- [ ] Create `libraries` table
- [ ] Create `library_items` table
- [ ] Create `marketplace_listings` table
- [ ] Create `library_installations` table
- [ ] Create `library_reviews` table
- [ ] Add source tracking columns to content tables
- [ ] Create indexes
- [ ] Set up RLS policies
- [ ] Create storage bucket

### Edge Functions
- [ ] `marketplace-install` function
- [ ] `marketplace-publish` function
- [ ] `marketplace-update` function
- [ ] `marketplace-stats` function

### API Layer
- [ ] Library CRUD methods in `supabase.js`
- [ ] Publishing methods
- [ ] Marketplace discovery methods
- [ ] Installation management methods
- [ ] Review methods

### Admin UI
- [ ] Libraries page (`libraries.js`)
- [ ] Library editor modal
- [ ] Marketplace browse page (`marketplace.js`)
- [ ] Listing detail modal
- [ ] Installed libraries page (`installed.js`)
- [ ] Publishing wizard modal
- [ ] Sidebar navigation updates

### Content Updates
- [ ] Add library badges to content cards
- [ ] Add customization tracking to edit functions
- [ ] Add "Reset to original" action
- [ ] Add source info to content detail views

---

## Summary

This architecture adds a complete library and marketplace system to RevGuide:

| Component | Count | Purpose |
|-----------|-------|---------|
| New database tables | 5 | Store libraries, listings, installations, reviews |
| Schema modifications | 3 | Source tracking on content tables |
| Edge functions | 4 | Install, publish, update, stats |
| API methods | ~20 | Full CRUD for all marketplace operations |
| Admin pages | 4 | Libraries, marketplace, installed, settings |
| Storage bucket | 1 | Library assets (icons, screenshots) |

The design leverages existing RevGuide patterns:
- Organization-scoped multi-tenancy
- Row Level Security for data isolation
- Supabase Edge Functions for complex operations
- Vanilla JS admin UI patterns
