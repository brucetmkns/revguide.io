# RevGuide Privacy Policy

**Last Updated: December 2025**

## Introduction

RevGuide ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our Chrome extension and web application.

By using RevGuide, you agree to the collection and use of information in accordance with this policy.

## Information We Collect

### 1. Account Information

When you create an account, we collect:
- **Email address** - Used for authentication and communication
- **Name** (optional) - Used for display purposes within the app
- **Organization name** - Used to identify your team workspace

### 2. HubSpot Connection Data

When you connect your HubSpot account:
- **HubSpot Portal ID** - Identifies your HubSpot account
- **HubSpot Portal Name** - Display name for your portal
- **OAuth Tokens** - Encrypted and stored securely to maintain your connection

### 3. Content You Create

RevGuide stores the content you create:
- Wiki entries and definitions
- Banners and display rules
- Plays and battle cards
- Condition configurations

This content is stored in our database and associated with your organization.

### 4. Technical Information

We may collect:
- Error logs and crash reports (via Sentry, if enabled)
- Basic usage analytics (page views, feature usage)
- Browser type and extension version

## What We Don't Collect

Due to the nature of RevGuide, there are common questions regarding data access. This section provides clarity on these points.

### HubSpot CRM Record Data

RevGuide accesses HubSpot record properties in real-time to evaluate display rules (e.g., checking if a deal stage matches a condition to show a banner). However:

- **We do NOT store CRM record data** - Property values are fetched in-the-moment and used only to determine which content to display
- **We do NOT persist contact, company, deal, or ticket information** - This data exists only temporarily in browser memory during rule evaluation
- **We do NOT access data beyond what's needed** - We only read properties relevant to your configured rules

### What We Store vs. What We Access

| Data Type | Accessed | Stored |
|-----------|----------|--------|
| HubSpot Portal ID | Yes | Yes |
| HubSpot Portal Name | Yes | Yes |
| OAuth Tokens | Yes | Yes (encrypted) |
| Property Definitions (schemas) | Yes | Cached temporarily |
| CRM Record Properties (values) | Yes (to evaluate rules) | **No** |
| Contact/Deal/Company Records | Yes (to evaluate rules) | **No** |

### Disconnecting HubSpot

You can disconnect RevGuide from HubSpot at any time via:
- RevGuide Settings page (recommended)
- HubSpot's Connected Apps settings

Upon disconnection, your OAuth tokens are deleted from our database.

## How We Use Your Information

We use your information to:
- Provide and maintain RevGuide services
- Authenticate you and manage your account
- Display your content within HubSpot
- Sync content across your team members
- Improve our services and fix bugs
- Communicate important updates

## Data Storage and Security

### Storage Locations

- **Web App Data**: Stored in Supabase (PostgreSQL) hosted in the United States
- **Extension Data**: Cached locally in your browser (Chrome storage and sessionStorage)
- **OAuth Tokens**: Encrypted using pgcrypto before storage

### Security Measures

- All data transmitted over HTTPS/TLS
- HubSpot OAuth tokens encrypted at rest
- Row-Level Security (RLS) ensures data isolation between organizations
- No sensitive data stored in cookies or persistent browser storage

## Cookies and Local Storage

RevGuide uses browser storage technologies for functionality:

### Session Storage (cleared when browser closes)
- Authentication session cache
- HubSpot connection status
- Wiki entry cache for performance

### Local Storage (persists across sessions)
- Authentication tokens (managed by Supabase)
- UI preferences (e.g., FAB button position)

### Cookies
- RevGuide does not set first-party cookies
- Third-party cookies may be set by Supabase for authentication

## Data Sharing

We do NOT sell your personal information.

We may share data with:
- **Supabase** - Database and authentication hosting
- **Vercel** - Web application hosting
- **Cloudflare** - CDN and security
- **Resend** - Transactional email service (team invitations)
- **Sentry** - Error monitoring (if enabled, anonymous by default)
- **HubSpot** - Via your authorized OAuth connection only

## Your Rights

You have the right to:
- **Access** your data stored in RevGuide
- **Export** your content (wiki entries, banners, plays)
- **Correct** inaccurate information in your account
- **Delete** your account and associated data
- **Disconnect** your HubSpot integration at any time
- **Revoke** team member access
- **Opt-out** of marketing communications

To exercise these rights, contact us at privacy@revguide.io.

## Data Retention

- Account data is retained while your account is active
- Content is retained until you delete it
- Upon account deletion, data is removed within 30 days
- Error logs are retained for 90 days
- Browser caches are cleared when you log out or close your browser

## Children's Privacy

RevGuide is not intended for users under 18 years of age. We do not knowingly collect information from children under 18.

## Chrome Extension Permissions

Our extension requires these permissions:

| Permission | Purpose |
|------------|---------|
| `storage` | Store your settings and cached content locally |
| `activeTab` | Access the current HubSpot tab to display contextual content |
| `sidePanel` | Display the plays sidebar panel |
| `tabs` | Detect page navigation to refresh content |
| `scripting` | Inject content scripts and refresh pages after saving |

### Host Permissions

- `*.hubspot.com` - Inject content scripts into HubSpot pages
- `api.hubapi.com` - Fetch HubSpot record properties (with your authorization)
- `api.resend.com` - Send team invitation emails

## Third-Party Services

### HubSpot Integration

When you connect HubSpot:
- We request read access to CRM objects and schemas via OAuth
- We access record properties in real-time to evaluate rules
- We do NOT store your HubSpot record data
- You can revoke access anytime from HubSpot settings or RevGuide

### Analytics and Monitoring

We may use:
- Sentry for error tracking (anonymous by default)
- Basic analytics for usage patterns (no personal data)

## California Privacy Rights (CCPA)

If you are a California resident, you have the right to:
- **Know** what personal information we collect
- **Delete** your personal information
- **Opt-out** of the sale of personal information (we do not sell data)
- **Non-discrimination** for exercising your rights

To submit a request, email privacy@revguide.io with "California Privacy Request" in the subject line.

## European Privacy Rights (GDPR)

If you are in the European Economic Area (EEA), you have additional rights:
- **Access** - Request a copy of your personal data
- **Rectification** - Request correction of inaccurate data
- **Erasure** - Request deletion of your data ("right to be forgotten")
- **Restriction** - Request limitation of processing
- **Portability** - Request transfer of your data
- **Object** - Object to processing of your data

Our legal basis for processing:
- **Contract** - To provide RevGuide services you've signed up for
- **Legitimate interests** - To improve our services and prevent fraud
- **Consent** - For marketing communications (you can opt-out anytime)

To exercise your rights, contact privacy@revguide.io.

## International Data Transfers

RevGuide is based in the United States. If you access our services from outside the US, your information may be transferred to, stored, and processed in the US. By using RevGuide, you consent to this transfer.

## Updates to This Policy

We may update this Privacy Policy periodically. We will notify you of significant changes via:
- Email to your registered address
- In-app notification
- Update to this page with a new "Last Updated" date

We encourage you to review this policy periodically.

## Contact Us

For privacy questions or data requests:
- **Email**: privacy@revguide.io
- **Support**: support@revguide.io

## Compliance

RevGuide complies with:
- **GDPR** - General Data Protection Regulation (EU)
- **CCPA** - California Consumer Privacy Act
- **Chrome Web Store Developer Program Policies**

---

*By using RevGuide, you agree to this Privacy Policy.*
