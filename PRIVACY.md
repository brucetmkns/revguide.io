# Privacy Policy

**Last updated:** December 9, 2025

## Overview

HubSpot Helper is a Chrome extension that provides contextual guidance, plays, and recommendations on HubSpot CRM record pages. This privacy policy explains how we handle your data.

## Data Collection

### What We Collect

HubSpot Helper collects and stores the following data **locally on your device**:

- **Configuration Data**: Banners, plays, and wiki entries you create
- **Settings**: Your preferences for display options and feature toggles
- **HubSpot API Token**: If you choose to enable enhanced features (stored locally)

### What We Do NOT Collect

- Personal information
- HubSpot CRM data (contacts, deals, companies, etc.)
- Browsing history outside of HubSpot
- Usage analytics or telemetry
- Any data transmitted to external servers

## Data Storage

All data is stored locally using Chrome's `chrome.storage.local` API. Your data:

- Stays on your device
- Is not transmitted to any external servers
- Is not shared with third parties
- Is not accessible to the extension developers
- Can be exported and deleted at any time

## HubSpot API Integration

If you choose to connect your HubSpot API token:

- The token is stored locally on your device only
- API calls are made directly from your browser to HubSpot's API
- We do not proxy, store, or log any API requests or responses
- The token is used solely to fetch property schemas for condition builders

### Required API Scopes

The extension requests these read-only scopes:
- `crm.objects.contacts.read`
- `crm.objects.companies.read`
- `crm.objects.deals.read`
- `crm.objects.tickets.read`
- `crm.schemas.contacts.read`
- `crm.schemas.companies.read`
- `crm.schemas.deals.read`
- `crm.schemas.tickets.read`

## Permissions

The extension requires these Chrome permissions:

| Permission | Purpose |
|------------|---------|
| `storage` | Store your rules, plays, and settings locally |
| `activeTab` | Access the current HubSpot tab to inject content |
| `sidePanel` | Display plays in Chrome's side panel |
| `tabs` | Detect navigation within HubSpot |
| `host_permissions` | Only activates on `*.hubspot.com` domains |

## Data Security

- All data remains on your local device
- No external network requests except direct HubSpot API calls (if configured)
- No third-party analytics or tracking scripts
- Extension code is open for inspection

## Your Rights

You can:

- **Export** all your data via the Admin Panel (Settings > Export)
- **Delete** all data by removing the extension or clearing extension storage
- **Review** what's stored via Chrome DevTools (Application > Storage > Extension)

## Children's Privacy

This extension is not directed at children under 13 and does not knowingly collect data from children.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be reflected in the "Last updated" date above.

## Contact

For privacy-related questions or concerns, please open an issue on our GitHub repository.

---

**Summary:** HubSpot Helper stores all data locally on your device. We do not collect, transmit, or share any personal information or HubSpot data.
