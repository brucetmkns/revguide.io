# Multi-Portal Support & User Roles

## Overview

This document outlines the implementation plan for multi-portal support and user role management. The system supports three user roles with different capabilities, enabling teams to collaborate while giving consultants and agencies the ability to manage content across multiple client portals.

---

## User Roles

| Role | Who | Capabilities | Default For |
|------|-----|--------------|-------------|
| **Admin** | Account creators, portal owners | Full access: create/edit/delete content, manage settings, invite team members | Account creators |
| **User** | Team members | View-only access: browse wiki, view plays and banners, no editing | Invited team members |
| **Consultant** (Premium) | Agencies, freelancers | All Admin capabilities PLUS: portal switcher, My Libraries section, create/manage libraries, install to portals, invite admins/users to portals | Requires upgrade |

### Role Assignment

- **Account Creator**: Automatically assigned **Admin** role
- **Invited Team Members**: Automatically assigned **User** role (view-only)
- **Consultants**: Either:
  - Invited to an existing portal's admin panel (by an Admin or another Consultant)
  - Create new portals and invite Admins and Users to those portals
  - Requires upgraded/premium subscription

### Role Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│  CONSULTANT (Premium Feature)                               │
│  ├── Can manage multiple portals                            │
│  ├── Can create/manage reusable libraries                   │
│  ├── Can install libraries to any portal they manage        │
│  └── Can invite Admins and Users to portals                 │
│                                                             │
│  ADMIN (Default for creators)                               │
│  ├── Full control within their portal                       │
│  ├── Can create/edit/delete all content                     │
│  ├── Can manage portal settings                             │
│  └── Can invite Users (view-only) to their portal           │
│                                                             │
│  USER (Default for invited members)                         │
│  ├── View-only access                                       │
│  ├── Can browse wiki entries                                │
│  ├── Can view plays and banners                             │
│  └── Cannot edit or create content                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Concept (Consultant Feature)

**Consultants as Library Authors** - Rather than complex linked/synced content, consultants create their own libraries using the existing library infrastructure. These can be installed (copied) to any portal on demand.

```
┌─────────────────────────────────────────────────────────────┐
│  LIBRARIES (Consultant Feature)                             │
│  ├── Pre-built (GitHub)                                     │
│  │   ├── HubSpot Basics                                     │
│  │   ├── Sales Pipeline                                     │
│  │   └── ...                                                │
│  │                                                          │
│  └── My Libraries (Consultant-created)                      │
│      ├── "Acme Standard Playbook"                           │
│      ├── "SaaS Onboarding Kit"                              │
│      └── "Agency Best Practices"                            │
└─────────────────────────────────────────────────────────────┘
                           ↓
              Install to portal (creates copy)
                           ↓
┌───────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│  Portal A         │ │  Portal B         │ │  Portal C         │
│  (installed copy) │ │  (installed copy) │ │  (not installed)  │
└───────────────────┘ └───────────────────┘ └───────────────────┘
```

---

## UI Modes

| Mode | Available To | UI Features |
|------|--------------|-------------|
| **Single Portal** | Admin, User | One portal only, no switcher, "My Libraries" hidden, simplified UI |
| **Multi-Portal** | Consultant only | Portal switcher, My Libraries section, create/manage libraries, install to portals |

### Mode Behavior

- **Admin/User accounts**: Always in Single Portal mode (multi-portal UI hidden)
- **Consultant accounts**: Can switch between portals, see My Libraries section
- Settings toggle available for Consultants to simplify UI if needed

---

## Data Structure

