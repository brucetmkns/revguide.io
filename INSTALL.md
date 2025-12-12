# Installation Guide

This guide covers how to install HubSpot Helper as a Chrome extension.

## Method 1: Developer Mode (Current)

For local development and testing:

### Step 1: Download the Extension

```bash
# Clone the repository or download the ZIP
git clone <repository-url>
# or download and extract the ZIP file
```

### Step 2: Load in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `plugin` folder containing `manifest.json`
5. The HubSpot Helper icon will appear in your Chrome toolbar

### Step 3: Pin the Extension (Recommended)

1. Click the puzzle piece icon in Chrome toolbar
2. Find "HubSpot Helper"
3. Click the pin icon to keep it visible

## Method 2: Chrome Web Store (Coming Soon)

Once published to the Chrome Web Store:

1. Visit the [HubSpot Helper](https://chrome.google.com/webstore/detail/hubspot-helper/...) page
2. Click **Add to Chrome**
3. Confirm the installation

## Initial Setup

After installation, complete these steps to get the most out of HubSpot Helper:

### 1. Open the Admin Panel

- Click the HubSpot Helper icon in Chrome toolbar
- Click **Open Admin Panel** (gear icon)

### 2. Connect HubSpot API (Optional but Recommended)

To enable property dropdowns and enhanced features:

1. Go to **Settings** in the Admin Panel
2. In HubSpot, navigate to: **Settings > Integrations > Private Apps**
3. Create a new private app with these scopes:
   - `crm.objects.contacts.read`
   - `crm.objects.companies.read`
   - `crm.objects.deals.read`
   - `crm.objects.tickets.read`
   - `crm.schemas.contacts.read`
   - `crm.schemas.companies.read`
   - `crm.schemas.deals.read`
   - `crm.schemas.tickets.read`
4. Copy the access token
5. Paste into the **HubSpot API Token** field
6. Click **Save Settings**

### 3. Build Your Wiki

Import HubSpot fields to create tooltip definitions:

1. Go to **Wiki** in the Admin Panel
2. Click **Import Fields**
3. Select an Object Type (Deals, Contacts, etc.)
4. Check the fields you want to import
5. Click **Import Selected**
6. Edit imported fields to add definitions

### 4. Create Banners

Set up contextual banners:

1. Go to **Banners** in the Admin Panel
2. Click **Add Banner**
3. In the **Content tab**, configure the banner name, title, type, and message
   - For media embeds, select "Embed" type and paste a URL (Google Slides, YouTube, Loom, etc.)
4. In the **Rules tab**, set the object type and display conditions
5. Click **Save Banner**

### 5. Create Plays

Add battle cards and guides:

1. Go to **Plays** in the Admin Panel
2. Click **Add Play**
3. Configure the play type, content, and conditions
4. Click **Save Play**

## Verifying Installation

To verify the extension is working:

1. Navigate to any HubSpot record page (deal, contact, company, or ticket)
2. Look for:
   - Wiki tooltip icons next to property labels (if wiki entries exist)
   - Banner notifications at the top (if banners match)
   - Embedded media (if embed-type banners configured)
   - Floating action button in bottom-right (if plays exist)

## Troubleshooting

### Extension Not Loading on HubSpot

- Ensure you're on a HubSpot record page (URL contains `/record/`)
- Refresh the page after installing/updating the extension
- Check Chrome DevTools console for `[HubSpot Helper]` log messages

### No Banners or Plays Appearing

- Verify banners/plays are enabled (toggle switch on)
- Check that conditions match the current record
- Try "Display on all records" option to test

### Wiki Tooltips Not Showing

- Ensure wiki entries exist and are enabled
- Wait a few seconds for HubSpot cards to load
- Check that the property label matches your wiki term

### API Token Not Working

- Verify the token has the required scopes
- Check that the private app is active in HubSpot
- Try regenerating the token

## Updating the Extension

### Developer Mode
1. Pull/download the latest code
2. Go to `chrome://extensions/`
3. Click the refresh icon on the HubSpot Helper card

### Chrome Web Store
Updates are automatic when published to the store.

## Uninstalling

1. Go to `chrome://extensions/`
2. Find HubSpot Helper
3. Click **Remove**
4. Confirm removal

**Note:** Uninstalling removes all locally stored data (rules, plays, wiki entries, settings).

## Sharing with Your Team

Use the **Share with Team** button in the Admin Panel (Home > Step 1) to copy installation instructions for your colleagues.

For teams, consider:
- Sharing exported configurations via Import/Export
- Creating documentation for your specific rules and plays
- Designating an admin to manage the extension content
