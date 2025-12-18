# Installation Guide

This guide covers how to install RevGuide as a Chrome extension.

**Current Version:** v2.2.0 (Beta Release)

## Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| **Google Chrome** | Full support | Primary platform, all features available |
| **Microsoft Edge** | Full support | Uses same extension format as Chrome |
| **Brave** | Full support | Chromium-based, works with Chrome extensions |
| **Safari** | Not supported | Safari requires a native Safari App Extension built with Xcode/Swift. The Chrome extension uses Chrome-specific APIs (`chrome.sidePanel`, Manifest V3 service workers) that are not compatible with Safari. |
| **Firefox** | Not supported | Would require a separate extension using Firefox's WebExtensions API |

For beta tester documentation, see [docs/BETA_PROGRAM.md](docs/BETA_PROGRAM.md).

## Method 1: Developer Mode (Beta Testing)

For beta testers and local development:

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
5. The RevGuide icon will appear in your Chrome toolbar

### Step 3: Pin the Extension (Recommended)

1. Click the puzzle piece icon in Chrome toolbar
2. Find "RevGuide"
3. Click the pin icon to keep it visible

## Method 2: Chrome Web Store (Coming Soon)

Once published to the Chrome Web Store:

1. Visit the [RevGuide](https://chrome.google.com/webstore/detail/revguide/...) page
2. Click **Add to Chrome**
3. Confirm the installation

## Initial Setup

After installation, complete these steps to get the most out of RevGuide:

### 1. Open the Admin Panel

- Click the RevGuide icon in Chrome toolbar
- Click **Open Admin Panel** (gear icon)

### 2. Connect HubSpot (Recommended)

RevGuide uses HubSpot OAuth for secure authentication.

1. Go to **Settings** in the Admin Panel
2. Click **Connect HubSpot**
3. Authorize RevGuide in the HubSpot OAuth popup
4. You're connected!

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
- Check Chrome DevTools console for `[RevGuide]` log messages

### No Banners or Plays Appearing

- Verify banners/plays are enabled (toggle switch on)
- Check that conditions match the current record
- Try "Display on all records" option to test

### Wiki Tooltips Not Showing

- Ensure wiki entries exist and are enabled
- Wait a few seconds for HubSpot cards to load
- Check that the property label matches your wiki term

## Updating the Extension

### Developer Mode
1. Pull/download the latest code
2. Go to `chrome://extensions/`
3. Click the refresh icon on the RevGuide card

### Chrome Web Store
Updates are automatic when published to the store.

## Uninstalling

1. Go to `chrome://extensions/`
2. Find RevGuide
3. Click **Remove**
4. Confirm removal

**Note:** Uninstalling removes all locally stored data (rules, plays, wiki entries, settings).

## Sharing with Your Team

Use the **Share with Team** button in the Admin Panel (Home > Step 1) to copy installation instructions for your colleagues.

For teams, consider:
- Sharing exported configurations via Import/Export
- Creating documentation for your specific rules and plays
- Designating an admin to manage the extension content

### Team Invitations (Email)

RevGuide includes a team invitation feature that sends installation emails:

1. Go to **Settings** in the Admin Panel
2. Click **Invite Team Members**
3. Enter email address and select role (Admin or User)
4. Click **Send Invitation**

**Note:** The invitation email feature requires the Cloudflare Worker API to be deployed. See the [API Setup](#api-setup-for-developers) section below.

## API Setup (For Developers)

RevGuide uses a Cloudflare Worker to send team invitation emails via [Resend](https://resend.com).

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Resend account](https://resend.com) with verified domain
- Node.js installed locally

### Deployment Steps

1. **Install Wrangler CLI**
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**
   ```bash
   wrangler login
   ```

3. **Set up a workers.dev subdomain** (if you don't have one)
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
   - Navigate to Workers & Pages
   - Set up your subdomain (e.g., `yourname.workers.dev`)

4. **Configure the Resend API Key**
   ```bash
   cd api
   npx wrangler secret put RESEND_API_KEY
   # Paste your Resend API key when prompted
   ```

5. **Update the from email** (optional)

   Edit `api/invite-worker.js` and update `CONFIG.fromEmail` to use your verified domain:
   ```javascript
   fromEmail: 'RevGuide <team@yourdomain.com>'
   ```

6. **Deploy the Worker**
   ```bash
   npx wrangler deploy
   ```

7. **Update the extension** (if using a different URL)

   If your worker URL differs from the default, update `background/background.js`:
   ```javascript
   const INVITE_API_URL = 'https://your-worker.your-subdomain.workers.dev/api/invite';
   ```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/invite` | POST | Send invitation email |
| `/health` | GET | Health check |

### Testing the API

```bash
# Health check
curl https://revguide-api.revguide.workers.dev/health

# Send test invitation (requires valid Resend API key)
curl -X POST https://revguide-api.revguide.workers.dev/api/invite \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "role": "user"}'
```

See [api/README.md](api/README.md) for more details.

## Running Tests

RevGuide includes a test suite for the condition engine and storage operations:

```bash
# Run all tests
node tests/run-tests.js
```

Tests include:
- Condition evaluation (equals, contains, greater_than, etc.)
- AND/OR logic combinations
- Storage operations and data structure validation

## Additional Resources

- **Beta Program:** [docs/BETA_PROGRAM.md](docs/BETA_PROGRAM.md)
- **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Deployment:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **Privacy Policy:** [docs/PRIVACY_POLICY.md](docs/PRIVACY_POLICY.md)