```javascript
{
  // User role and account info
  userRole: "admin" | "user" | "consultant",  // admin = default for creators, user = default for invited, consultant = premium upgrade
  userId: "user_abc123",
  accountTier: "free" | "premium",  // consultant role requires premium tier

  // Portal registry
  activePortalId: "12345678",
  portals: {
    "12345678": {
      name: "Client A - Acme Corp",
      apiToken: "pat-na1-...",
      color: "#ff7a59",  // Visual identifier
      addedAt: 1702500000000,
      userRoleInPortal: "admin" | "user" | "consultant"  // Role within this specific portal
    },
    "87654321": {
      name: "Client B - Widget Inc",
      apiToken: "pat-eu1-...",
      color: "#00bda5",
      addedAt: 1702600000000,
      userRoleInPortal: "consultant"
    }
  },

  // Consultant's custom libraries (stored globally, once)
  myLibraries: [
    {
      id: "lib_abc123",
      name: "Agency Standard Playbook",
      description: "Our core plays and definitions for all clients",
      version: "1.2.0",
      createdAt: 1702400000000,
      updatedAt: 1702500000000,
      content: {
        wikiEntries: [...],    // Full entry objects
        battleCards: [...],    // Full play objects
        rules: [...]           // Full banner objects
      }
    }
  ],

  // Per-portal content (independent copies after install)
  portalData: {
    "12345678": {
      wikiEntries: [...],
      battleCards: [...],
      rules: [...],
      settings: {
        // Portal-specific settings (API token is in portals registry)
        showBanners: true,
        showBattleCards: true,
        // ... etc
      },
      installedLibraries: [
        {
          id: "lib_abc123",
          name: "Agency Standard Playbook",
          version: "1.1.0",  // Version at time of install
          installedAt: 1702400000000
        }
      ]
    },
    "87654321": {
      wikiEntries: [...],
      battleCards: [...],
      rules: [...],
      settings: {...},
      installedLibraries: []
    }
  },

  // Global settings (apply regardless of portal)
  globalSettings: {
    theme: "light",
    showAdminLinks: true
  }
}
```

---

## Implementation Phases

### Phase 1: Portal Detection & Registry

**Goal**: Auto-detect portals, allow switching, isolate storage per portal.

#### 1.1 Portal Detection (content/content.js)

```javascript
// Existing code extracts portalId - enhance to persist and notify
detectContext() {
  // ... existing detection ...
  const portalMatch = url.match(/\/contacts\/(\d+)\//);
  if (portalMatch) {
    context.portalId = portalMatch[1];

    // NEW: Notify background script of detected portal
    chrome.runtime.sendMessage({
      type: 'PORTAL_DETECTED',
      portalId: context.portalId
    });
  }
}
```

#### 1.2 Portal Registry Management (background/background.js)

```javascript
// Handle portal detection
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PORTAL_DETECTED') {
    handlePortalDetected(message.portalId);
  }
});

async function handlePortalDetected(portalId) {
  const { portals = {}, activePortalId } = await chrome.storage.local.get(['portals', 'activePortalId']);

  // Check if this is a new portal
  if (!portals[portalId]) {
    // New portal detected - prompt user to add it
    // Could use chrome.notifications or badge
    chrome.action.setBadgeText({ text: 'NEW' });
    chrome.storage.local.set({ pendingPortalId: portalId });
  }

  // Update active portal
  if (activePortalId !== portalId) {
    chrome.storage.local.set({ activePortalId: portalId });
    // Notify all tabs to reload content for new portal
    chrome.runtime.sendMessage({ type: 'PORTAL_CHANGED', portalId });
  }
}
```

#### 1.3 Portal Selector UI (admin panel header)

Add to all admin pages:

```html
<!-- admin/shared-header.html or injected via JS -->
<div class="portal-selector">
  <label>Portal:</label>
  <select id="portal-dropdown">
    <option value="12345678">Client A - Acme Corp</option>
    <option value="87654321">Client B - Widget Inc</option>
    <option disabled>──────────</option>
    <option value="add_new">+ Add Portal...</option>
  </select>
</div>
```

#### 1.4 Storage Abstraction Layer

Update `lib/storage.js` and `admin/shared.js` to be portal-aware:

