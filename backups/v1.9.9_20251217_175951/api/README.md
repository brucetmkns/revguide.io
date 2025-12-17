# RevGuide API

Cloudflare Worker that handles sending invitation emails via [Resend](https://resend.com).

## Overview

This API powers the "Invite Team Members" feature in RevGuide. When a user sends an invitation from the Settings page, the Chrome extension calls this API, which then sends a branded email via Resend.

### Architecture

```
┌─────────────────────┐      ┌─────────────────────────────────┐      ┌─────────────┐
│  Chrome Extension   │ ──── │  Cloudflare Worker              │ ──── │   Resend    │
│  (Settings Page)    │ POST │  revguide-api.revguide.workers.dev │      │   Email API │
└─────────────────────┘      └─────────────────────────────────┘      └─────────────┘
```

### Production URL

`https://revguide-api.revguide.workers.dev`

## Setup

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Resend account](https://resend.com) with a verified sending domain
- Node.js 16+ installed locally

### 1. Install Wrangler CLI

```bash
npm install -g wrangler
```

### 2. Login to Cloudflare

```bash
wrangler login
```

This opens a browser window for authentication.

### 3. Set up workers.dev subdomain (first time only)

If you haven't used Cloudflare Workers before:
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to Workers & Pages → Overview
3. Click "Set up" and choose a subdomain (e.g., `yourname.workers.dev`)

### 4. Set the Resend API Key

```bash
cd api
wrangler secret put RESEND_API_KEY
# Paste your Resend API key when prompted
```

To get a Resend API key:
1. Sign up at [resend.com](https://resend.com)
2. Go to API Keys → Create API Key
3. Copy the key (starts with `re_`)

### 5. Verify Your Sending Domain (Resend)

For production use, verify a domain in Resend:
1. Go to Resend Dashboard → Domains
2. Add your domain (e.g., `yourdomain.com`)
3. Add the DNS records Resend provides
4. Update `CONFIG.fromEmail` in `invite-worker.js`

### 6. Deploy

```bash
wrangler deploy
```

You'll see output like:
```
Uploaded revguide-api (3.47 sec)
Deployed revguide-api triggers (2.27 sec)
  https://revguide-api.yoursubdomain.workers.dev
```

## Configuration

Edit `invite-worker.js` to customize:

```javascript
const CONFIG = {
  fromEmail: 'RevGuide <notifications@email.revguide.io>',  // Your verified Resend domain
  appUrl: 'https://app.revguide.io',
  chromeStoreUrl: 'https://chrome.google.com/webstore/detail/revguide/...',  // Update when published
  allowedOrigins: [
    'chrome-extension://*',
    'https://app.revguide.io',
    'https://supered.io',
  ]
};
```

### CORS Configuration

The worker allows requests from:
- Any Chrome extension (`chrome-extension://*`)
- Specified domains in `allowedOrigins`

Add your domain if you're calling the API from a web app.

## API Endpoints

### POST /api/invite

Send an invitation email to a team member.

**Request:**
```json
{
  "email": "user@example.com",
  "role": "viewer",
  "token": "abc123-invitation-token",
  "orgName": "Acme Corp"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Recipient email address |
| `role` | string | Yes | One of: `"viewer"`, `"editor"`, `"admin"` |
| `token` | string | Yes | Invitation token from database |
| `orgName` | string | No | Organization name for email personalization |

**Response (Success):**
```json
{
  "success": true,
  "message": "Invitation sent",
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Invalid email address"
}
```

**Status Codes:**
- `200` - Success
- `400` - Bad request (invalid email or role)
- `500` - Server error (Resend API failure)

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "revguide-api"
}
```

## Email Templates

### Customizing Templates

Email templates are defined in `invite-worker.js`:

- `buildInvitationEmailHtml(role)` - HTML version (branded, styled)
- `buildInvitationEmailText(role)` - Plain text fallback

### Template Variables

Templates use role-based messaging:
- **Admin**: "As an Admin, you can manage content, create banners, plays, wiki entries, and invite other team members."
- **Editor**: "As an Editor, you can create and edit banners, plays, and wiki entries."
- **Viewer**: "As a Viewer, you can view all contextual guidance features within HubSpot."

### Redeploying After Changes

```bash
wrangler deploy
```

## Testing

### Health Check

```bash
curl https://revguide-api.revguide.workers.dev/health
```

### Send Test Invitation

```bash
curl -X POST https://revguide-api.revguide.workers.dev/api/invite \
  -H "Content-Type: application/json" \
  -H "Origin: https://app.revguide.io" \
  -d '{"email": "test@example.com", "role": "viewer", "token": "test-token-123", "orgName": "Test Org"}'
```

### Local Development

```bash
wrangler dev
```

This starts a local server at `http://localhost:8787` for testing.

## Custom Domain (Optional)

To use a custom domain like `api.revguide.io`:

1. Go to Cloudflare Dashboard → Workers & Pages → revguide-api
2. Go to Settings → Triggers → Custom Domains
3. Click "Add Custom Domain"
4. Enter your domain (e.g., `api.revguide.io`)
5. Cloudflare will automatically configure DNS if the domain is on Cloudflare

Then update the extension to use your custom domain:

```javascript
// background/background.js
const INVITE_API_URL = 'https://api.revguide.io/api/invite';
```

## Troubleshooting

### "Invalid email address" error

- Ensure the email format is valid
- Check that the request body is valid JSON

### "Failed to send email" error

- Verify your Resend API key is set correctly: `wrangler secret list`
- Check that your sending domain is verified in Resend
- View Resend logs at [resend.com/logs](https://resend.com/logs)

### CORS errors

- Add your origin to `CONFIG.allowedOrigins`
- Redeploy with `wrangler deploy`

### Viewing Logs

Real-time logs:
```bash
wrangler tail
```

Or view in Cloudflare Dashboard → Workers → revguide-api → Logs

## Environment Variables

| Variable | Description | How to Set |
|----------|-------------|------------|
| `RESEND_API_KEY` | Resend API key for sending emails | `wrangler secret put RESEND_API_KEY` |

## Files

```
api/
├── invite-worker.js    # Main worker code (email logic, templates)
├── wrangler.toml       # Cloudflare Worker configuration
└── README.md           # This file
```

## Related Documentation

- [Resend Documentation](https://resend.com/docs)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)
