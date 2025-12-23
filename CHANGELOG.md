# Changelog

All notable changes to RevGuide will be documented in this file.

## [2.11.2] - 2025-12-23 - Partner Portal HubSpot Context Fix

### Fixed
- **Partner HubSpot Settings Visibility**: Partners can now see HubSpot connection card when viewing managed client portals
  - Added `isPartner` and `canManageHubSpot` flags to settings page
  - Created `setupPartnerMode()` to show HubSpot but hide team management for partners
  - Partners can view/manage HubSpot connection in client portals they have access to

- **Partner Portal HubSpot Connection**: Fixed HubSpot API returning wrong portal's connection for partners
  - Edge function now uses `active_organization_id` (not just `organization_id`) to determine which portal's connection to return
  - Partners viewing client portals now correctly get that client's HubSpot properties/fields

- **Partner Portal Context Sync**: Fixed `active_organization_id` not being updated when navigating via URL
  - `handleUrlOrgSwitch()` now ALWAYS updates `active_organization_id` in database, not just when switching from different org
  - This ensures HubSpot edge function reads the correct org context
  - Also clears HubSpot connection and properties caches on every URL-based org load

- **Cache Invalidation on Org Switch**: Added clearing of HubSpot-related caches when switching portals
  - `clearStorageDataCache()` now also clears `revguide_properties_cache` and `revguide_hubspot_connection`
  - Prevents stale properties from wrong portal persisting after switch

### Technical
- Modified `admin/pages/settings.js`: Added partner detection and `setupPartnerMode()`
- Modified `admin/shared.js`: Enhanced `handleUrlOrgSwitch()` to always sync database and clear caches
- Modified `supabase/functions/hubspot-oauth/index.ts`: Use `COALESCE(active_organization_id, organization_id)` pattern

## [2.11.1] - 2025-12-23 - Partner Content Permissions Fix

### Fixed
- **Partner RLS Policies**: Partners can now create/edit/delete content in managed client organizations
  - Updated `check_user_can_edit_content()` to include 'partner' role
  - Created `check_user_can_edit_org_content()` SECURITY DEFINER function for org-specific permission checks
  - Updated INSERT/UPDATE/DELETE policies on banners, plays, wiki_entries tables

- **Portal Matching for Partners**: Extension now correctly loads client org content when viewing their HubSpot portal
  - Fixed organizations RLS policies that blocked portal ID lookups
  - Created `user_can_view_org()` SECURITY DEFINER function to bypass RLS circular dependencies
  - Removed problematic policies that directly queried users table (caused "permission denied" errors)

- **Added Debug Logging**: Better visibility into portal matching flow
  - Content script logs URL parsing and portal ID extraction
  - Background script logs incoming getContent requests with portalId

### Technical
- New migrations: `030_partner_content_permissions.sql`, `031_fix_org_rls_for_portal_matching.sql`
- Fixed RLS policy evaluation errors caused by inline queries to users table within policies
- Organizations SELECT policies now use SECURITY DEFINER functions to avoid permission cascade failures

## [2.11.0] - 2025-12-23 - Stripe Billing Integration

### Added
- **Stripe Billing Infrastructure**: Complete billing system with Stripe Checkout and webhooks
  - Per-seat pricing for standard accounts (Starter $5/seat, Pro $10/seat, Business $20/seat)
  - Tiered Partner plans (Partner Starter $500/mo, Partner Pro $1,250/mo, Partner Enterprise $2,500/mo)
  - Free seat threshold (5 users for Starter)
  - Monthly and yearly billing intervals (17% yearly discount)

- **Billing Settings UI**: New billing section in Settings page
  - Current plan badge with usage meters (banners, wiki, plays for standard; client portals, libraries for partners)
  - "Upgrade Plan" button opens Stripe Checkout
  - "Manage Billing" button opens Stripe Customer Portal
  - Monthly/Yearly toggle with prominent styling
  - Plan selection modal with tier comparison

- **Stripe Checkout Integration**: Seamless upgrade flow
  - Create checkout sessions via Cloudflare Worker API
  - Pass organization metadata for webhook association
  - Success/cancel URL handling with toast notifications
  - Automatic customer creation in Stripe

- **Stripe Webhook Handler**: Supabase Edge Function for subscription lifecycle
  - `checkout.session.completed` - Links Stripe customer to organization
  - `customer.subscription.created` - Creates subscription record
  - `customer.subscription.updated` - Updates plan, seats, status
  - `customer.subscription.deleted` - Marks subscription as canceled
  - `invoice.paid` - Clears grace period
  - `invoice.payment_failed` - Starts 7-day grace period

- **Database Schema for Billing**: New tables and functions
  - `plan_limits` - Configuration for each plan tier (limits, pricing)
  - `subscriptions` - Per-org subscription tracking
  - `usage_counts` - Cached content counts for limit checks
  - `billing_events` - Webhook event audit log
  - `get_subscription_with_limits()` - RPC for full subscription + usage info
  - `can_create_content()` - Boolean limit check
  - `upsert_subscription()` - Create/update from webhook

### Technical
- Added billing API endpoints to `api/invite-worker.js`:
  - `POST /api/billing/create-checkout-session`
  - `POST /api/billing/create-portal-session`
  - `POST /api/billing/subscription`
- Created `supabase/functions/stripe-webhook/index.ts` for webhook handling
- Added 4 billing migrations: `026_billing_tables.sql`, `027_update_billing_pricing.sql`, `028_fix_subscription_rpc.sql`, `029_fix_subscription_rpc_v2.sql`
- Enhanced `showConfirmDialog()` with `allowHtml` and `onOpen` callback options
- Webhook checks both price and product metadata for `plan_type`
- Period dates fetched from subscription item level (Stripe API 2025-12-15 compatibility)

### Future Enhancements
- Feature gating (block content creation when over limits)
- Grace period UI warnings
- Usage analytics dashboard

## [2.10.0] - 2025-12-22 - Partner UX Improvements

### Added
- **Hierarchical Portal Selector**: Redesigned portal switcher with clear sections
  - "Your Agency" section at the top showing home organization
  - "Client Portals" section with count badge showing managed accounts
  - Visual separation between agency and client contexts
  - "+ Add Client" quick action linking to Partner Accounts page
  - Role badge (Owner/Partner/Editor/Viewer) shown next to current portal

- **Persistent Home Identity**: Partners always see their agency name in sidebar
  - User info section shows home organization name (not current portal)
  - Eliminates confusion about "who am I" when switching portals
  - Home org identified via `home_organization_id` or owner/admin role

- **Client Context Banner**: Visual indicator when viewing a client portal
  - Shows "You're viewing [Client Name] as a partner" message
  - "Back to [Agency]" button for quick return to home org
  - Subtle gradient styling with RevGuide brand colors
  - Appears at top of main content area

- **Context-Aware Partner Navigation**: Partner menu only visible in agency mode
  - Partner nav hidden when viewing a client portal
  - Use context banner to return to agency and access Partner pages
  - Clear separation between "agency mode" and "client mode"

### Technical
- Added `homeOrganization` global variable and getter in shared.js
- New `renderClientContextBanner()` function for context awareness
- Updated `loadUserOrganizations()` to identify home org
- New CSS styles for portal-switcher, section labels, context banner, and role badges
- Updated `initPortalSelector()` for new dropdown structure
- Partner nav visibility now checks `isViewingHomeOrg`

### Infrastructure
- **Shared Analytics**: Added centralized `analytics.js` for tracking code
  - `admin/analytics.js` for app.revguide.io pages
  - `website/analytics.js` for revguide.io pages
  - Auto-skips in Chrome extension context
  - Microsoft Clarity integration for session recording and heatmaps

## [2.9.0] - 2025-12-22 - Partner Library Creation

### Added
- **Partner Library Creation**: Partners can now create content libraries from their wiki entries, plays, and banners
  - "My Libraries" section on `/libraries` page (visible to partners only)
  - Create Library modal with tabbed content selection (Wiki / Plays / Banners)
  - Search and filter content within each tab
  - Select All / Deselect All buttons per content type
  - Selection summary showing counts of each content type
  - Auto version bump on library updates

- **Install Libraries to Client Organizations**: Deploy content to managed accounts
  - Install button on each library card opens organization selector
  - Click any client organization to install library content
  - Real-time status feedback during installation
  - Shows item counts after successful install

- **Collapsible Library Sections**: All three sections on `/libraries` page are now collapsible
  - Click section header to expand/collapse
  - Chevron icon rotates to indicate state
  - Smooth animation on toggle
  - All sections expanded by default

### Technical
- Added `getLibraryById()` method to `supabase.js`
- Partner library state management in `libraries.js`
- CSS styles for partner library cards, editor modal, and org selector

## [2.5.1] - 2025-12-22 - Index Tags Enhancements

### Added
- **Board View Tags**: Tags now display on Kanban/board view record cards
  - Supports Deals and Companies board views
  - Tags appear below the record title on each card
  - Virtual scroll support - tags load as new cards scroll into view
  - MutationObserver + scroll listeners + periodic fallback for reliable detection

- **Clickable Tags**: Tags are now interactive
  - Clicking a tag with a related play opens the sidepanel to that play
  - Clicking a tag without a play shows a popup with the banner message content
  - Banner popup displays with type-colored header (info, warning, success, etc.)

### Fixed
- **Properties Not Loading in Admin Panel**: Fixed banner rule conditions showing "HubSpot integration not loaded"
  - Added missing `hubspot.js` script to `banners.html`
  - Improved error handling with user-friendly messages for connection issues

- **Cloud Content Cache Invalidation**: Fixed tags not updating after changes in web admin
  - Reduced cache TTL from 5 minutes to 1 minute
  - Added cache clearing to `refreshUI` handler
  - Content script now supports `forceRefresh` parameter

- **Column Resize Tag Disappearance**: Fixed tags disappearing when resizing table columns
  - Enhanced MutationObserver to detect DOM changes from column resize
  - Tags now re-render after HubSpot reconstructs table cells

### Technical
- **Board View Detection**: `detectViewType()` checks URL and DOM for board indicators
- **Record ID Extraction**: `extractRecordIdFromCard()` reads `data-selenium-id` attribute
- **Scroll Detection**: Multiple strategies for detecting lazy-loaded board cards
- **Debug Logging**: Added condition evaluation logging to rules engine for troubleshooting

## [2.5.0] - 2025-12-22 - Index Page Tags

### Added
- **Index Page Tags**: Display visual tags on HubSpot record list/index pages
  - Tags appear underneath record names when records match banner rule criteria
  - New "Show as Tag on Index" checkbox in banner editor (Rules tab)
  - Max 3 tags per record, sorted by priority (highest first)
  - Clicking a tag opens the related play in the sidebar
  - Supports deals, contacts, companies, and tickets index pages

### Technical
- **New Module**: `content/modules/index-tags.js` for index page tag rendering
- **Batch API Fetching**: Efficient batch record property fetching via HubSpot API
- **MutationObserver**: Handles virtual scrolling on large record lists
- **Database**: Migration `025_add_show_on_index.sql` adds `show_on_index` column to banners

## [2.4.1] - 2025-12-22 - Extension Auth Fix

### Fixed
- **Extension Cloud Data**: Fixed issue where extension showed local data instead of cloud data for partners/consultants
  - Partners use `active_organization_id` instead of `organization_id`
  - Extension auth callback now uses whichever ID is set

## [2.4.0] - 2025-12-21 - Shareable Invite Links

### Added
- **Shareable Invite Links**: Create reusable links for team onboarding
  - Admins/Partners can create invite links from Settings > Team Members
  - Links have configurable usage limits (default: 10 signups)
  - Links expire after 7 days
  - New users join as Viewers automatically
  - Share with team leaders who can distribute to their teams

- **Public Join Page**: New `/join/:code` page for invite link signups
  - Validates link and shows organization name
  - Displays remaining spots
  - Simple signup form (name, email, password)
  - **Google & Microsoft SSO**: One-click signup with OAuth providers
  - Auto-login after successful signup

### Fixed
- **SSO Login Redirect**: Fixed issue where users had to click SSO button twice after OAuth redirect
  - OAuth callback now processed before session check
  - Added `onAuthStateChange` listener for reliable session detection
  - Join page OAuth now redirects to `/login` which handles invite signup

- **User Deletion**: Removing a team member now fully deletes their account
  - Previously only set `organization_id` to null, leaving auth account intact
  - New `/api/delete-user` endpoint deletes from both `users` table and `auth.users`
  - Deleted users can now sign up fresh via invite links

### Technical
- **Database**: New `invite_links` and `invite_link_signups` tables
  - Migration: `024_shareable_invite_links.sql`
  - RLS policies for admin management and public validation
  - Helper functions: `generate_invite_code()`, `get_invite_link_by_code()`, `consume_invite_link()`

- **API**: New endpoints for invite link signup and user management
  - `POST /api/signup-invite-link` - Email/password signup
  - `POST /api/signup-invite-link-oauth` - OAuth signup (Google/Microsoft)
  - `POST /api/delete-user` - Full user deletion (profile + auth)
  - Validates invite code, creates user, consumes link