```javascript
// lib/storage.js - new portal-aware methods
class StorageManager {

  async getActivePortalId() {
    const { activePortalId } = await chrome.storage.local.get('activePortalId');
    return activePortalId || 'default';
  }

  async getPortalData(portalId = null) {
    const id = portalId || await this.getActivePortalId();
    const { portalData = {} } = await chrome.storage.local.get('portalData');
    return portalData[id] || this.getEmptyPortalData();
  }

  async setPortalData(data, portalId = null) {
    const id = portalId || await this.getActivePortalId();
    const { portalData = {} } = await chrome.storage.local.get('portalData');
    portalData[id] = { ...portalData[id], ...data };
    await chrome.storage.local.set({ portalData });
  }

  getEmptyPortalData() {
    return {
      wikiEntries: [],
      battleCards: [],
      rules: [],
      settings: { showBanners: true, showBattleCards: true, showWiki: true },
      installedLibraries: []
    };
  }

  // Backward compatibility: migrate existing global data to first portal
  async migrateToPortalStructure() {
    const existing = await chrome.storage.local.get([
      'rules', 'battleCards', 'wikiEntries', 'settings'
    ]);

    if (existing.rules && !existing.portalData) {
      // First migration - move to 'default' portal
      const portalData = {
        'default': {
          rules: existing.rules || [],
          battleCards: existing.battleCards || [],
          wikiEntries: existing.wikiEntries || [],
          settings: existing.settings || {},
          installedLibraries: []
        }
      };

      await chrome.storage.local.set({
        portalData,
        activePortalId: 'default',
        portals: { 'default': { name: 'My Portal', addedAt: Date.now() } }
      });

      // Optionally clean up old keys
      // await chrome.storage.local.remove(['rules', 'battleCards', 'wikiEntries']);
    }
  }
}
```

#### 1.5 Files to Modify - Phase 1

| File | Changes |
|------|---------|
| `content/content.js` | Send PORTAL_DETECTED message, load from portalData |
| `background/background.js` | Handle PORTAL_DETECTED, manage activePortalId |
| `lib/storage.js` | Add portal-aware methods, migration logic |
| `admin/shared.js` | Update loadStorageData/saveStorageData to use portalData |
| `admin/pages/*.html` | Add portal selector to header |
| `admin/pages/*.js` | Use portal-aware storage methods |
| `sidepanel/sidepanel.js` | Load settings from portalData |

---

### Phase 2: My Libraries (Consultant Library Creation)

**Goal**: Allow consultants to create, edit, and manage their own libraries.

#### 2.1 Libraries Page Updates (admin/pages/libraries.js)

Add "My Libraries" section above pre-built libraries:

```javascript
// Two sections in library browser:
// 1. My Libraries (consultant-created)
// 2. Pre-built Libraries (from GitHub)

async function loadLibraries() {
  const { myLibraries = [] } = await chrome.storage.local.get('myLibraries');
  const prebuiltLibraries = await fetchPrebuiltLibraries();

  renderMyLibraries(myLibraries);
  renderPrebuiltLibraries(prebuiltLibraries);
}
```

#### 2.2 Create Library Flow

```javascript
// New "Create Library" button and modal
function showCreateLibraryModal() {
  // Modal with:
  // - Name input
  // - Description textarea
  // - Content selection (checkboxes for wiki/plays/banners)
  // - Item picker for each content type
}

async function createLibrary(name, description, selectedItems) {
  const { myLibraries = [] } = await chrome.storage.local.get('myLibraries');

  const newLibrary = {
    id: `lib_${Date.now()}`,
    name,
    description,
    version: "1.0.0",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    content: {
      wikiEntries: selectedItems.wikiEntries || [],
      battleCards: selectedItems.battleCards || [],
      rules: selectedItems.rules || []
    }
  };

  myLibraries.push(newLibrary);
  await chrome.storage.local.set({ myLibraries });
}
```

#### 2.3 Library Versioning

