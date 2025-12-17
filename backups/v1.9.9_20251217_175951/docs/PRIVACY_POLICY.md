# RevGuide Privacy Policy

**Last Updated: December 2024**

## Introduction

RevGuide ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our Chrome extension and web application.

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

**We do NOT store:**
- Your HubSpot CRM record data (contacts, deals, companies, etc.)
- Your HubSpot account credentials

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
- **Extension Data**: Stored locally in your browser (Chrome storage)
- **OAuth Tokens**: Encrypted using pgcrypto before storage

### Security Measures

- All data transmitted over HTTPS/TLS
- HubSpot OAuth tokens encrypted at rest
- Row-Level Security (RLS) ensures data isolation between organizations
- Regular security audits and updates

## Data Sharing

We do NOT sell your personal information.

We may share data with:
- **Supabase** - Database and authentication hosting
- **Vercel** - Web application hosting
- **Cloudflare** - Email delivery (for team invitations)
- **Resend** - Transactional email service
- **Sentry** - Error monitoring (if enabled)
- **HubSpot** - Via your authorized OAuth connection only

## Your Rights

You have the right to:
- **Access** your data stored in RevGuide
- **Export** your content (via Import/Export feature)
- **Delete** your account and associated data
- **Disconnect** your HubSpot integration at any time
- **Revoke** team member access

## Data Retention

- Account data is retained while your account is active
- Content is retained until you delete it
- Upon account deletion, data is removed within 30 days
- Error logs are retained for 90 days

## Children's Privacy

RevGuide is not intended for users under 13 years of age. We do not knowingly collect information from children.

## Chrome Extension Permissions

Our extension requires these permissions:

| Permission | Purpose |
|------------|---------|
| `storage` | Store your settings and content locally |
| `activeTab` | Detect when you're viewing HubSpot |
| `sidePanel` | Display the plays sidebar |
| `tabs` | Detect page navigation |
| `scripting` | Refresh page after saving fields |

### Host Permissions

- `*.hubspot.com` - Inject content into HubSpot pages
- `api.hubapi.com` - Make HubSpot API calls (with your authorization)

## Third-Party Services

### HubSpot Integration

When you connect HubSpot:
- We request read access to CRM objects and schemas
- We do not store your HubSpot record data
- You can revoke access anytime from HubSpot settings

### Analytics and Monitoring

We may use:
- Sentry for error tracking (anonymous by default)
- Basic analytics for usage patterns

## Updates to This Policy

We may update this Privacy Policy periodically. We will notify you of significant changes via:
- Email to your registered address
- In-app notification
- Update to this page

## Contact Us

For privacy questions or data requests:
- **Email**: privacy@revguide.io
- **Support**: support@revguide.io

## Compliance

RevGuide complies with:
- **GDPR** - For EU users
- **CCPA** - For California users
- **Chrome Web Store Developer Program Policies**

---

*By using RevGuide, you agree to this Privacy Policy.*