- **Files Modified/Created**:
  - `supabase/migrations/024_shareable_invite_links.sql` - Database schema
  - `admin/supabase.js` - Added invite link methods
  - `admin/pages/settings.html` - Invite link UI section
  - `admin/pages/settings.js` - Invite link management logic
  - `admin/pages/join.html` - Public join page
  - `admin/pages/join.js` - Join page logic
  - `api/invite-worker.js` - New signup endpoint
  - `vercel.json` - Added `/join/:code` route

---

## [2.3.0] - 2025-12-21 - Google & Microsoft SSO

### Added
- **Google SSO**: Users can now sign in with their Google account
  - One-click authentication using existing Google credentials
  - Auto-accepts pending invitations for matching email addresses
  - New OAuth users redirected to onboarding if no invitation exists

- **Microsoft SSO**: Users can now sign in with their Microsoft/Azure AD account
  - Supports both work/school and personal Microsoft accounts
  - Publisher verification configured for `app.revguide.io` domain
  - Same invitation auto-accept flow as Google

- **Extension Sidebar SSO Buttons**: Direct SSO login from the extension
  - "Sign in with Google" and "Sign in with Microsoft" buttons in sidebar
  - Clicking opens OAuth flow directly (skips login page)
  - Streamlined onboarding: Install → Click SSO → Done

### Fixed
- **Close Tab Button**: Auth callback page now properly closes after successful login
  - Extension uses `chrome.tabs.remove()` instead of `window.close()`
  - Falls back to redirecting to HubSpot if close fails

### Technical
- **Files Modified**:
  - `admin/supabase.js` - Added `signInWithGoogle()`, `signInWithMicrosoft()` methods
  - `admin/pages/login.html/js` - OAuth buttons, auto-start OAuth from `provider` param
  - `admin/pages/signup.html` - OAuth buttons (hidden for invite flows)
  - `sidepanel/sidepanel.html/css/js` - SSO buttons in logged-out state
  - `admin/pages/extension-logged-in.js` - CLOSE_AUTH_TAB message handling
  - `background/background.js` - CLOSE_AUTH_TAB handler

### Configuration Required
- Google OAuth: Configure in Google Cloud Console + Supabase Dashboard
- Microsoft OAuth: Configure in Azure Portal + Supabase Dashboard
- See setup guide in conversation history

---

## [2.2.2] - 2025-12-21 - Partner Removal Notification

### Added
- **Partner Removal Email**: Partners now receive an email when removed from an organization
  - New API endpoint: `POST /api/notify-partner-removed`
  - Email includes organization name and admin who removed them
  - Purple-themed email to distinguish from green "joined" notifications
  - Fire-and-forget notification (non-blocking)

---

## [2.2.1] - 2025-12-21 - TipTap Editor Image URL-Only

### Changed
- **TipTap Image Insert**: Removed file upload, now URL-only
  - Prevents base64-encoded images from bloating database records
  - Users provide external image URLs instead of uploading files
  - Simplified modal dialog with just URL and alt text inputs
  - Auto-focuses URL input for better UX

---

## [2.2.0] - 2025-12-21 - Consultant to Partner Terminology Rename

### Changed
- **Terminology Update**: Renamed all "Consultant" terminology to "Partner" throughout the codebase
  - User-facing labels, email templates, UI text
  - Database tables: `consultant_libraries` → `partner_libraries`, `consultant_access_requests` → `partner_access_requests`
  - Database columns: `consultant_user_id` → `partner_user_id`
  - Role values: `'consultant'` → `'partner'` in all tables
  - JavaScript variables/functions updated to use partner terminology
  - CSS classes renamed (`.consultant-*` → `.partner-*`)

### Added
- **Partner Joined Notification**: Admins now receive an email when an invited partner accepts and joins the organization
  - New API endpoint: `POST /api/notify-partner-joined`
  - Email includes partner name, email, and link to team settings
  - `getOrganizationAdmins()` helper function for fetching admin emails

### Technical
- **Database Migration**: `023_rename_consultant_to_partner.sql`
  - Renames tables and columns
  - Migrates role values from 'consultant' to 'partner'
  - Updates CHECK constraints to only allow 'partner' (removes 'consultant')
  - Creates new RPC functions with partner naming
  - Updates RLS policies for renamed tables

- **Files Modified**:
  - `admin/supabase.js` - Table references, function logic
  - `admin/shared.js` - `isConsultantUser` → `isPartnerUser`, `isConsultant()` → `isPartner()`
  - `admin/pages/invite.js` - Invitation flow, partner joined notification
  - `admin/pages/settings.js` - Access request handling with partner fields
  - `admin/pages/partner-home.js` - Updated variable references
  - `api/invite-worker.js` - Email templates, API handlers (with backward compatibility)
  - `admin/pages/invite.html`, `settings.html` - CSS class updates
  - `admin/shared.css` - Role indicator classes
  - `website/styles-v3.css`, `index-v3.html`, `script-v3.js` - Website partner section
  - `docs/AI_CONTEXT.md`, `docs/ARCHITECTURE.md` - Documentation updates

---

## [2.1.0] - 2025-12-21 - Org-Aware URLs & Extension Auto-Match

### Added
- **Org-Aware Admin URLs**: Admin panel now supports URLs with short org ID prefix
  - `/a1b2c3d4/banners`, `/a1b2c3d4/wiki`, etc. (first 8 chars of UUID)
  - Enables deep linking to specific organization's content
  - Backward compatible - `/banners` still works (uses active org)
  - Sidebar nav links automatically include short org ID
  - Portal selector redirects to org-prefixed URLs
  - Excludes partner/settings pages from org-aware URLs (identity pages, not org-specific)

- **Extension Auto-Match**: Extension automatically detects HubSpot portal and shows correct library
  - Extracts portal ID from HubSpot URL (`/contacts/12345678/...`)
  - Queries Supabase to find matching organization by `hubspot_portal_id`
  - Silently loads that organization's content (no prompt)
  - Falls back to user's default org if no match found
  - CRM-agnostic design supports future Salesforce, Attio integration

### Technical
- **Files Modified**:
  - `vercel.json` - Added 8-char hex route patterns for org-prefixed URLs
  - `admin/shared.js` - Added URL parsing (`getOrgIdFromUrl`, `getShortOrgId`, `getCurrentPagePath`, `buildOrgAwareUrl`, `isOrgAwarePath`), auto-switch handling, org-aware navigation
  - `background/background.js` - Added `getOrgByCrmPortalId()` for portal matching, updated `getContent()` with org-specific caching
  - `content/content.js` - Added CRM type detection, passes portal context when loading data

---

## [2.0.1] - 2025-12-21 - Partner Display Fix

### Fixed
- **Team Members table**: Partner users now display name/email correctly after accepting access request
  - Root cause: RLS policy on `users` table only allowed viewing own record, blocking the join when fetching partner data
  - Added `can_view_user()` helper function to check org membership
  - New policy allows viewing users who are members of your organization

### Technical
- **Files Modified**:
  - `supabase/migrations/022_fix_users_org_visibility.sql` - New migration adding org-based user visibility
  - `admin/supabase.js` - Added null check filter in `getTeamMembers()` partner transformation

---

## [2.0.0] - 2025-12-21 - Remove Nango, Direct HubSpot OAuth

### Changed
- **OAuth Flow**: Removed Nango middleware, now using direct HubSpot OAuth via RevGuideHubSpot class
- **Simplified Architecture**: Fewer external dependencies for authentication

### Removed
- `admin/nango.js` - Nango OAuth helper module
- `supabase/functions/nango-callback/` - Nango callback edge function
- `docs/NANGO_SETUP.md` - Nango setup documentation

### Technical
- **Files Modified**:
  - `admin/pages/home.js` - Updated OAuth callback handling
  - `manifest.json` - Version bump to 2.0.0
  - `docs/AUTHENTICATION.md` - Updated for direct OAuth flow
  - `docs/MULTI_PORTAL_DEV.md` - Removed Nango references
  - `CLAUDE.md` - Added project identity section

---

## [2.8.7] - 2025-12-20 - Partner URL Restructure

### Changed
- **URL Structure**: Reorganized partner page URLs for cleaner hierarchy
  - `/partner-home` → `/partner/home`
  - `/managed-accounts` → `/partner/accounts`
- All navigation links, redirects, and documentation updated to use new paths

### Technical
- **Files Modified**:
  - `vercel.json` - Updated rewrites for new URL paths
  - `admin/pages/*.html` - Updated sidebar navigation links (8 files)
  - `admin/pages/signup.html` - Updated partner redirect URLs
  - `admin/pages/partner-home.js` - Updated client list links
  - `admin/pages/settings.html` - Updated partner dashboard button
  - `docs/AI_CONTEXT.md` - Updated URL references

---

## [2.8.6] - 2025-12-20 - Partner Access Requests

### Added
- **Partner Access Requests**: Partners can now request access to client organizations by entering a client admin's email address
  - Email-based request flow with user enumeration prevention (always shows neutral success message)
  - Partners can submit requests from the Partner Dashboard > Access Requests tab
  - Client admins receive email notification and can approve/decline from Settings > Partner Access Requests section
  - Partners receive email notification when requests are approved or declined
  - Re-requesting after decline updates the existing request instead of creating a duplicate
  - Approved partners now appear in Team Members table with "partner" role badge
  - Admins can revoke partner access via the remove button in Team Members

### Fixed
- RPC field naming: Use `request_id` instead of `id` to match database RPC return values
- Email notification field names: Use `consultantEmail` to match worker endpoint expectations
- Empty response handling in worker: Properly handle 204 No Content responses from Supabase PATCH

### Technical
- **Files Modified**:
  - `api/invite-worker.js` - Added `/api/request-partner-access` endpoint with server-side validation
  - `admin/pages/partner.html` - Added request access form UI
  - `admin/pages/partner.js` - Added form handling and submission logic
  - `admin/pages/settings.html` - Added Partner Access Requests section for admins
  - `admin/pages/settings.js` - Added access request loading, rendering, approve/decline methods
  - `admin/supabase.js` - Updated `getTeamMembers()` to include partners from `organization_members` table

---

## [2.0.0] - 2025-12-20 - Chrome Web Store Compliance

### Changed
- **Extension renamed**: Changed from "RevGuide (Beta)" to "RevGuide"

### Fixed
- **Manifest V3 Compliance**: Removed remotely hosted code to comply with Chrome Web Store requirements
  - Removed CDN fallback URL from `admin/supabase.js` - extension now uses only the local Supabase bundle
  - Removed HelpScout Beacon from 8 admin pages (was dynamically loading remote scripts)

### Technical
- **Files Modified**:
  - `manifest.json` - Updated extension name
  - `admin/supabase.js` - Removed jsdelivr CDN URL, refactored to use local bundle only
  - `admin/pages/banners.html` - Removed HelpScout Beacon
  - `admin/pages/home.html` - Removed HelpScout Beacon
  - `admin/pages/libraries.html` - Removed HelpScout Beacon
  - `admin/pages/partner-home.html` - Removed HelpScout Beacon
  - `admin/pages/partner.html` - Removed HelpScout Beacon
  - `admin/pages/plays.html` - Removed HelpScout Beacon
  - `admin/pages/settings.html` - Removed HelpScout Beacon
  - `admin/pages/wiki.html` - Removed HelpScout Beacon

---

## [2.8.5] - 2025-12-20 - Wiki Nav Auto-Scroll

### Added
- **Auto-scroll to entry in nav tree**: When navigating via URL with `?edit=<id>` parameter, the wiki nav pane now automatically expands parent nodes and scrolls to show the selected entry

### Technical
- **Files Modified**:
  - `admin/pages/wiki.js` - Added `shouldScrollToEntry` flag and `scrollToSelectedEntry()` method

---

## [2.8.4] - 2025-12-20 - Fix Edit Links for Web App

### Fixed
- **Edit Links Now Open Web App**: When logged in, clicking "Edit" on wiki tooltips, banners, and plays now correctly opens the web admin panel at app.revguide.io instead of the local extension pages
- **Clean URL Routes**: Edit links now use clean routes (`/wiki?edit=...`) instead of full paths (`/admin/pages/wiki.html?edit=...`)

### Technical
- **Files Modified**:
  - `content/content.js` - Pass `isAuthenticated` to settings for modules
  - `content/modules/wiki.js` - Use web app URL when authenticated
  - `content/modules/banners.js` - Use web app URL when authenticated
  - `sidepanel/sidepanel.js` - Use web app URL when authenticated

---

## [2.8.3] - 2025-12-20 - TipTap Image Insert

### Added
- **Image Insert Button**: New toolbar button in TipTap editor for inserting images
  - Upload tab with drag-and-drop or click-to-browse file picker
  - URL tab for pasting external image URLs
  - Alt text input for accessibility
  - Preview of uploaded images before inserting
  - Images uploaded via file picker are embedded as base64