```javascript
// When editing a library, bump version
async function updateLibrary(libraryId, updates) {
  const { myLibraries = [] } = await chrome.storage.local.get('myLibraries');
  const library = myLibraries.find(l => l.id === libraryId);

  if (library) {
    // Bump version (simple semver minor bump)
    const [major, minor, patch] = library.version.split('.').map(Number);
    library.version = `${major}.${minor + 1}.0`;
    library.updatedAt = Date.now();
    Object.assign(library, updates);

    await chrome.storage.local.set({ myLibraries });
  }
}
```

#### 2.4 Export Library to File

```javascript
// Allow saving library as JSON file for backup/sharing
function exportLibrary(library) {
  const blob = new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${library.name.toLowerCase().replace(/\s+/g, '-')}.json`;
  a.click();
}

// Import library from file
async function importLibraryFromFile(file) {
  const text = await file.text();
  const library = JSON.parse(text);

  // Validate structure
  if (!library.name || !library.content) {
    throw new Error('Invalid library format');
  }

  // Generate new ID to avoid conflicts
  library.id = `lib_${Date.now()}`;
  library.importedAt = Date.now();

  const { myLibraries = [] } = await chrome.storage.local.get('myLibraries');
  myLibraries.push(library);
  await chrome.storage.local.set({ myLibraries });
}
```

#### 2.5 Files to Modify - Phase 2

| File | Changes |
|------|---------|
| `admin/pages/libraries.html` | Add "My Libraries" section, create modal |
| `admin/pages/libraries.js` | Library CRUD, export/import functions |
| `admin/pages/libraries.css` | Styling for my libraries section |

---

### Phase 3: Install Libraries to Portals

**Goal**: Install libraries to specific portals, track versions, enable updates.

#### 3.1 Install Flow

```javascript
async function installLibraryToPortal(libraryId, portalId) {
  const { myLibraries = [], portalData = {} } = await chrome.storage.local.get(['myLibraries', 'portalData']);

  const library = myLibraries.find(l => l.id === libraryId);
  if (!library) throw new Error('Library not found');

  const portal = portalData[portalId] || getEmptyPortalData();

  // Merge content (with duplicate handling)
  const mergeResult = await mergeLibraryContent(portal, library.content);

  // Track installation
  portal.installedLibraries = portal.installedLibraries || [];
  portal.installedLibraries.push({
    id: library.id,
    name: library.name,
    version: library.version,
    installedAt: Date.now()
  });

  portalData[portalId] = portal;
  await chrome.storage.local.set({ portalData });

  return mergeResult; // { added: 15, skipped: 3, updated: 0 }
}
```

#### 3.2 Duplicate Handling on Install

```javascript
async function mergeLibraryContent(portal, libraryContent, options = {}) {
  const result = { added: 0, skipped: 0, updated: 0 };

  // For each content type
  for (const type of ['wikiEntries', 'battleCards', 'rules']) {
    const existing = portal[type] || [];
    const incoming = libraryContent[type] || [];

    for (const item of incoming) {
      // Check for duplicate by ID or name/term
      const duplicate = existing.find(e =>
        e.id === item.id ||
        (type === 'wikiEntries' && e.term === item.term) ||
        (type !== 'wikiEntries' && e.name === item.name)
      );

      if (duplicate) {
        if (options.overwrite) {
          Object.assign(duplicate, item);
          result.updated++;
        } else {
          result.skipped++;
        }
      } else {
        // Generate new ID to avoid cross-portal conflicts
        const newItem = { ...item, id: `${type.slice(0, -1)}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` };
        existing.push(newItem);
        result.added++;
      }
    }

    portal[type] = existing;
  }

  return result;
}
```

#### 3.3 Update Detection

```javascript
async function checkForLibraryUpdates(portalId) {
  const { myLibraries = [], portalData = {} } = await chrome.storage.local.get(['myLibraries', 'portalData']);

  const portal = portalData[portalId];
  if (!portal?.installedLibraries) return [];

  const updates = [];

  for (const installed of portal.installedLibraries) {
    const library = myLibraries.find(l => l.id === installed.id);
    if (library && library.version !== installed.version) {
      updates.push({
        library,
        installedVersion: installed.version,
        availableVersion: library.version,
        installedAt: installed.installedAt
      });
    }
  }

  return updates;
}
```

#### 3.4 Update Options UI

When updates available, show in library card:

```html
<div class="library-card has-update">
  <h3>Agency Standard Playbook</h3>
  <p class="update-notice">Update available: v1.1.0 → v1.2.0</p>
  <div class="update-options">
    <label>
      <input type="radio" name="update-mode" value="add_new" checked>
      Add new items only (keep my modifications)
    </label>
    <label>
      <input type="radio" name="update-mode" value="full_sync">
      Full sync (reset to library version)
    </label>
  </div>
  <button class="update-btn">Update Library</button>
</div>
```

#### 3.5 Portal Switching Quick Setup

When switching to a portal with no content:

```javascript
async function onPortalChanged(newPortalId) {
  const { portalData = {} } = await chrome.storage.local.get('portalData');
  const portal = portalData[newPortalId];

  if (!portal || isEmpty(portal)) {
    // Show quick setup prompt
    showQuickSetupModal(newPortalId);
  }
}

function showQuickSetupModal(portalId) {
  // Modal showing:
  // - Available libraries (My Libraries + Pre-built)
  // - Checkboxes to select which to install
  // - "Start Empty" option
  // - Install button
}
```

#### 3.6 Files to Modify - Phase 3

| File | Changes |
|------|---------|
| `admin/pages/libraries.js` | Install, update, merge functions |
| `admin/pages/libraries.html` | Install buttons, update UI |
| `admin/shared.js` | Quick setup modal on portal switch |

---

### Phase 4: Role-Based UI & Permissions

**Goal**: Role-based UI that shows appropriate features based on user role (Admin, User, Consultant).

#### 4.1 Role-Based Feature Access

| Feature | User (View-only) | Admin | Consultant |
|---------|------------------|-------|------------|
| View wiki entries | ✓ | ✓ | ✓ |
| View plays/banners | ✓ | ✓ | ✓ |
| Create/edit content | ✗ | ✓ | ✓ |
| Delete content | ✗ | ✓ | ✓ |
| Manage settings | ✗ | ✓ | ✓ |
| Invite Users | ✗ | ✓ | ✓ |
| Portal switcher | ✗ | ✗ | ✓ |
| My Libraries | ✗ | ✗ | ✓ |
| Create libraries | ✗ | ✗ | ✓ |
| Install to portals | ✗ | ✗ | ✓ |
| Create new portals | ✗ | ✗ | ✓ |

#### 4.2 Role Display in Settings

In Settings page (read-only display for non-consultants):

```html
<div class="setting-group">
  <h3>Your Role</h3>
  <div class="setting-row">
    <div class="role-display">
      <strong id="current-role">Admin</strong>
      <span class="hint" id="role-description">Full access to create and manage content</span>
    </div>
    <!-- Upgrade prompt for Admin users -->
    <div class="upgrade-prompt" id="consultant-upgrade" style="display: none;">
      <p>Need to manage multiple portals?</p>
      <a href="#" class="upgrade-link">Upgrade to Consultant</a>
    </div>
  </div>
</div>
```

#### 4.3 Conditional UI Rendering

```javascript
async function initAdminPage() {
  const { userRole = 'admin' } = await chrome.storage.local.get('userRole');

  document.body.classList.add(`role-${userRole}`);

  // Role-based UI visibility
  if (userRole === 'user') {
    // View-only: Hide all edit buttons, create buttons, settings
    document.querySelectorAll('.edit-btn, .delete-btn, .create-btn').forEach(el => el.remove());
    document.querySelector('.settings-section')?.remove();
  }

  if (userRole !== 'consultant') {
    // Non-consultants: Hide multi-portal features
    document.querySelector('.portal-selector')?.remove();
    document.querySelector('.my-libraries-section')?.remove();
  }
}
```

```css
/* Hide edit controls for view-only users */
.role-user .edit-btn,
.role-user .delete-btn,
.role-user .create-btn,
.role-user .settings-section {
  display: none;
}