### Technical
- **Files Modified**:
  - `admin/lib/tiptap-editor.js` - Added image button, action handler, and modal dialog
  - `admin/shared.css` - Added modal overlay and upload zone styles

---

## [2.8.2] - 2025-12-19 - Partner Home Page

### Added
- **Partner Home Page** (`/partner-home`): New dedicated home page for partner accounts
  - 3-step onboarding timeline (Install Extension → Connect to Client → Deploy Content)
  - Progress ring showing completion status
  - Mini-stats for clients, libraries, and deployments
  - Client quick-access list with color-coded portal indicators
  - Partner resources section with quick links

- **Sidebar Partner Dropdown Navigation**: Partner nav item now expands to show sub-items
  - "Home" links to `/partner-home`
  - "Managed Accounts" links to `/managed-accounts` (renamed from `/partner`)
  - Dropdown toggle with arrow indicator
  - Auto-expands when on partner pages

### Changed
- **Route Rename**: `/partner` → `/managed-accounts`
  - Partner dashboard page now accessible at `/managed-accounts`
  - All internal links updated to use new route
  - Partner signup redirects to `/partner-home` instead of `/partner`

### Technical
- **Files Added**:
  - `admin/pages/partner-home.html` - Partner home page structure
  - `admin/pages/partner-home.css` - Partner home styles
  - `admin/pages/partner-home.js` - Partner home logic

- **Files Modified**:
  - `vercel.json` - Added `/partner-home` route, renamed `/partner` to `/managed-accounts`
  - `styles/components.css` - Added `.nav-group` dropdown styles
  - `admin/shared.js` - Added nav-group toggle handlers, updated partner nav visibility
  - `admin/pages/signup.html` - Partner redirect now goes to `/partner-home`
  - `admin/pages/settings.html` - Updated partner dashboard link to `/managed-accounts`
  - All sidebar HTML files - Updated with new nav-group dropdown structure

---

## [2.8.1] - 2025-12-19 - Home Onboarding UI Refresh

### Changed
- **Home Page Redesign**: Refreshed onboarding UI with improved visual hierarchy
  - Replaced linear progress bar with circular progress ring showing completion status
  - Consolidated stats into compact inline mini-stats within progress hero section
  - Replaced stacked step cards with vertical timeline layout
  - Added visual "active" state highlighting for the next incomplete step
  - Completed steps show green checkmarks on timeline dots
  - More space-efficient design with better information density

### Technical
- **Files Modified**:
  - `admin/pages/home.html` - New progress hero and timeline layout
  - `admin/pages/home.css` - Progress ring, timeline, and mini-stats styles
  - `admin/pages/home.js` - SVG progress ring updates, active step highlighting

- **CSS Changes**:
  - Added `.progress-hero` section with SVG progress ring
  - Added `.mini-stats` compact stat display
  - Added `.onboarding-timeline` vertical timeline with dots
  - Added `.timeline-step` with `.completed` and `.active` states
  - Added `.btn-ghost` button variant
  - Preserved legacy `.onboarding-steps` styles for member view

- **JS Changes**:
  - Added `updateProgressRing()` helper for SVG stroke-dashoffset animation
  - Added `highlightNextStep()` to mark first incomplete step as active
  - All existing step detection logic unchanged

---

## [2.8.0] - 2025-12-19 - Partner Account System

### Added
- **Partner Account Type**: New account type for agencies/freelancers managing multiple client portals
  - `account_type` column on users table: `'standard'` or `'partner'`
  - `home_organization_id` tracks partner's agency organization
  - Partners have their own agency org plus `partner` role in client organizations

- **Partner Dashboard**: New dedicated page for partners (`/partner`)
  - Stats overview: Client count, Library count, Pending requests
  - **My Clients** tab: Grid of client portals with "Manage Portal" buttons
  - **My Libraries** tab: View and manage reusable content libraries
  - **Access Requests** tab: Track pending access requests to client portals
  - Quick portal switching from dashboard

- **Partner Invitation Flow**: Admins can invite partners to their organization
  - New `partner` role in invitation system (distinct from legacy `consultant`)
  - Partner-specific email templates with appropriate messaging
  - Auto-connect: Existing partners automatically added when invited (skip signup)
  - New partners go through dedicated signup flow creating their agency org

- **Partner Signup Flow**: Dedicated signup for partner invitations
  - Detects `role=partner` or `invitation_type=partner` in invite URL
  - Partner-specific messaging and benefits display
  - Editable "Agency Name" field (not locked to inviting org)
  - Creates: auth user + agency org + user profile + client org membership
  - Redirects to Partner Dashboard after signup

- **Convert to Partner**: Existing admins can become partners
  - "Partner Account" section in Settings page
  - "Become a Partner" option with agency name input
  - Creates agency organization, updates `account_type` to `partner`
  - "Sign Up with a New Account" option signs out and redirects to partner signup

- **New Partner Signup Flow**: Create partner accounts without invitation
  - `/signup?new_partner=true` shows partner-specific signup UI
  - Creates auth user, agency organization, and partner profile
  - Works both from Settings page and direct URL access
  - API endpoint supports signup with or without invitation token

- **Partner Status Display**: Partners see their status in Settings
  - Partner badge and home organization name
  - Client portal count
  - Link to Partner Dashboard

### Changed
- **Navigation**: Partner Dashboard replaces legacy Clients page
  - Partner Dashboard shown for users with `account_type='partner'`
  - Clients page hidden for partners (use Partner Dashboard instead)
  - Non-partners with multiple orgs still see Clients nav

- **Invitation Role Options**: Settings now offers `partner` role instead of `consultant`
  - "Partner" role description: "External partner with limited access"
  - Partners can edit content but cannot manage team members

### Removed
- **Legacy Clients Page**: Deleted `clients.html` and `clients.js`
  - Functionality replaced by Partner Dashboard
  - Partners get dedicated dashboard, non-partners don't need portal switching UI

### Technical
- **Database Migration**: `021_partner_accounts.sql`
  - `account_type` and `home_organization_id` columns on `users`
  - `partner` added to role constraints on `organization_members`, `invitations`
  - Helper functions: `user_is_partner()`, `get_partner_home_org()`, `get_partner_clients()`, `get_partner_stats()`
  - `auto_connect_partner()` for existing partner auto-acceptance
  - `convert_to_partner_account()` for admin conversion
  - Migration of existing consultants to partner account type

- **API Endpoints** (invite-worker.js):
  - `POST /api/signup-partner` - Partner-specific signup (works with or without invitation token)
  - `POST /api/invite-partner` - Partner invitation with auto-connect
  - `POST /api/notify-partner-auto-connect` - Notification for auto-connected partners
  - Partner email templates: invitation and auto-connect notifications
  - Automatic slug generation for agency organizations

- **Database Methods** (supabase.js):
  - `isPartner()` - Check if current user is a partner
  - `getPartnerHomeOrg()` - Get partner's agency organization
  - `getPartnerClients()` - Get client portals with partner role
  - `getPartnerStats()` - Get partner dashboard statistics
  - `convertToPartner(agencyName)` - Convert admin account to partner
  - `createPartnerInvitation(email, orgId)` - Invite partner with auto-connect

- **Files Added**:
  - `admin/pages/partner.html` - Partner Dashboard page
  - `admin/pages/partner.js` - Partner Dashboard logic
  - `supabase/migrations/021_partner_accounts.sql` - Database migration

- **Files Modified**:
  - `admin/shared.js` - Partner nav visibility, `partner` role label
  - `admin/supabase.js` - Partner database methods
  - `admin/pages/signup.html` - Partner invitation detection and flow
  - `admin/pages/settings.html` - Partner Account section UI
  - `admin/pages/settings.js` - Partner conversion and status logic
  - `api/invite-worker.js` - Partner endpoints and email templates
  - All HTML pages - Added Partner Dashboard nav item

- **Files Removed**:
  - `admin/pages/clients.html` - Replaced by Partner Dashboard
  - `admin/pages/clients.js` - Replaced by Partner Dashboard

### Migration Notes
- Existing users with `consultant` role in `organization_members` are migrated to `partner` role
- Existing consultants (users belonging to multiple orgs) are migrated to `account_type='partner'`
- `user_is_consultant()` function updated to check for both `consultant` and `partner` roles for backward compatibility

---

## [2.7.5] - 2025-12-18 - Consultant Invitation Flow Fixes

### Fixed
- **Invitation Acceptance RLS Recursion**: Fixed "infinite recursion detected in policy for relation 'organization_members'" error that blocked invitation acceptance
  - Created SECURITY DEFINER helper functions to break RLS recursion cycle
  - `get_user_org_ids(auth_uid)` - Returns user's org memberships, bypassing RLS
  - `get_user_id(auth_uid)` - Returns user's internal ID from auth ID
  - `user_is_org_admin(auth_uid, org_id)` - Checks admin status for specific org

- **Organization Name Display**: Fixed "Unknown Organization" appearing in invitation emails and acceptance page
  - Added RLS policy allowing users to view organizations they're invited to (before accepting)
  - Users can now see org details via valid invitation token before becoming members

- **Inviter Name in Emails**: Invitation emails now show who sent the invite
  - "John Smith has invited you to join..." instead of generic "You've been invited..."
  - Improved email personalization and trust

### Technical
- **Database Migrations**:
  - `019_fix_org_members_recursion.sql` - SECURITY DEFINER functions for RLS
  - `020_allow_org_view_for_invites.sql` - Policy for viewing invited-to organizations

- **Files Modified**:
  - `admin/pages/settings.js` - Passes inviter name to invitation email API
  - `api/invite-worker.js` - Email templates accept and display inviter name
  - `admin/pages/invite.js` - Debug logging for invitation flow troubleshooting

### Key Learning
RLS policies that reference their own table can cause infinite recursion. Solution: Create `SECURITY DEFINER` functions that bypass RLS to perform internal checks, breaking the recursion cycle while maintaining security.

---

## [2.7.4] - 2025-12-18 - Web App Data Operations Fix

### Fixed
- **Import Field Mapping**: JSON import now correctly maps camelCase fields to Supabase snake_case columns
  - Added `mapWikiToSupabase()`, `mapBannerToSupabase()`, `mapPlayToSupabase()` functions
  - Import no longer fails with 400 Bad Request errors

- **Bulk Wiki Delete**: "Select All > Delete" now actually deletes entries from Supabase
  - Previously only removed from local array, entries reappeared on refresh
  - Now calls `RevGuideDB.deleteWikiEntry()` for each selected entry

- **Library Installation**: Installing content libraries now saves entries to Supabase
  - Previously showed success message but entries weren't persisted
  - Now uses `mapWikiToSupabase()` before inserting to database
  - Stores actual Supabase UUIDs (not local IDs) for uninstall tracking

- **Library Uninstall**: Uninstalling libraries now deletes the associated wiki entries
  - Previously only removed from installed list, entries remained in database
  - Now deletes each entry by its Supabase UUID

### Technical
- **Files Modified**:
  - `admin/shared.js` - Added `mapWikiToSupabase()`, `mapBannerToSupabase()`, `mapPlayToSupabase()` exports; improved delete logging
  - `admin/pages/wiki.js` - Bulk delete now uses `RevGuideDB.deleteWikiEntry()` in web context
  - `admin/pages/libraries.js` - Install/uninstall now use Supabase directly; track actual entry IDs
  - `admin/pages/settings.js` - Fixed duplicate variable declaration

### Pattern: Web vs Extension Context
All data operations now follow this pattern:
```javascript
if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
  // Web context: Use Supabase directly
  await RevGuideDB.createWikiEntry(mappedEntry);
} else {
  // Extension context: Use Chrome storage
  await AdminShared.saveStorageData({ wikiEntries });
}
```

---

## [2.7.3] - 2025-12-18 - Multi-Portal Role Fixes

### Fixed
- **Organization Name Display**: Fixed issue where organization names weren't displaying in sidebar and settings
  - `currentOrganization` now populated from `userOrganizations` data when direct query fails
  - Organization name appears correctly in portal selector and sidebar

- **Role Permissions Use Org-Specific Role**: Role helper functions now use per-organization roles
  - `isAdmin()`, `isMember()`, `canEditContent()`, `getUserRole()` now call `getEffectiveRole()`
  - `getEffectiveRole()` checks `organization_members` table for current org's role
  - Consultants can no longer access admin features (like team invites) in portals where they're not admins
  - Falls back to `currentUser.role` when org membership data unavailable

### Removed
- **Add Portal Button**: Removed non-functional "Add Portal..." button from portal selector dropdown

### Technical
- **Files Modified**:
  - `admin/shared.js` - Added `getEffectiveRole()`, updated role helpers, removed `showAddPortalModal()`

---

## [2.7.2] - 2025-12-18 - Import/Export Fix & Mode Selection