/* Hide multi-portal UI for non-consultants */
.role-admin .portal-selector,
.role-admin .my-libraries-section,
.role-admin .install-to-portal-btn,
.role-user .portal-selector,
.role-user .my-libraries-section,
.role-user .install-to-portal-btn {
  display: none;
}
```

#### 4.4 Files to Modify - Phase 4

| File | Changes |
|------|---------|
| `admin/pages/settings.html` | Role display, upgrade prompt |
| `admin/pages/settings.js` | Handle role-based features |
| `admin/shared.js` | Conditional UI init based on role |
| `admin/shared.css` | Role-specific CSS classes |

---

## Migration Strategy

### Existing Users

When existing user upgrades to multi-portal version:

1. **Detect existing data** (rules, battleCards, wikiEntries in root storage)
2. **Create 'default' portal** with existing data
3. **Set as active portal**
4. **Prompt to rename** "My Portal" to actual portal name
5. **Show portal ID detection** on next HubSpot visit to auto-populate

```javascript
// On extension update
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'update') {
    await migrateToPortalStructure();
  }
});
```

---

## UI Mockups

### Portal Selector (Admin Header)

```
┌─────────────────────────────────────────────────────────────┐
│ 🎯 RevGuide                                                 │
│                                                             │
│ Portal: [Client A - Acme Corp        ▼]                    │
│         ┌───────────────────────────────┐                  │
│         │ 🟠 Client A - Acme Corp    ✓ │                  │
│         │ 🟢 Client B - Widget Inc     │                  │
│         │ 🔵 Client C - NewCo          │                  │
│         │ ─────────────────────        │                  │
│         │ + Add Portal...              │                  │
│         └───────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

### Libraries Page (With My Libraries)

```
┌─────────────────────────────────────────────────────────────┐
│ Content Libraries                                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ MY LIBRARIES                              [+ Create Library]│
│ ┌─────────────────────────────────────────────────────────┐│
│ │ 📚 Agency Standard Playbook                    v1.2.0   ││
│ │ Our core plays and definitions for all clients          ││
│ │ 15 wiki • 8 plays • 3 banners                          ││
│ │                                                         ││
│ │ [Edit] [Export] [Install to Portal ▼]                  ││
│ └─────────────────────────────────────────────────────────┘│
│ ┌─────────────────────────────────────────────────────────┐│
│ │ 📚 SaaS Onboarding Kit                         v1.0.0   ││
│ │ Onboarding plays for SaaS clients                       ││
│ │ 5 wiki • 12 plays • 0 banners                          ││
│ │                                                         ││
│ │ [Edit] [Export] [Install to Portal ▼]                  ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ─────────────────────────────────────────────────────────  │
│                                                             │
│ PRE-BUILT LIBRARIES                                         │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ 📖 HubSpot Basics                                       ││
│ │ Core HubSpot terminology and concepts                   ││
│ │ 50 wiki entries                          [Install]      ││
│ └─────────────────────────────────────────────────────────┘│
│ ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

### Create Library Modal

```
┌─────────────────────────────────────────────────────────────┐
│ Create New Library                                     [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Name                                                        │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Agency Standard Playbook                                ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ Description                                                 │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Our core plays and definitions for all clients          ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ Include Content From Current Portal                         │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ ☑ Wiki Entries                       [Select...] (15)   ││
│ │ ☑ Plays                              [Select...] (8)    ││
│ │ ☐ Banners                            [Select...] (0)    ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│                              [Cancel]    [Create Library]   │
└─────────────────────────────────────────────────────────────┘
```

### Quick Setup on Portal Switch

```
┌─────────────────────────────────────────────────────────────┐
│ Set Up "Client C - NewCo"                              [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ This portal has no content yet. Quick setup:                │
│                                                             │
│ MY LIBRARIES                                                │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ ☑ Agency Standard Playbook                              ││
│ │   15 wiki entries, 8 plays, 3 banners                   ││
│ └─────────────────────────────────────────────────────────┘│
│ ┌─────────────────────────────────────────────────────────┐│
│ │ ☐ SaaS Onboarding Kit                                   ││
│ │   5 wiki entries, 12 plays                              ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ PRE-BUILT LIBRARIES                                         │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ ☑ HubSpot Basics                                        ││
│ │   50 wiki entries                                       ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ☐ Start Empty                                               │
│                                                             │
│                                [Skip]    [Install Selected] │
└─────────────────────────────────────────────────────────────┘
```

---

## Storage Limits Consideration

Chrome storage limits:
- `chrome.storage.local`: ~5MB (can request `unlimitedStorage` permission)
- `chrome.storage.sync`: ~100KB (not suitable for content)

With multiple portals + libraries, storage could grow significantly.

### Mitigation Options

1. **Request `unlimitedStorage` permission** in manifest.json
2. **Lazy loading**: Only load active portal's data into memory
3. **Compression**: Compress library content (but adds complexity)
4. **Future**: IndexedDB for larger datasets
5. **Future**: Cloud sync (SaaS phase)

### Manifest Update

```json
{
  "permissions": [
    "storage",
    "unlimitedStorage"  // ADD THIS
  ]
}
```

---

## Testing Checklist

### Phase 1: Portal Detection & Registry
- [ ] Portal ID extracted from HubSpot URL
- [ ] New portal detected and added to registry
- [ ] Portal selector shows all registered portals
- [ ] Switching portals loads correct content
- [ ] Migration preserves existing data
- [ ] Content script loads portal-specific data

### Phase 2: My Libraries
- [ ] Create library from current portal content
- [ ] Edit library name/description
- [ ] Add/remove items from library
- [ ] Version increments on save
- [ ] Export library to JSON file
- [ ] Import library from JSON file
- [ ] Delete library (with confirmation)

### Phase 3: Install to Portals
- [ ] Install library to current portal
- [ ] Install to different portal via dropdown
- [ ] Duplicate handling (skip vs overwrite)
- [ ] Installation tracking (version, date)
- [ ] Update detection (version comparison)
- [ ] Update with "add new only" option
- [ ] Update with "full sync" option
- [ ] Quick setup on empty portal

### Phase 4: Role-Based UI & Permissions
- [ ] Admin role: Full edit access, can invite Users
- [ ] User role: View-only, no edit buttons visible
- [ ] Consultant role: Multi-portal features visible
- [ ] Non-consultant roles: Portal selector hidden
- [ ] Non-consultant roles: My Libraries hidden
- [ ] Role persists across sessions
- [ ] Upgrade prompt shown to Admins

---

## Future Enhancements (Out of Scope)

These are documented for future consideration but not part of initial implementation:

1. **Cloud backup for libraries** - Sync My Libraries to cloud storage
2. **Library sharing** - Share libraries with other consultants
3. **Library marketplace** - Browse/install community libraries
4. **"View as User" mode** - Preview what client sees in their admin
5. **Portal groups** - Organize portals by client/industry
6. **Bulk operations** - Install/update across multiple portals at once
7. **Change tracking** - See what changed between library versions
8. **Rollback** - Revert portal to previous library version

---

## Summary

This implementation provides role-based access and multi-portal support through:

1. **Three User Roles**:
   - **Admin** (default for account creators) - Full content management within their portal
   - **User** (default for invited team members) - View-only access
   - **Consultant** (premium upgrade) - Multi-portal management and library creation

2. **Portal Registry** - Track and switch between HubSpot portals (Consultant only)
3. **Isolated Storage** - Each portal has independent content
4. **My Libraries** - Consultants create reusable content libraries (premium feature)
5. **Install Flow** - Copy library content to any portal (Consultant only)
6. **Version Tracking** - Know when updates are available
7. **Role-Based UI** - UI adapts based on user role, hiding features appropriately

The approach leverages the existing library infrastructure rather than building complex linked/synced systems, keeping implementation manageable while meeting both team collaboration and consultant agency needs.