### Fixed
- **JSON Import Now Works in Web App**: Fixed critical bug where import showed success but data wasn't saved to Supabase
  - `saveStorageData()` now properly bulk-inserts data to Supabase in web context
  - Previously only logged "will be synced individually" and returned without saving

### Added
- **Import Mode Selection**: New modal when importing JSON with two options:
  - **Replace All**: Deletes existing content before importing (clean sync from primary source)
  - **Merge / Add**: Adds imported content alongside existing data (may create duplicates)
- **Import Summary**: Modal shows count of wiki entries, banners, and plays in the file before importing
- **Import Results**: Success toast now shows specific counts of imported items
- **Error Reporting**: Partial failures logged to console with item-specific error messages

### Technical
- **Files Modified**:
  - `admin/shared.js` - `saveStorageData()` now accepts `options.importMode` ('replace' | 'merge')
  - `admin/pages/settings.js` - New `confirmImport()` method with modal flow, replaces browser `confirm()`
  - `admin/pages/settings.html` - Added import modal with radio options
  - `admin/shared.css` - Added `.radio-option`, `.import-summary` styles

---

## [2.7.1] - 2025-12-18 - Import Security (XSS Sanitization)

### Security
- **XSS Protection for JSON Import**: Added DOMPurify sanitization to prevent cross-site scripting attacks from malicious import files
  - Sanitizes HTML content in wiki entry `definition` fields
  - Sanitizes HTML content in play/battle card `body` fields
  - Sanitizes HTML content in banner `message` fields
  - Strips dangerous elements (`<script>`, `onerror=`, `javascript:` URLs) while preserving safe formatting

### Added
- **DOMPurify Library** (`admin/lib/purify.min.js`) - Industry-standard HTML sanitizer (v3.2.2)
- **`sanitizeImportData()` function** in `admin/shared.js` - Sanitizes imported data before saving

### Technical
- DOMPurify loaded in settings.html before other scripts
- Sanitization runs in `confirmImport()` before data is passed to `saveStorageData()`
- Graceful fallback if DOMPurify is not loaded (logs warning, continues without sanitization)

---

## [2.7.0] - 2025-12-18 - Multi-Portal Support (Phase 0 & 1)

### Added
- **Multi-Portal Foundation** - Database and UI support for managing multiple HubSpot portals
  - New `consultant` role for agency/consultant users
  - Users can now belong to multiple organizations with different roles per org
  - `organization_members` junction table enables many-to-many user-organization relationships
  - `active_organization_id` column tracks which portal the user is currently viewing

- **Portal Switching UI** - Portal selector dropdown appears in sidebar when user has 2+ portals
  - Color-coded portal indicators for visual distinction
  - Shows organization name and role for each portal
  - "Add Portal" button to connect additional HubSpot portals
  - Switching portals reloads content for the selected organization

- **Consultant Libraries (Database Foundation)** - Tables for reusable content packages
  - `consultant_libraries` table stores library metadata and content (JSON)
  - `library_installations` table tracks which libraries are installed in which orgs
  - Version tracking for installed libraries

- **New RevGuideDB Methods**:
  - `getUserOrganizations()` - Get all portals user has access to
  - `switchOrganization(orgId)` - Switch active portal context
  - `isConsultant()` - Check if user has consultant privileges
  - `joinOrganization()` / `leaveOrganization()` - Manage org memberships
  - `getMyLibraries()` / `createLibrary()` / `updateLibrary()` / `deleteLibrary()` - Library CRUD
  - `installLibrary()` / `getInstalledLibraries()` / `checkLibraryUpdates()` - Library installation

- **New Database Functions** (PostgreSQL):
  - `get_user_organizations(auth_uid)` - Returns all orgs a user can access
  - `user_has_org_access(auth_uid, org_id)` - Check access to specific org
  - `user_can_edit_in_org(auth_uid, org_id)` - Check edit permissions
  - `user_is_consultant(auth_uid)` - Check consultant status

### Technical
- **Database Migration**: `013_multi_portal_support.sql`
  - Adds `consultant` to user role constraint
  - Creates `organization_members` table with RLS policies
  - Creates `consultant_libraries` table with RLS policies
  - Creates `library_installations` table with RLS policies
  - Updates `get_user_organization_id()` to use active org
  - Updates `check_user_can_edit_content()` for membership-based permissions

- **Files Modified**:
  - `admin/supabase.js` - Added multi-portal API methods
  - `admin/shared.js` - Added portal selector rendering, switching logic, consultant check
  - `admin/shared.css` - Added portal selector styles, role indicator badges for consultant/editor/viewer

### Note
- This is Phase 0 & 1 of multi-portal development
- Phase 2 (My Libraries UI) and Phase 3 (Library installation UI) coming next
- See `docs/MULTI_PORTAL_DEV.md` for full implementation plan

---

## [2.6.7] - 2025-12-18 - Search & Object Filters for Plays and Banners

### Added
- **Search Clear Button**: Added (x) clear button to search inputs on Plays and Banners pages
  - Button appears when search field has text (matches Wiki page behavior)
  - Clicking clears search and refreshes results instantly
- **Object Filter Dropdown**: Added "All Objects" filter to both Plays and Banners pages
  - Filter options: All Objects, Contacts, Companies, Deals, Tickets
  - Entries with no object type set (applies to all) appear in every filter
  - Banners: Handles both `objectType` string and `objectTypes` array formats

### Technical
- **Files Modified**:
  - `admin/pages/plays.html` - Added search wrapper and object filter dropdown
  - `admin/pages/banners.html` - Added search wrapper and object filter dropdown
  - `admin/pages/plays.js` - Added `clearSearch()` method, event listeners, and object filtering
  - `admin/pages/banners.js` - Added `clearSearch()` method, event listeners, and object filtering with singular/plural normalization
  - `admin/shared.css` - Added `.search-input-wrapper` and `.search-clear-btn` styles (moved from wiki-specific to shared)

---

## [2.6.6] - 2025-12-18 - View Modal Redesign

### Changed
- **Redesigned View-Only Modals**: New light header design for non-editor users viewing plays and banners
  - Light tinted header bar with type-specific colors matching existing tag/badge styling
  - Type icon and label prominently displayed in header
  - Clean body layout with title, subtitle, and content sections
  - Meta row showing object type, conditions count, and status
  - Consistent design language across both Plays and Banners modals

### Visual Design
- **Play Types** (light backgrounds with dark text):
  - Competitor: Amber tint (#fef3c7) with brown text (#92400e)
  - Objection: Pink tint (#fce7f3) with pink text (#9d174d)
  - Tip: Blue tint (#dbeafe) with blue text (#1e40af)
  - Process: Green tint (#d1fae5) with green text (#065f46)
- **Banner Types** (light backgrounds with dark text):
  - Info: Blue tint (#dbeafe) with blue text (#1e40af)
  - Success: Green tint (#d1fae5) with green text (#065f46)
  - Warning: Amber tint (#fef3c7) with brown text (#92400e)
  - Error: Red tint (#fee2e2) with red text (#991b1b)
  - Embed: Purple tint (#ede9fe) with purple text (#5b21b6)

### Technical
- **Files Modified**:
  - `admin/shared.css` - Added new `.view-details-*` CSS classes for modal styling
  - `admin/pages/plays.js` - Rewrote `viewPlayDetails()` method with new design
  - `admin/pages/banners.js` - Rewrote `viewRuleDetails()` method with new design
- **New CSS Classes**:
  - `.view-details-type-header` with type-specific modifiers
  - `.view-details-body`, `.view-details-title`, `.view-details-subtitle`
  - `.view-details-section`, `.view-details-content-box`
  - `.view-details-media-box` for embed/media content display
  - `.view-details-meta-row` for footer metadata

---

## [2.6.5] - 2025-12-18 - Compact Card Layout for Banners & Plays

### Changed
- **Consistent Display Format**: Banners and Plays now both use a compact card layout
  - Replaced table view on Banners page with horizontal compact cards
  - Replaced grid cards on Plays page with horizontal compact cards
  - Both pages now have consistent visual language
- **Compact Card Design**:
  - Icon on left with type-specific color background
  - Title and type badge in header row
  - Description/subtitle below title
  - Metadata (object type, conditions count) on right
  - Dropdown menu (⋮) for Edit/Delete/Toggle actions (editors only)
  - Status badge (Active/Inactive) for banners
- **Click-to-Open Behavior**:
  - Clicking anywhere on a card opens the editor (for editors/admins)
  - Clicking anywhere on a card opens view-only modal (for viewers)
  - Action menu available via ⋮ button (editors only)
- **View-Only Mode**: Non-editor users see cards without action menus; clicking opens read-only view

### Technical
- **Files Modified**:
  - `admin/shared.css` - Added `.compact-card-*` CSS classes for new layout
  - `admin/shared.js` - Added `stripHtml()` helper function
  - `admin/pages/banners.html` - Replaced table with `.compact-card-list` container
  - `admin/pages/banners.js` - Rewrote `renderRules()` to render compact cards
  - `admin/pages/plays.html` - Replaced `.cards-grid` with `.compact-card-list` container
  - `admin/pages/plays.js` - Rewrote `renderPlays()` to render compact cards

---

## [2.6.4] - 2025-12-18 - Wiki Search Clear Button

### Added
- **Wiki Search Clear Button**
  - Added (x) clear button to wiki search input
  - Button appears when search field has text
  - Clicking clears search and refreshes results instantly
  - Improves UX by eliminating need to manually select and delete text

### Technical
- **Files Modified**:
  - `admin/pages/wiki.html` - Added search input wrapper and clear button
  - `admin/pages/wiki.css` - Added styles for search wrapper and clear button
  - `admin/pages/wiki.js` - Added `clearSearch()` method and event listener

---

## [2.6.3] - 2025-12-18 - Duplicate Trigger Word Validation

### Added
- **Duplicate Trigger Word Validation**
  - Warning dialog when saving a wiki entry with a trigger word already used by another entry
  - Also validates aliases for conflicts with existing triggers/aliases
  - Case-insensitive matching prevents "MQL" and "mql" duplicates
  - Disabled entries are excluded from duplicate checks (they don't cause tooltip conflicts)
  - Users can override the warning and save anyway if they have a legitimate reason
  - Dialog identifies the conflicting entry by name for easy resolution

### Technical
- **Files Modified**:
  - `admin/pages/wiki.js` - Added `findDuplicateTrigger()`, `findDuplicateAlias()`, `showDuplicateTriggerWarning()`, `showDuplicateAliasWarning()` methods
  - Validation runs before save in `saveWikiEntry()`

### Note
- This change only affects the web app (app.revguide.io), not the Chrome extension package under review

---

## [2.6.2] - 2025-12-17 - Plays HubSpot Properties Fix

### Fixed
- **Plays Rules Engine**: Fixed HubSpot properties not loading in the property dropdown when creating/editing plays
  - The `hubspot.js` script was missing from `plays.html`, causing `RevGuideHubSpot` to be undefined
  - Properties dropdown now correctly populates with HubSpot company/contact/deal properties

### Technical
- **Files Modified**:
  - `admin/pages/plays.html` - Added missing `<script src="/admin/hubspot.js"></script>`

---

## [2.6.1] - 2025-12-17 - Media Embed Banner Fix

### Fixed
- **Media Embed Banners**: Fixed "Could not find the 'url' column" error when saving embed-type banners
  - Added missing `url` column to `banners` table in Supabase
  - New migration: `012_add_banner_url_column.sql`

---

## [2.6.0] - 2025-12-17 - Cloud Content & Service Worker Fixes

### Fixed
- **Service Worker Loading**: Fixed service worker failing to start with "Failed to execute 'importScripts'" error
  - `importScripts('lib/wiki-cache.js')` was resolving to non-existent `background/lib/wiki-cache.js`
  - Changed to `importScripts('../lib/wiki-cache.js')` to correctly resolve to `lib/wiki-cache.js`
  - This was preventing banners, tooltips, and all cloud functionality from working

- **Wiki Tooltips Not Displaying**: Fixed wiki entries loaded from cloud having 0 terms to match
  - `mapWikiFromSupabase()` was missing critical fields: `trigger`, `aliases`, `category`, `enabled`, `link`
  - Wiki module requires `trigger` (or `term`) and `aliases` to build searchable term list
  - Added comprehensive field mapping with sensible defaults

- **Cloud Content Caching**: Cloud content cache was serving stale data without new field mappings
  - Added debug logging to show raw and transformed data from Supabase
  - Users may need to clear cache after upgrade: `chrome.storage.local.remove(['cloudContent', 'cloudContentLastFetch'])`

### Technical
- **Files Modified**:
  - `background/background.js` - Fixed importScripts path, expanded `mapWikiFromSupabase()` with all required fields, added debug logging for cloud content
  - `lib/rules-engine.js` - Added debug logging for rule evaluation
  - `content/modules/banners.js` - Added debug logging for banner rendering
  - `content/content.js` - Added debug logging for wiki entry data

- **mapWikiFromSupabase() Now Maps**:
  - `trigger` (falls back to `term`)
  - `aliases` (defaults to `[]`)
  - `category` (defaults to `'general'`)
  - `enabled` (defaults to `true`)
  - `link`, `objectType`, `propertyGroup`, `matchType`, `frequency`, `includeAliases`, `priority`, `pageType`, `urlPatterns`

### Debugging
Added comprehensive logging to diagnose content loading issues:
- `[RevGuide RulesEngine]` - Rule evaluation with match/skip reasons
- `[RevGuide Banners]` - Banner render calls and inject targets
- `[RevGuide]` - First wiki entry data structure after transformation

---

## [2.5.3] - 2025-12-17 - Role-Based Access Control Fix

### Fixed
- **Viewer/Editor Role Support**: Fixed content visibility for invited users with `viewer` or `editor` roles
  - `isMember()` now correctly identifies both `viewer` and legacy `member` roles
  - Added `canEditContent()` function for checking edit permissions (owner/admin/editor)
  - Added `isEditor()` function to identify editor role specifically

- **View-Only Mode for Viewers**: Viewers now see proper read-only UI
  - Wiki, Banners, and Plays pages use `canEditContent()` instead of `isMember()`
  - Duplicate and Delete buttons hidden for viewers on Wiki entries
  - "View Only" badge displays correctly for viewer users

- **Editor Role Permissions**: Editors can now create/edit/delete content
  - New RLS migration (011) adds `check_user_can_edit_content()` function
  - Content table policies updated to include `editor` role for INSERT/UPDATE/DELETE

- **Sidebar Role Label**: Now correctly shows "Editor" for editor role users

### Technical
- **Files Modified**:
  - `admin/shared.js` - Added `canEditContent()`, `isEditor()`, fixed `isMember()`, updated role labels
  - `admin/pages/wiki.js` - Use `canEditContent()` for view-only check, hide duplicate/delete buttons
  - `admin/pages/banners.js` - Use `canEditContent()` for view-only check
  - `admin/pages/plays.js` - Use `canEditContent()` for view-only check

- **Database Migrations**:
  - `011_add_editor_content_permissions.sql` - RLS policies for editor role content access

### Role Hierarchy
| Role | View Content | Edit Content | Manage Team |
|------|-------------|--------------|-------------|
| Owner | ✓ | ✓ | ✓ |
| Admin | ✓ | ✓ | ✓ |
| Editor | ✓ | ✓ | ✗ |
| Viewer | ✓ | ✗ | ✗ |

---

## [2.5.2] - 2025-12-17 - Improved Invitation Flow

### Added
- **Streamlined Invite Signup**: New users invited to join a team now have a seamless signup experience
  - Signup page pre-fills email (read-only) and shows organization name (read-only)
  - User only needs to enter name and password
  - Skips email confirmation step (user already verified email by clicking invite link)
  - Auto-signs in and redirects to home after account creation

- **New API Endpoint**: `POST /api/signup-invited` on Cloudflare Worker
  - Creates auth user with `email_confirm: true` (skips verification)
  - Creates user profile in `users` table with name, org, and role
  - Marks invitation as accepted
  - All in one atomic operation

- **RLS Policies for Anonymous Invitation Lookup**
  - Anonymous users can read invitation details by token (for signup page pre-fill)
  - Anonymous users can read organization name via invitation join
  - Secure: tokens are unguessable UUIDs, only returns data user already knows from email

### Fixed
- **Navigation URLs**: Fixed onboarding panel links using `.html` extensions instead of clean URLs
  - `settings.html#team-members` → `/settings#team-members`
  - Now works correctly with Vercel's clean URL routing

- **Role Constraint Mismatch**: Users table now accepts `viewer` and `editor` roles
  - Database constraint updated: `CHECK (role IN ('owner', 'admin', 'editor', 'viewer', 'member'))`
  - Matches the roles used in invitations dropdown

- **Already-Accepted Invitations**: Invite page now handles gracefully
  - If user already belongs to an org, shows success message
  - If invitation was already accepted (during signup), shows success instead of error

### Technical
- **Files Modified**:
  - `api/invite-worker.js` - New `/api/signup-invited` endpoint
  - `admin/pages/signup.html` - Invite flow detection, pre-fill fields, call worker API
  - `admin/pages/invite.js` - Handle already-accepted invitations
  - `admin/pages/home.js` - Fixed navigation URLs
  - `admin/supabase.js` - `getInvitationByToken()` now accepts `includingAccepted` parameter

- **Database Migrations**:
  - `009_public_invitation_lookup.sql` - RLS policies for anon access to invitations/orgs
  - SQL to update `users_role_check` constraint

- **Worker Secrets Required**:
  - `SUPABASE_SERVICE_ROLE_KEY` - For creating users and profiles via Admin API

---

## [2.5.1] - 2025-12-17 - Banner Tab Visibility & Token Refresh

### Fixed
- **Banner Tab Visibility**: Banners now display on the correct tab
  - Fixed snake_case to camelCase mapping for cloud content (`tab_visibility` → `tabVisibility`)
  - Fixed tab detection to use HubSpot's `data-test-id` attribute directly instead of counting tab elements (resolves off-by-one issues with hidden tabs)

- **JWT Token Auto-Refresh**: Extension now automatically refreshes expired tokens
  - Added `refreshAccessToken()` function using Supabase refresh token endpoint
  - Added `ensureValidToken()` check before every API call
  - No more "JWT expired" errors after ~1 hour of use

### Technical
- **Files Modified**:
  - `background/background.js` - Added mapping functions, token refresh logic
  - `content/content.js` - Improved `detectCurrentTab()` to parse `data-test-id`

---

## [2.5.0] - 2025-12-17 - Improved Signup Flow

### Added
- **Email/Password Authentication**
  - Replaced magic link authentication with traditional email/password signup
  - Password field added to signup form with 8-character minimum
  - Password field added to login form
  - "Forgot password?" link on login page triggers password reset email

- **User Profile Collection During Signup**
  - Name and Company Name fields on signup form
  - Data stored in Supabase user metadata during signup
  - Persists through email confirmation flow
  - Auto-creates user profile and organization on first login

- **Password Reset Flow**
  - New `/reset-password` page for setting new password
  - Email sent via Resend SMTP through Supabase
  - Handles token from email redirect

- **Resend Confirmation Email**
  - Added `resendConfirmation()` method for expired confirmation links
  - Helpful error message with resend option when link expires
  - Addresses Outlook SafeLinks consuming one-time tokens

### Changed
- **Signup Flow**: Now collects name/company upfront instead of during HubSpot OAuth
- **Login Flow**: Uses password instead of magic link
- **Profile Creation**: Moved from HubSpot OAuth callback to first authenticated page load
- **RLS Policies**: Recreated with proper role targeting (`authenticated` vs `public`)

### Technical
- **PostgreSQL Function**: `create_user_with_organization()` - SECURITY DEFINER function that atomically creates organization and user profile, bypassing RLS INSERT+SELECT issues
- **Files Modified**:
  - `admin/pages/signup.html` - Added name, company, password fields
  - `admin/pages/login.html` - Added password field, forgot password link
  - `admin/pages/login.js` - Password auth, forgot password handler
  - `admin/pages/reset-password.html` - New password reset page
  - `admin/supabase.js` - signUp, signIn, resetPassword, updatePassword, resendConfirmation, createUserWithOrganization (RPC)
  - `admin/shared.js` - Auto-create profile from auth metadata in checkAuth()
  - `vercel.json` - Added /reset-password route

### Database Changes
- New RLS policies on `organizations` table with explicit `TO authenticated` targeting
- New PostgreSQL function `create_user_with_organization(p_name, p_company_name)` with SECURITY DEFINER

---

## [2.4.0] - 2025-12-16 - Team Invitation System

### Added
- **Invitation Acceptance Page** (`/invite`)
  - Token-based invitation links sent via email
  - Email verification ensures invites can only be accepted by the intended recipient
  - Clean UI showing organization name, role, and accept/decline options
  - Handles email mismatch with option to sign in with correct account
  - Success state redirects to dashboard

- **Auto-Join Flow During Onboarding**
  - New users with pending invitations see "Join Team" flow instead of "Create Organization"
  - Invitation details shown: organization name and assigned role
  - Company name field hidden when joining existing team
  - Single form to confirm name and join team

- **Email Invitations with Token Links**
  - Invitation emails now include "Accept Invitation" button with secure token
  - Updated email templates (HTML and text versions)
  - Emails include organization name, role description, and next steps

### Changed
- `acceptInvitation()` now accepts optional `fullName` parameter
- Onboarding page detects pending invitations and adjusts UI accordingly
- `vercel.json` updated with `/invite` route

### Technical
- New files: `admin/pages/invite.html`, `admin/pages/invite.js`
- Updated: `admin/pages/onboarding.js` - Pending invitation check and join team UI
- Updated: `admin/supabase.js` - `acceptInvitation(invitationId, fullName)`, `getInvitationByToken()`, `getPendingInvitationByEmail()`
- Updated: `api/invite-worker.js` - Email templates with token links
- Updated: `admin/pages/settings.js` - Passes token and orgName to invite emails

---

## [2.3.0] - 2025-12-16 - Extension Authentication Bridge

### Added
- **Extension ↔ Web App Authentication Bridge**
  - Chrome extension now authenticates via web app using Chrome's external messaging API
  - Single sign-on: Login once in web app, extension automatically authenticated
  - Extension fetches organization-specific content from Supabase when logged in
  - Session sync: Logout from either place logs out everywhere

- **Sidepanel Auth States**
  - **Logged Out**: Shows "Sign In Required" with login button
  - **Logged In**: Shows user email and Sign Out button in Settings tab
  - API token section hidden when authenticated (not needed for cloud mode)
  - Admin Panel button opens app.revguide.io when logged in, local admin when logged out

- **Extension Login Callback Page**
  - New `/extension/logged-in` route in web app
  - Receives auth token from Supabase session
  - Sends `AUTH_STATE_CHANGED` message to extension via `chrome.runtime.sendMessage`
  - Shows success/error status with instructions

- **Background Script Enhancements**
  - `onMessageExternal` listener for web app authentication messages
  - Origin validation against allowlist (app.revguide.io, localhost)
  - Auth state management with token storage
  - Supabase REST API client for fetching cloud content
  - New message actions: `getAuthState`, `isAuthValid`, `logout`, `getContent`, `refreshCloudContent`

- **Content Loading from Cloud**
  - Content script now fetches via background script (`getContent` action)
  - Background determines source: Supabase (when authenticated) or local storage
  - Cloud content cached locally for offline access

### Changed
- `manifest.json`: Added `externally_connectable` for app.revguide.io and localhost
- `login.js`: Handles `request_path` parameter for redirect after login
- `vercel.json`: Added `/extension/logged-in` route

### Technical
- New files: `admin/pages/extension-logged-in.html`, `admin/pages/extension-logged-in.js`
- `background/background.js`: Auth state management, Supabase REST API, external message listener
- `sidepanel/sidepanel.js`: Auth state UI, login/logout handling, conditional admin panel URL
- `sidepanel/sidepanel.html`: Logged out state UI with login button
- `sidepanel/sidepanel.css`: Auth status styles
- `content/content.js`: Updated `loadData()` to use background script for content
- `content/modules/banners.js`: Updated to use background script for play lookup

---

## [2.2.2] - 2025-12-16 - Supabase CSP Fix

### Fixed
- **Chrome Extension Content Security Policy (CSP) Compliance**
  - Supabase JS library now bundled locally instead of loaded from CDN
  - Fixes "script-src 'self'" CSP violation in Manifest V3 extensions
  - Library auto-detects context: uses local bundle in extension, CDN in web app

### Added
- `admin/lib/supabase.min.js` - Local Supabase JS v2 bundle
- `admin/lib/*` added to `web_accessible_resources` in manifest

### Technical
- `admin/supabase.js` uses `chrome.runtime.getURL()` for extension context
- Falls back to CDN for web app context (app.revguide.io)
- New `createUserWithOrganization()` method in RevGuideDB for onboarding flow

---

## [2.2.1] - 2025-12-16 - Data Persistence Fix

### Fixed
- **Data Persistence - Critical Fix**
  - Wiki entries, banners, and plays now properly save to Supabase database
  - Data persists correctly when navigating between pages
  - Previously, save operations were updating local cache but not persisting to database

- **Supabase Column Name Mapping**
  - Added snake_case/camelCase mapping between frontend and database
  - Frontend uses camelCase (e.g., `objectType`, `displayOnAll`)
  - Supabase uses snake_case (e.g., `object_type`, `display_on_all`)
  - Mapping functions in `shared.js` and each page class

### Added
- **Database Migration 006**
  - Added missing columns to `plays` table: `object_type`, `display_on_all`
  - Added missing columns to `banners` table: `object_type`, `object_types`, `display_on_all`, `tab_visibility`, `related_play_id`, `embed_url`
  - Added missing columns to `wiki_entries` table: `object_type`, `property_group`, `match_type`, `frequency`, `include_aliases`, `priority`, `page_type`, `url_patterns`

### Technical
- `banners.js`: Direct Supabase save via `RevGuideDB.createBanner()`/`updateBanner()`/`deleteBanner()`
- `plays.js`: Direct Supabase save via `RevGuideDB.createPlay()`/`updatePlay()`/`deletePlay()`
- `wiki.js`: Direct Supabase save via `RevGuideDB.createWikiEntry()`/`updateWikiEntry()`/`deleteWikiEntry()`
- `shared.js`: Added `mapBannerFromSupabase()`, `mapPlayFromSupabase()`, `mapWikiFromSupabase()` for loading data
- `shared.js`: Added `clearStorageCache()` to invalidate cache after saves
- New migration: `supabase/migrations/006_add_missing_columns.sql`

---

## [2.2.0] - 2025-12-16 - Beta Release

### Added
- **CI/CD Pipeline**
  - GitHub Actions workflow for continuous integration (`.github/workflows/ci.yml`)
  - Automated validation: manifest.json structure, required files check
  - ESLint integration for code quality
  - Extension package build automation
  - Automatic deployment to Supabase edge functions and Cloudflare Worker on main branch

- **Release Automation**
  - GitHub Actions workflow for releases (`.github/workflows/release.yml`)
  - Triggered by version tags (v*)
  - Automatic GitHub release creation with changelog extraction
  - Extension ZIP artifact attached to releases

- **Test Suite**
  - Test framework setup with Chrome API mocks (`tests/setup.js`)
  - Condition engine tests - 16 tests (`tests/conditions.test.js`)
  - Storage tests - 7 tests (`tests/storage.test.js`)
  - Test runner script (`tests/run-tests.js`)

- **Documentation**
  - `docs/DEPLOYMENT.md` - Comprehensive deployment guide for Supabase, Vercel, Cloudflare
  - `docs/ERROR_MONITORING.md` - Sentry setup guide for web, extension, edge functions
  - `docs/PRIVACY_POLICY.md` - Complete privacy policy for Chrome Web Store
  - `docs/CHROME_WEB_STORE.md` - Store submission guide with listing content
  - `docs/BETA_PROGRAM.md` - Beta tester onboarding and feedback guide
  - `docs/ARCHITECTURE.md` - Information architecture explaining codebase structure
  - `.env.example` - Environment variable template with all required variables

- **Team Management Improvements**
  - Database-backed invitations (replaces local array)
  - Pending invitations table in Settings
  - Resend invitation functionality
  - Proper invitation expiry tracking

- **User Feedback**
  - "Send Feedback" link in admin sidebar
  - Links to GitHub Issues for bug reports and feature requests

### Changed
- **Team Management** now uses Supabase database for invitations instead of local storage
- Updated version to 2.2.0 for beta release milestone

### Technical
- New files: `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- New files: `tests/setup.js`, `tests/conditions.test.js`, `tests/storage.test.js`, `tests/run-tests.js`
- New files: `docs/DEPLOYMENT.md`, `docs/ERROR_MONITORING.md`, `docs/PRIVACY_POLICY.md`, `docs/CHROME_WEB_STORE.md`, `docs/BETA_PROGRAM.md`, `docs/ARCHITECTURE.md`
- Updated: `admin/pages/settings.js` - Database-backed team management
- Updated: `admin/shared.js` - Added feedback link to sidebar
- Updated: `admin/shared.css` - Feedback link styling

---

## [2.1.2] - 2025-12-16

### Security
- **Fixed Row Level Security (RLS) Policies**
  - Re-enabled RLS on `users` and `organizations` tables (was temporarily disabled for debugging)
  - Created `get_user_organization_id()` SECURITY DEFINER function to break circular dependencies
  - All RLS policies now use the helper function instead of subqueries
  - Proper security isolation restored - users can only access their own organization's data

### Technical
- New migration: `supabase/migrations/003_fix_rls_policies.sql`
- Fixed policies for: users, organizations, hubspot_connections, invitations tables
- Service role retains full access for edge functions

---

## [2.1.1] - 2025-12-16

### Added
- **User Settings Section**
  - New "Account Settings" card in Settings page
  - Editable "Your Name" field - updates user profile in database
  - Email address display (read-only, from Supabase auth)
  - Editable "Company Name" field - updates organization name
  - Save button updates both user and organization in one action
  - Sidebar footer updates immediately to reflect name changes

- **HubSpot Connection Loading Spinner**
  - Loading state with spinner while checking HubSpot connection status
  - Shows "Checking connection status..." message during API call
  - Smoother UX instead of showing disconnected state briefly

### Changed
- **HubSpot OAuth Organization Naming**
  - Fixed OAuth flow to not use "app.hubspot.com" as organization name
  - Now defaults to "My Organization" when HubSpot company name is unavailable
  - Only uses HubSpot's company name if it's a real company name (not portal domain)

### Fixed
- **Database Query Optimization**
  - Changed `getUserProfile()` from joined query to separate queries
  - Avoids 500 errors caused by Supabase PostgREST join issues with RLS
  - More resilient to database/RLS configuration issues

- **Auth Fallback for Email**
  - `checkAuth()` now falls back to Supabase auth user if profile query fails
  - Ensures email displays even when users table has issues

### Technical
- New `updateUserProfile()` function in `supabase.js` for updating user name
- Updated `loadAccountSettings()` to populate name field from profile
- Updated `saveAccountSettings()` to handle both user and org updates
- HubSpot OAuth edge function checks for portal domains before using as org name

---

## [2.1.0] - 2025-12-16

### Added
- **Direct HubSpot OAuth Integration**
  - Replaced Nango OAuth middleware with direct HubSpot OAuth via Supabase edge functions
  - New `/hubspot-oauth` edge function with endpoints: `/authorize`, `/callback`, `/connection`, `/disconnect`, `/proxy`
  - Secure token storage with pgcrypto encryption in database
  - Automatic token refresh before expiry (tokens valid for 30 minutes)
  - CSRF protection via state parameter stored in `oauth_states` table

- **HubSpot Field Import in Web App**
  - Field import now works in web context (previously extension-only)
  - Fetches properties via OAuth proxy endpoint
  - Loading spinner animation while fetching fields from HubSpot

- **Account Settings Card**
  - New card in Settings page for managing account details
  - Email display (read-only) and company name field

### Changed
- **Settings Page**
  - Updated to use `RevGuideHubSpot` client instead of `RevGuideNango`
  - Simplified OAuth callback handling (checks URL params instead of polling)
  - HubSpot connection status fetched via new `/connection` endpoint

- **Shared Utilities**
  - `fetchProperties()` now uses HubSpot OAuth proxy in web context
  - Falls back to chrome.runtime messaging in extension context

### Technical
- New files:
  - `supabase/functions/hubspot-oauth/index.ts` - Edge function for OAuth
  - `supabase/functions/hubspot-oauth/config.toml` - Disables JWT verification
  - `supabase/migrations/002_direct_hubspot_oauth.sql` - Token columns and oauth_states table
  - `admin/hubspot.js` - Frontend HubSpot client (replaces nango.js)
- Updated files:
  - `admin/shared.js` - fetchProperties uses OAuth proxy
  - `admin/pages/settings.js` - Uses RevGuideHubSpot
  - `admin/pages/settings.html` - Loads hubspot.js, account settings card
  - `admin/pages/wiki.html` - Loads hubspot.js for field import
  - `admin/pages/wiki.js` - Loading spinner for field import
  - `admin/pages/wiki.css` - Loading indicator styles

### Removed
- Nango dependency (NANGO_SECRET_KEY no longer required)
- Complex webhook-based OAuth completion flow

---

## [2.0.0] - 2025-12-15

### Added
- **SaaS Web Application**
  - Admin panel now hosted at [app.revguide.io](https://app.revguide.io)
  - Works alongside Chrome extension (same codebase)
  - Context detection: automatically uses Supabase auth in web, chrome.storage in extension

- **Supabase Authentication**
  - Magic Link (passwordless email sign-in)
  - Google OAuth sign-in
  - Session management with automatic refresh
  - Protected routes redirect to login when unauthenticated

- **Resend Email Integration**
  - Custom SMTP configured for `@revguide.io` sender domain
  - Branded email templates matching RevGuide design system
  - Templates: Magic Link, Confirm Signup, Invite User, Reset Password

- **Vercel Deployment**
  - GitHub integration for automatic deployments
  - Custom domain `app.revguide.io`
  - Clean URL rewrites (`/login`, `/home`, `/wiki`, etc.)

### Changed
- **Admin Panel URLs**
  - Web app uses clean URLs: `/login`, `/signup`, `/home`, `/wiki`, `/banners`, `/plays`, `/libraries`, `/settings`
  - Extension continues to use `.html` file paths
  - All CSS/JS paths updated to absolute URLs for Vercel compatibility

- **Auth Flow**
  - Login/signup pages detect web vs extension context
  - Web: Uses Supabase `signInWithOtp()` for magic links
  - Extension: Bypasses auth (uses local chrome.storage)

### Technical
- New files: `/admin/supabase.js`, `/admin/pages/login.html`, `/admin/pages/signup.html`
- New file: `/vercel.json` for URL rewrites and headers
- Updated: `/admin/shared.js` with `isExtensionContext` detection and auth redirects
- Updated: All HTML files with absolute paths for CSS/JS resources

---

## [1.9.9] - 2025-12-15

### Changed
- **Complete Wiki Scanner Rewrite (Supered-Style TreeWalker)**
  - Replaced 7 separate CSS selector methods with single-pass TreeWalker
  - ~45% less code (~875 lines vs ~1600 lines)
  - Faster and more consistent text matching across all HubSpot pages
  - Fixed false positives: "Company" no longer matches "Company Domain Name"

- **Smart Plural Matching**
  - Triggers now automatically match singular/plural variants
  - "Company" trigger matches "Companies (0)" text and vice versa
  - "Contact" trigger matches "Contacts (3)" text
  - Handles common English plural rules: -s, -es, -ies

- **HubSpot Custom Element Support**
  - Added `I18N-STRING` to accepted label tags
  - Association card titles now properly detected and matched

- **Section-Based Deduplication**
  - Wiki icons now show first instance of each term PER SECTION, not every instance
  - Sections: left-sidebar, middle-pane, right-sidebar, header, modal, dropdown, filter-panel, nav, table, main
  - Reduces visual clutter while maintaining coverage

- **Exact Match Only**
  - Changed from `includes()` to exact `===` matching
  - Prevents shorter terms from matching longer text (e.g., "Deal" won't match "Deal Stage")
  - Still handles trailing colons and parenthetical counts like "(3)"

### Added
- **Text Normalization**
  - Strips zero-width characters (`\u200B-\u200D`, `\uFEFF`) before matching
  - More reliable matching when HubSpot injects invisible chars

- **Sorted Term List**
  - Terms sorted by length (longest first)
  - Ensures most specific match wins when multiple terms could apply

### Technical
- New `scanForMatches()` - single TreeWalker scan returning all matches
- New `getSectionForElement()` - determines which page section an element is in
- New `buildSortedTermList()` - creates length-sorted term array with caching
- Simplified `isLikelyLabelContext()` - fewer checks needed with exact matching
- Backup of old wiki.js saved to `backups/` directory

---

## [1.9.8] - 2025-12-15

### Added
- **Wiki Tooltips on Secondary Navigation Menu Items**
  - Tooltips now appear on HubSpot's secondary nav items (Contacts, Companies, Deals, Tickets, etc.)
  - MutationObserver detects when lazy-loaded nav items appear on hover/expand
  - Observer attached to `document.body` to catch nav menu rendering outside main nav container

### Changed
- **Improved Icon Positioning (Supered-Style)**
  - Updated wiki icon wrapper to use `padding-left` + absolute positioning
  - Icons now scale with font size using `em` units
  - More consistent positioning across various HubSpot UI elements
  - New `.hshelper-wiki-icon-container` class for absolute positioning

### Technical
- Added `applyMethodSecondaryNav()` - dedicated method for secondary nav items
- Added `setupNavObserver()` - watches for lazy-loaded nav menu items
- Method 3 now explicitly skips `[data-menu-item-level="secondary"]` elements to avoid duplicates
- Updated `addIconToElement()` and `wrapTextNodeWithIcon()` to use new icon container structure
- Updated `isAlreadyProcessed()` to include `.hshelper-wiki-icon-container` checks
- Updated `remove()` to properly unwrap icon containers during cleanup

---

## [1.9.7] - 2025-12-14

### Changed
- **Rebranded from "HubSpot Helper" to "RevGuide"**
  - Updated extension name in manifest.json
  - Updated all UI text, page titles, and branding across admin panel, sidepanel, and content scripts
  - Updated console log prefixes from `[HubSpot Helper]` to `[RevGuide]`
  - Updated export filenames to `revguide-backup-*.json` and `revguide-export-*.json`
  - Renamed Cloudflare Worker from `hubspot-helper-api` to `revguide-api`
  - Deployed new worker to `https://revguide-api.revguide.workers.dev`
  - Updated all documentation (README, CHANGELOG, ROADMAP, INSTALL, PRIVACY, LEARNINGS)
  - Updated website landing page references

---

## [1.9.6] - 2025-12-14

### Changed
- **Sidepanel Now Opens on Non-HubSpot Pages**
  - Clicking the extension icon on non-HubSpot pages now opens the sidepanel instead of doing nothing
  - Opens to Plays tab by default, showing friendly "Not a HubSpot Page" message
  - "Open Admin Panel" button to access full configuration
  - "Settings" button to switch to the Settings tab
  - Provides clear feedback that the extension is working

### Technical
- Removed `chrome.sidePanel.setOptions({ enabled: false })` for non-HubSpot tabs
- Extension icon click handler now always opens sidepanel to Plays tab regardless of page URL
- Added `not-hubspot-actions` button container in sidepanel HTML
- Added click handlers for new action buttons in sidepanel.js

---

## [1.9.5] - 2025-12-12

### Added
- **HubSpot Import Tree View with Property Groups**
  - Import modal now displays properties grouped by HubSpot property groups
  - Collapsible tree structure matching the wiki navigation pattern
  - Group checkboxes to select/deselect all fields in a group at once
  - Search now filters across field names, labels, AND property group names
  - "Dropdown" badge identifies enumeration/picklist fields
  - Shows available/total count per group (e.g., "5/8")

- **Import Dropdown Values as Nested Wiki Entries**
  - New checkbox option: "Import dropdown values as nested entries"
  - When enabled, each dropdown option becomes a child wiki entry under the property
  - Child entries linked via `parentId` for true parent-child relationship
  - Children appear nested under their parent in the wiki navigation tree
  - Each child entry includes value, label, and parent field reference in definition

- **Nested Entry Display in Wiki Tree**
  - Wiki entries with children now render as expandable nodes
  - Click toggle arrow to expand/collapse children
  - Click entry name to select and edit (separate from toggle)
  - Child count badge shown on parent entries
  - Full selection styling (green highlight) for parent entries

### Removed
- **Property Values Section from Wiki Editor**
  - Removed the manual "Property Values" editing section from Content tab
  - Values are already shown in the Definition section
  - Dropdown values should now be imported as nested wiki entries instead
  - Removed Property Values count from Usage tab stats

### Technical
- `loadFieldsForImport()` now groups properties by `groupName` and renders tree HTML
- Added `toggleGroupFields()` and `updateGroupCheckboxState()` for group selection
- `filterFieldsList()` updated to show groups when group name matches search
- `renderNavTree()` separates parent entries from child entries via `parentId`
- `selectEntry()` updated to find entry ID from parent `.wiki-node-entry` element
- New CSS for `.wiki-node-entry`, `.fields-tree`, `.fields-tree-node` styling
- Import options moved to modal footer for better visibility

---

## [1.9.4] - 2025-12-12

### Added
- **Related Play for Banners**
  - New "Related Play" dropdown in Banner editor (Content tab)
  - Link any play to a banner for quick access from HubSpot pages
  - Searchable dropdown with play names and subtitles
  - "Open Play" button appears on banners that have a linked play
  - Clicking "Open Play" opens the sidepanel and navigates directly to that play

- **Smart Play Loading in Sidepanel**
  - Plays linked to banners are shown even if they don't match the current record's rules
  - "Related Play from Banner" header indicates plays opened via banner link
  - Play card automatically expands and highlights with animation
  - Solves the UX issue where banner and play might have different targeting rules

### Technical
- Added `relatedPlayId` field to banner/rule data structure
- New `initPlaySelect()`, `setPlaySelectValue()`, `getPlaySelectValue()` functions in `admin/shared.js`
- Added `.play-select*` CSS classes in `admin/pages/banners.css`
- `openPlayInSidepanel()` method in `content/modules/banners.js` fetches play data directly from storage
- Background script handles `openSidePanelToPlay` action with play data passthrough
- Sidepanel `focusOnPlay()` dynamically adds play card if not in current matching cards
- Added `.hshelper-banner-play-btn` styling in `content/content.css`
- Added `.related-play-header` and highlight animation in `sidepanel/sidepanel.css`

---

## [1.9.3] - 2025-12-12

### Performance
- **Wiki Tooltip Caching Optimization**
  - Pre-built term map cache: Term map is now built when wiki entries are saved, not on every page load
  - Session storage layer: Cache stored in sessionStorage for instant subsequent page loads within a session
  - Adaptive scan timing: Index pages now use immediate first pass instead of 500ms delay, with follow-up passes only when HubSpot is still loading content
  - Reduced unnecessary passes: Second/third passes only run if loading indicators detected or content count increases

### Technical
- Added `buildWikiTermMapCache()` function to `admin/shared.js`, `lib/storage.js`, `popup/popup.js`, `admin/admin.js`, and `background/background.js`
- New storage keys: `wikiTermMapCache`, `wikiEntriesById`, `wikiCacheVersion`
- `content/content.js` now loads pre-built cache and stores in sessionStorage
- `content/modules/wiki.js` uses pre-built cache with fallback to building from entries
- Added `invalidateTermMapCache()` method for cache invalidation on storage changes
- `applyForIndex()` now uses immediate first pass with smart follow-up timing

### Developer Notes
- See `LEARNINGS.md` for detailed documentation on the caching architecture
- Backward compatible: Falls back to building term map from entries if cache unavailable

---

## [1.9.2] - 2025-12-12

### Added
- **Tab Visibility for Banners**
  - New "Show on Tab Position" field in Banner Rules tab
  - Enter a tab number (1, 2, 3, etc.) to show banner only on that tab
  - Leave empty to show on all tabs (default behavior)
  - Content script detects active tab via HubSpot's DOM structure

### Fixed
- **Media Embed Banners**
  - Fixed embed-type banners showing only title in transparent pane
  - Embed banners now render as collapsible media cards (like presentations)
  - Full iframe embedding with fallback UI for load errors
  - Collapsible header with toggle button and "Open Media" link

### Technical
- Added `createEmbedBanner()` method to `content/modules/banners.js`
- Added `detectCurrentTab()` method to `content/content.js` with multiple detection strategies
- Tab visibility filtering applied in `render()` before passing rules to banners module
- Changed tab visibility input from dropdown to number field for flexibility

---

## [1.9.1] - 2025-12-12

### Added
- **Admin Edit Links on All Content Types**
  - "Edit in Admin Panel" links now appear on banners, plays, and wiki tooltips
  - Clicking the link opens the admin panel directly to edit that specific asset
  - Links only visible when `showAdminLinks` setting is enabled (default: on)

- **New Setting: Show Admin Edit Links**
  - Added toggle in Settings → Display Options
  - Controls visibility of edit links on banners, plays, and wiki tooltips
  - Allows teams to hide admin links for end users who shouldn't edit content

- **Deep Linking to Admin Editor**
  - Admin pages now support `?edit=<assetId>` URL parameter
  - Banners, Plays, and Wiki pages open directly to the specified asset's editor
  - Shows error toast if asset not found

### Changed
- **Wiki Tooltip Redesign (Variation G)**
  - New friendly, rounded design with 14px border-radius
  - Category-colored icon box (32x32px) with unique icons per category:
    - General: question mark
    - Sales: dollar sign
    - Marketing: star
    - Product: layers
    - Process: pulse/activity
    - Field: grid/table
  - Split footer layout: subtle "Edit" link on left, prominent "Learn more" on right
  - Improved animation with scale + fade effect
  - Cleaner typography and spacing (300px width)

### Technical
- Updated `content/modules/banners.js` with admin edit link in banner titles
- Updated `sidepanel/sidepanel.js` with edit links in play cards
- Updated `content/modules/wiki.js` with new tooltip HTML structure and category icons
- Rewrote wiki tooltip CSS in `content/content.css` (~200 lines)
- Added CSS styling for edit links in `sidepanel/sidepanel.css`
- Updated all admin pages (`banners.js`, `plays.js`, `wiki.js`) to handle `edit` query parameter

---

## [1.8.2] - 2025-12-11

### Changed
- **Banner Rules renamed to Banners**
  - "Banner Rules" section renamed to "Banners" throughout the application
  - Sidebar navigation updated: "Banner Rules" → "Banners"
  - All button text updated: "Add Rule" → "Add Banner", "Save Rule" → "Save Banner"
  - Toast messages and confirmation dialogs now reference "banner" instead of "rule"

- **Media consolidated into Banners**
  - Media section removed from sidebar navigation
  - New "Embed" banner type added for media content
  - Embed type supports Google Slides, YouTube, Loom, Vimeo, OneDrive, and SharePoint URLs
  - Embed URL field with automatic conversion to embed format
  - When "Embed" type is selected, message field is hidden and embed URL field is shown
  - Media preview shows live iframe embed in editor

- **Banners Editor Tabbed Interface**
  - New tabbed layout matching Plays and Wiki: Content, Rules, Usage tabs
  - Content tab: Banner name, title, type, message/embed URL, preview
  - Rules tab: Object type, display on all records, conditions builder
  - Usage tab: Coming soon placeholder for analytics

- **Home Page Updates**
  - Removed Media stat card from dashboard
  - Updated onboarding progress from 6 steps to 5 steps
  - Step numbering updated (Invite Team is now Step 5)

- **Content Script Updates**
  - "Open in Library" button renamed to "Open Media" for embed banners

### Removed
- `admin/pages/media.html` - Consolidated into Banners
- `admin/pages/media.css` - Consolidated into Banners
- `admin/pages/media.js` - Consolidated into Banners
- `admin/pages/rules.html` - Renamed to banners.html
- `admin/pages/rules.css` - Renamed to banners.css
- `admin/pages/rules.js` - Renamed to banners.js

---

## [1.8.1] - 2025-12-11

### Fixed
- **Wiki Tooltip Display Issues**
  - Fixed tooltips not showing for migrated wiki entries
  - Methods 4 and 5 in wiki.js were referencing `entry.term` instead of `entry.trigger`
  - Updated all references to use fallback pattern: `entry.trigger || entry.term`

- **Tooltip Click Behavior**
  - Fixed temperamental tooltip behavior (opening briefly then closing, requiring multiple clicks)
  - Added proper toggle state tracking with `currentTooltipEntryId`
  - Fixed outside-click handler to recognize clicks on wiki icons (was only checking `.hshelper-wiki-term`)
  - Clicking same icon now properly toggles tooltip off
  - Increased click listener delay from 100ms to 150ms for reliability

### Added
- **Developer Documentation**
  - New `LEARNINGS.md` file documenting lessons learned, code patterns, and debugging tips
  - Updated `HUBSPOT_DOM_STRUCTURE.md` with property label selectors, lazy loading patterns, and data attribute reference table

---

## [1.8.0] - 2025-12-11

### Added
- **Plays Editor Tabbed Interface**
  - Redesigned plays editor with 3 tabs matching wiki layout: Content, Rules, Usage
  - Content tab: Card name, type, subtitle, link, and sections
  - Rules tab: Object type, display conditions, condition builder
  - Usage tab: Coming soon placeholder for analytics

- **Media Sections in Plays**
  - New section type toggle: Text or Media
  - Media sections support embed URLs (Loom, YouTube, Vimeo, Google Drive)
  - Automatic URL conversion to embed format
  - Responsive 16:9 video player in sidepanel

- **Section Reordering & Insertion**
  - Drag-and-drop to reorder sections within plays
  - Drag handle icon on each section
  - "+" insert buttons between sections for precise positioning
  - Visual feedback during drag operations

- **Unsaved Changes Protection**
  - New confirmation dialog when navigating away with unsaved changes
  - Dialog offers Save, Discard, or Cancel options
  - Implemented for Plays, Wiki, and Banner Rules editors
  - Prevents accidental data loss

- **Shared Confirmation Dialog Component**
  - `AdminShared.showConfirmDialog()` utility function
  - Customizable title, message, and button labels
  - Keyboard support (Escape to cancel)
  - Animated overlay with accessible ARIA attributes

### Changed
- **Tab Styling Improvements**
  - Active tabs now use black text (improved readability on grey background)
  - Active tabs have semibold font weight
  - Green underline indicator retained for active state
  - Applied to both Plays and Wiki tab interfaces

### Fixed
- Confirmation dialog header now has explicit white background (was transparent)

---

## [1.7.1] - 2025-12-11

### Changed
- **Wiki Entry Structure Refactored**
  - Separated display title from trigger text for more flexibility
  - `title` (required): Display name shown in navigation tree and tooltip header
  - `trigger` (optional): Text to match on HubSpot pages to show tooltip
  - Entries without a trigger are "glossary-only" (no tooltip on HubSpot pages)
  - Aliases now serve as additional trigger terms

- **Wiki UI Updates**
  - "Term" field renamed to "Title"
  - New "Trigger Text" field for tooltip matching
  - "No tooltip" badge shows on entries without triggers in navigation tree
  - Preview now shows trigger status

### Technical
- Automatic migration of existing entries: `term` → `title` + `trigger`
- Content script skips entries without triggers when building term map
- Backward compatible with legacy `term` field

---

## [1.7.0] - 2025-12-11

### Added
- **Multi-Page Admin Architecture**
  - Admin panel now uses standalone HTML pages instead of single-page app
  - Each section (Home, Rules, Plays, Media, Wiki, Settings) is its own page
  - Faster loading and better maintainability
  - Easier to extend with new sections

- **New Wiki Two-Pane Layout**
  - Left pane: Navigation tree organized by Object > Property Group > Title
  - Right pane: Detail card with tabbed interface
  - Three tabs: Content (definition editor), Rules (conditions), Usage (stats placeholder)
  - Inline editing with unsaved changes tracking
  - Duplicate and delete functionality
  - Status toggle in card header

- **Shared Admin Utilities (AdminShared)**
  - `renderSidebar(activePage)` - Consistent navigation across all pages
  - `loadStorageData()` / `saveStorageData()` - Chrome storage access
  - `showToast()` - Toast notifications
  - `fetchProperties()` - HubSpot API integration
  - `addCondition()` / `getConditions()` - Condition builder
  - `initRichTextEditor()` - WYSIWYG editor setup
  - Constants: `OPERATORS`, `TYPE_LABELS`, `WIKI_CATEGORY_LABELS`, etc.

### Changed
- **Admin panel entry point** changed from `admin/admin.html` to `admin/pages/home.html`
- Sidepanel "Open Admin Panel" button now opens multi-page admin
- Extension popup admin link updated to multi-page admin
- `web_accessible_resources` in manifest now includes `admin/pages/*`

### Deprecated
- Single-page admin (`admin/admin.html`, `admin/admin.js`, `admin/admin.css`) is now deprecated
- These files remain for reference but are no longer used

### Technical
- New file structure under `admin/pages/`:
  - `index.html` → Redirects to `home.html`
  - `home.html/js/css` → Dashboard with onboarding and stats
  - `rules.html/js/css` → Banner rules management
  - `plays.html/js/css` → Battle cards and plays
  - `media.html/js/css` → Embedded presentations and videos
  - `wiki.html/js/css` → Two-pane wiki with tree navigation
  - `settings.html/js` → API config, display toggles, import/export
- `admin/shared.js` and `admin/shared.css` provide common functionality

---

## [1.6.1] - 2025-12-11

### Added
- **Sidepanel Tabbed Navigation**
  - New icon-based tab navigation at top of sidepanel (Plays + Settings tabs)
  - Plays tab: Shows contextual battle cards and tips for current record
  - Settings tab: Quick access to extension settings without opening admin panel

- **Sidepanel Settings Tab**
  - Enable Extension master toggle
  - Display toggles: Show Banners, Show Plays, Show Presentations, Show Wiki Tooltips
  - HubSpot API token input with save functionality
  - "Open Admin Panel" button for full configuration
  - Export/Import buttons for data backup and restore

- **Dual Entry Points for Sidepanel**
  - **Toolbar icon click** → Opens sidepanel to Settings tab
  - **FAB click on HubSpot page** → Opens sidepanel to Plays tab
  - Removed popup - extension icon now directly opens sidepanel

- **Object Type Filtering for Plays**
  - Plays now correctly filter by object type (contact, company, deal, ticket)
  - Supports both `objectType` (singular) and `objectTypes` (array) fields
  - Intelligent singular/plural normalization (handles 'companies' → 'company', etc.)

- **Live Sidepanel Updates**
  - Sidepanel cards update automatically when navigating between HubSpot records
  - FAB badge count and sidepanel content stay in sync
  - Content script pushes updates to sidepanel via messaging

### Changed
- **Sidepanel behavior on non-HubSpot pages**
  - Shows contextual "Not a HubSpot Page" message with navigation hint
  - Sidepanel remains accessible across all tabs for consistent UX

### Fixed
- Bullet list double spacing in sidepanel card content
- Section title padding in sidepanel (added 12px top margin)
- User gesture requirement for `chrome.sidePanel.open()` from FAB clicks

### Technical
- Removed `default_popup` from manifest to enable `action.onClicked` listener
- Background.js handles both toolbar icon and FAB click with appropriate tab flags
- Sidepanel.js checks `sidepanelOpenTab` storage flag on load to determine initial tab

---

## [1.6.0] - 2025-12-10

### Changed
- **Modular Architecture Refactor**
  - Split content.js into feature-specific modules for better maintainability
  - New `content/modules/` directory with isolated feature code
  - `banners.js` - Banner rendering and rule-based alerts
  - `wiki.js` - Wiki tooltips and term highlighting
  - `sidepanel.js` - FAB button and side panel for battle cards
  - `presentations.js` - Embedded presentation/media cards
  - Main `content.js` now acts as orchestrator coordinating all modules

### Added
- **Developer Documentation**
  - JSDoc comments throughout all module files
  - Clear architecture documentation explaining module interface
  - Updated README with modular architecture section
  - Each module has header explaining its purpose, features, and dependencies

### Technical
- Modules loaded in order via manifest.json (modules first, then content.js)
- Each module exports a class to window (e.g., `window.BannersModule`)
- Orchestrator initializes modules with reference to self for shared utilities
- No functionality changes - pure refactor for maintainability

---

## [1.5.0] - 2025-12-09

### Added
- **Install Plugin Onboarding Step**
  - New Step 1 in onboarding: "Install Plugin" with "Share with Team" button
  - Copies installation instructions to clipboard for easy team sharing
  - Step automatically marked as completed (user is viewing admin panel)
  - Total onboarding steps now 6: Install, API, Wiki, Rules, Plays, Team

- **Updated Extension Icons**
  - New minimalist target icon design with brand colors
  - Dark background (#1a2e05) with lime green (#b2ef63) concentric rings
  - Updated icons for 16x16, 48x48, and 128x128 sizes
  - Consistent branding across browser toolbar, popup, and sidebar

### Fixed
- **Wiki Tooltip Reliability**
  - Tooltips now consistently appear across all cards in the left sidebar
  - Added MutationObserver for lazy-loaded cards in left sidebar
  - Extended CSS selectors to match more HubSpot card types
  - Added multi-pass highlighting (500ms, 1500ms, 3000ms) for dynamic content
  - Added aggressive scan method for text elements in sidebar

- **SPA Navigation Support**
  - Tooltips now re-apply when navigating between associated records
  - Added URL change detection with proper cleanup
  - Added popstate listener for browser back/forward navigation
  - Wiki highlights properly reset on navigation

- **Media Embed Behavior**
  - Fixed duplicate media cards appearing on re-render
  - Media collapse/expand now works correctly
  - Click anywhere on header to toggle (not just the button)
  - "Open in Library" link excluded from toggle trigger

- **Tab Click Performance**
  - Tooltips no longer reload when clicking tabs in center section
  - Cleanup function now preserves wiki highlights during tab switches
  - Only removes highlights on actual navigation events

---

## [1.4.0] - 2025-12-09

### Added
- **Homepage / Onboarding**
  - New home section as the default landing page
  - 5-step onboarding guide: Connect API, Build Wiki, Create Rules, Add Plays, Invite Team
  - Progress bar showing completion status
  - Quick stats showing counts of wiki entries, rules, plays, and media
  - Content Libraries promo banner (coming soon feature)
  - Onboarding step status updates automatically as you complete tasks

- **Wiki / Field Glossary**
  - Contextual tooltips that appear when hovering over property labels in HubSpot
  - Import HubSpot fields directly with object type and property group metadata
  - Hierarchical table view organized by Object > Property Group > Property > Values
  - Define cards for individual property values (e.g., explain what each pipeline stage means)
  - Rich text definitions with formatting, lists, and links
  - Filter wiki entries by object type, category, or search term
  - Expand/collapse all groups with one click
  - Toggle switches for quickly enabling/disabling entries
  - Edit value cards directly from the table view
  - Stats bar showing total entries, enabled count, and field count

- **Wiki Import Improvements**
  - Re-import fields to update existing entries with new metadata
  - "Update available" badge for entries that can be updated
  - Preserves existing definitions when updating

### Changed
- Wiki tooltips now only target property label elements, not arbitrary text in values
  - Fixes issue where "Pipeline" would highlight inside "Sales Pipeline" value text
- Table layout optimized to fit without horizontal scrolling
- Status indicators changed from dots to toggle switches
- Reduced column widths for more compact display

### Fixed
- Folder expand/collapse clickability in wiki table
- Value index parameter properly passed to value rows

---

## [1.3.0] - 2025-12-09

### Added
- **Chrome Side Panel for Plays**
  - Plays now open in Chrome's native side panel (sidebar)
  - Click the floating action button (FAB) to open the side panel
  - Plays display with expand/collapse functionality
  - Proper empty and loading states
  - Persists while navigating between HubSpot pages

- **Rich Text Editor for Banner Messages**
  - Toolbar with bold, italic, underline, bullet lists, and links
  - WYSIWYG editing in admin panel
  - Safe HTML sanitization for content script rendering
  - Support for bulleted and numbered lists in banners

- **"Display on All Records" Option**
  - New checkbox for Rules, Plays, and Media
  - When enabled, content displays on all records of the selected object type
  - Conditions section is visually disabled (greyed out) when checked
  - Object type selector remains active for filtering

- **UI/UX Improvements**
  - Custom styled checkboxes with accent color
  - Improved checkbox-label vertical alignment
  - Banner preview now displays rich text formatting (lists, links, etc.)

### Changed
- **Complete UI Rebrand**
  - New Manrope font family throughout
  - Accent color updated to #b2ef63 (lime green)
  - Replaced all emojis with SVG icons
  - Plain CSS design system (no frameworks)
  - Consistent spacing, typography, and component styles
  - All buttons use branded green (#b2ef63) including in HubSpot pages

- **Content Script Styling**
  - Banners use HubSpot's native font (Lexend Deca) for seamless integration
  - Banner colors follow HubSpot palette for type indicators
  - Buttons and FAB use branded green accent color
  - Reduced border-radius to 3px for HubSpot consistency

### Fixed
- Bullet points now display correctly in rich text editor
- Banner preview shows rich text formatting (lists, links)
- Checkbox labels properly vertically centered

## [1.2.0] - 2025-12-09

### Added
- **Presentations**: Embed slide decks directly in HubSpot records
  - Support for Google Slides URLs (auto-converts to embed format)
  - Support for PowerPoint via OneDrive and SharePoint
  - Collapsible embed with 16:9 aspect ratio
  - "Open in Library" button to access original file
  - Fallback message with direct link if embed fails to load
  - Condition-based display (same as rules and cards)

- **Presentations Admin**
  - New "Presentations" section in admin sidebar
  - Live preview while editing
  - URL validation with sharing requirements note
  - Searchable property dropdowns for conditions

### Changed
- Removed Google Sheets integration (deprecated in favor of upcoming cloud sync)
- Updated admin panel with fourth navigation item for Presentations

## [1.1.0] - 2025-12-09

### Added
- **Full Admin Panel**: New full-page admin interface accessible from sidepanel
  - Two-column editor layout with live banner preview
  - Sidebar navigation between Rules, Plays, and Settings
  - Table view for rules with inline status toggles
  - Grid view for plays

- **Searchable Property Dropdowns**: Improved condition builder UX
  - Search bar to filter properties by name or label
  - Shows both friendly label and API property name
  - Loads properties dynamically from HubSpot API

- **AND/OR Logic Toggle**: Clear UI for condition logic
  - Toggle buttons for "All conditions (AND)" vs "Any condition (OR)"
  - Visual indication of active logic mode

- **Play Links**: Link field for external documentation
  - Add URLs to Google Docs, Notion, or any external resource
  - "View Full Document" button in play overlay
  - Auto-prefixes `https://` if missing

- **Full Property Fetching**: API now fetches all deal properties
  - No longer limited to hardcoded property list
  - Supports any custom property in conditions

### Fixed
- Property name normalization for `dealstage`, `lifecyclestage`, etc.
  - Human-readable values now used instead of internal IDs
  - Both API names and page-extracted names work in conditions

- Edit/Delete buttons in rules table now work correctly
  - Changed from inline onclick handlers to event listeners

- Modal buttons (Save, Cancel, Close) now functional
  - Replaced modals with full-page editors

### Changed
- Conditions now use custom searchable select instead of native dropdown
- Banner preview updates in real-time while editing
- Improved property extraction from HubSpot pages

## [1.0.0] - 2025-12-01

### Added
- Initial release
- Banner rules with condition-based display
- Plays with expandable sections
- Chrome extension sidepanel for quick management
- HubSpot API integration for property fetching
- Support for Contacts, Companies, Deals, and Tickets
- Import/Export functionality
- Multiple banner types (info, success, warning, error)
- Multiple play types (competitor, objection, tip, process)
