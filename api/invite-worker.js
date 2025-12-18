/**
 * RevGuide - Invite API Worker
 *
 * Cloudflare Worker that handles sending invitation emails via Resend.
 * Deploy to Cloudflare Workers and set the RESEND_API_KEY environment variable.
 *
 * Deployment:
 * 1. Install Wrangler: npm install -g wrangler
 * 2. Login: wrangler login
 * 3. Create worker: wrangler init revguide-api
 * 4. Copy this file to src/index.js
 * 5. Set secret: wrangler secret put RESEND_API_KEY
 * 6. Deploy: wrangler deploy
 */

// ===========================================
// CONFIGURATION
// ===========================================

const CONFIG = {
  fromEmail: 'RevGuide <notifications@email.revguide.io>',
  appUrl: 'https://app.revguide.io',
  chromeStoreUrl: 'https://chrome.google.com/webstore', // Update when published
  supabaseUrl: 'https://qbdhvhrowmfnacyikkbf.supabase.co',
  allowedOrigins: [
    'chrome-extension://*',
    'https://app.revguide.io',
    'https://supered.io',
  ]
};

// ===========================================
// EMAIL TEMPLATES
// ===========================================

function buildInvitationEmailHtml(role, token, orgName, invitationType = 'team') {
  // Handle consultant invitations separately
  if (invitationType === 'consultant' || role === 'consultant') {
    return buildConsultantInvitationEmailHtml(token, orgName);
  }

  const roleLabels = {
    admin: 'an Admin',
    editor: 'an Editor',
    viewer: 'a Viewer'
  };
  const roleDescriptions = {
    admin: 'As an Admin, you can manage content, create banners, plays, wiki entries, and invite other team members.',
    editor: 'As an Editor, you can create and edit banners, plays, and wiki entries.',
    viewer: 'As a Viewer, you can view all contextual guidance features within HubSpot.'
  };
  const roleText = roleLabels[role] || 'a team member';
  const roleDescription = roleDescriptions[role] || '';

  const inviteLink = `${CONFIG.appUrl}/invite?token=${encodeURIComponent(token)}`;
  const orgDisplay = orgName ? ` at <strong>${orgName}</strong>` : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #111827; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">You're Invited to RevGuide!</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px; margin-bottom: 20px;">
      You've been invited to join${orgDisplay} as ${roleText}.
    </p>

    <p style="margin-bottom: 25px;">
      RevGuide provides contextual guidance, wiki tooltips, and plays directly within HubSpot to help your team work smarter.
    </p>

    <div style="text-align: center; margin-bottom: 25px;">
      <a href="${inviteLink}" style="display: inline-block; background: #b2ef63; color: #111827; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
        Accept Invitation
      </a>
    </div>

    <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 14px; color: #6b7280;">
        <strong>Your Role:</strong> ${role.charAt(0).toUpperCase() + role.slice(1)}<br>
        ${roleDescription}
      </p>
    </div>

    <h2 style="font-size: 16px; color: #111827; margin-bottom: 15px;">After accepting:</h2>

    <ol style="padding-left: 20px; margin-bottom: 25px; font-size: 14px;">
      <li style="margin-bottom: 8px;">
        <strong>Install the Chrome Extension</strong><br>
        <a href="${CONFIG.chromeStoreUrl}" style="color: #0091ae;">Download from Chrome Web Store</a>
      </li>
      <li style="margin-bottom: 8px;">
        <strong>Sign in to the extension</strong><br>
        Click "Sign In" in the extension sidebar
      </li>
      <li style="margin-bottom: 8px;">
        <strong>Browse HubSpot</strong><br>
        See contextual banners, plays, and wiki tooltips on record pages
      </li>
    </ol>

    <p style="font-size: 13px; color: #9ca3af; margin-bottom: 0;">
      This invitation expires in 7 days. Questions? Reply to this email.
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    RevGuide - Contextual guidance for your revenue team
  </div>
</body>
</html>`;
}

function buildInvitationEmailText(role, token, orgName, invitationType = 'team') {
  // Handle consultant invitations separately
  if (invitationType === 'consultant' || role === 'consultant') {
    return buildConsultantInvitationEmailText(token, orgName);
  }

  const roleLabels = {
    admin: 'an Admin',
    editor: 'an Editor',
    viewer: 'a Viewer'
  };
  const roleDescriptions = {
    admin: 'As an Admin, you can manage content, create banners, plays, wiki entries, and invite other team members.',
    editor: 'As an Editor, you can create and edit banners, plays, and wiki entries.',
    viewer: 'As a Viewer, you can view all contextual guidance features within HubSpot.'
  };
  const roleText = roleLabels[role] || 'a team member';
  const roleDescription = roleDescriptions[role] || '';

  const inviteLink = `${CONFIG.appUrl}/invite?token=${encodeURIComponent(token)}`;
  const orgDisplay = orgName ? ` at ${orgName}` : '';

  return `You're Invited to RevGuide!

You've been invited to join${orgDisplay} as ${roleText}.

RevGuide provides contextual guidance, wiki tooltips, and plays directly within HubSpot to help your team work smarter.

Accept your invitation here:
${inviteLink}

Your Role: ${role.charAt(0).toUpperCase() + role.slice(1)}
${roleDescription}

After accepting:

1. Install the Chrome Extension
   Download from Chrome Web Store: ${CONFIG.chromeStoreUrl}

2. Sign in to the extension
   Click "Sign In" in the extension sidebar

3. Browse HubSpot
   See contextual banners, plays, and wiki tooltips on record pages

This invitation expires in 7 days. Questions? Reply to this email.

---
RevGuide - Contextual guidance for your revenue team`;
}

// ===========================================
// CONSULTANT EMAIL TEMPLATES
// ===========================================

function buildConsultantInvitationEmailHtml(token, orgName) {
  const inviteLink = `${CONFIG.appUrl}/invite?token=${encodeURIComponent(token)}&type=consultant`;
  const orgDisplay = orgName ? `<strong>${orgName}</strong>` : 'a RevGuide organization';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #111827; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Consultant Access Invitation</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px; margin-bottom: 20px;">
      You've been invited to join ${orgDisplay} as a <strong>Consultant</strong> on RevGuide.
    </p>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; border-radius: 8px; margin-bottom: 25px;">
      <h3 style="margin: 0 0 12px 0; color: #166534; font-size: 16px;">As a Consultant, you can:</h3>
      <ul style="margin: 0; padding-left: 20px; color: #166534;">
        <li>Access and manage this client's RevGuide content</li>
        <li>Switch between multiple client portals seamlessly</li>
        <li>Create and deploy reusable content libraries</li>
        <li>Help clients optimize their HubSpot workflow</li>
      </ul>
    </div>

    <div style="text-align: center; margin-bottom: 25px;">
      <a href="${inviteLink}" style="display: inline-block; background: #b2ef63; color: #111827; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
        Accept Consultant Invitation
      </a>
    </div>

    <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 14px; color: #6b7280;">
        <strong>Your Role:</strong> Consultant<br>
        You'll have full editing access to help manage this organization's RevGuide content.
      </p>
    </div>

    <p style="font-size: 13px; color: #9ca3af; margin-bottom: 0;">
      This invitation expires in 7 days. Questions? Reply to this email.
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    RevGuide - Contextual guidance for your revenue team
  </div>
</body>
</html>`;
}

function buildConsultantInvitationEmailText(token, orgName) {
  const inviteLink = `${CONFIG.appUrl}/invite?token=${encodeURIComponent(token)}&type=consultant`;
  const orgDisplay = orgName || 'a RevGuide organization';

  return `Consultant Access Invitation

You've been invited to join ${orgDisplay} as a Consultant on RevGuide.

As a Consultant, you can:
- Access and manage this client's RevGuide content
- Switch between multiple client portals seamlessly
- Create and deploy reusable content libraries
- Help clients optimize their HubSpot workflow

Accept your invitation here:
${inviteLink}

Your Role: Consultant
You'll have full editing access to help manage this organization's RevGuide content.

This invitation expires in 7 days. Questions? Reply to this email.

---
RevGuide - Contextual guidance for your revenue team`;
}

function buildAccessRequestNotificationEmailHtml(consultantName, consultantEmail, orgName, message) {
  const reviewLink = `${CONFIG.appUrl}/settings#consultant-access`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #111827; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">New Consultant Access Request</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px; margin-bottom: 20px;">
      <strong>${consultantName || 'A consultant'}</strong> (${consultantEmail}) is requesting consultant access to <strong>${orgName}</strong>.
    </p>

    ${message ? `
    <div style="background: #f9fafb; border-left: 4px solid #6b7280; padding: 15px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 14px; color: #374151; font-style: italic;">
        "${message}"
      </p>
    </div>
    ` : ''}

    <div style="text-align: center; margin-bottom: 25px;">
      <a href="${reviewLink}" style="display: inline-block; background: #b2ef63; color: #111827; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
        Review Request
      </a>
    </div>

    <p style="font-size: 13px; color: #9ca3af; margin-bottom: 0;">
      You can approve or decline this request in your RevGuide settings.
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    RevGuide - Contextual guidance for your revenue team
  </div>
</body>
</html>`;
}

function buildAccessRequestNotificationEmailText(consultantName, consultantEmail, orgName, message) {
  const reviewLink = `${CONFIG.appUrl}/settings#consultant-access`;

  return `New Consultant Access Request

${consultantName || 'A consultant'} (${consultantEmail}) is requesting consultant access to ${orgName}.

${message ? `Message: "${message}"\n` : ''}
Review this request in your RevGuide settings:
${reviewLink}

You can approve or decline this request there.

---
RevGuide - Contextual guidance for your revenue team`;
}

function buildRequestApprovedEmailHtml(orgName) {
  const dashboardLink = `${CONFIG.appUrl}/clients`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #166534; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Access Request Approved!</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px; margin-bottom: 20px;">
      Great news! Your request for consultant access to <strong>${orgName}</strong> has been approved.
    </p>

    <p style="margin-bottom: 25px;">
      You can now access and manage their RevGuide content from your Clients dashboard.
    </p>

    <div style="text-align: center; margin-bottom: 25px;">
      <a href="${dashboardLink}" style="display: inline-block; background: #b2ef63; color: #111827; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
        View Your Clients
      </a>
    </div>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    RevGuide - Contextual guidance for your revenue team
  </div>
</body>
</html>`;
}

function buildRequestApprovedEmailText(orgName) {
  const dashboardLink = `${CONFIG.appUrl}/clients`;

  return `Access Request Approved!

Great news! Your request for consultant access to ${orgName} has been approved.

You can now access and manage their RevGuide content from your Clients dashboard:
${dashboardLink}

---
RevGuide - Contextual guidance for your revenue team`;
}

function buildRequestDeclinedEmailHtml(orgName, reason) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #991b1b; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Access Request Declined</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px; margin-bottom: 20px;">
      Your request for consultant access to <strong>${orgName}</strong> was not approved at this time.
    </p>

    ${reason ? `
    <div style="background: #f9fafb; border-left: 4px solid #6b7280; padding: 15px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 14px; color: #374151;">
        <strong>Reason:</strong> ${reason}
      </p>
    </div>
    ` : ''}

    <p style="font-size: 14px; color: #6b7280; margin-bottom: 0;">
      If you believe this was a mistake, please contact the organization directly.
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    RevGuide - Contextual guidance for your revenue team
  </div>
</body>
</html>`;
}

function buildRequestDeclinedEmailText(orgName, reason) {
  return `Access Request Declined

Your request for consultant access to ${orgName} was not approved at this time.

${reason ? `Reason: ${reason}\n` : ''}
If you believe this was a mistake, please contact the organization directly.

---
RevGuide - Contextual guidance for your revenue team`;
}

function buildAutoConnectNotificationEmailHtml(orgName) {
  const dashboardLink = `${CONFIG.appUrl}/clients`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #111827; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">New Client Added</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px; margin-bottom: 20px;">
      You've been added as a consultant to <strong>${orgName}</strong>.
    </p>

    <p style="margin-bottom: 25px;">
      You can now access and manage their RevGuide content from your Clients dashboard.
    </p>

    <div style="text-align: center; margin-bottom: 25px;">
      <a href="${dashboardLink}" style="display: inline-block; background: #b2ef63; color: #111827; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
        View Your Clients
      </a>
    </div>
  </div>

  <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
    RevGuide - Contextual guidance for your revenue team
  </div>
</body>
</html>`;
}

function buildAutoConnectNotificationEmailText(orgName) {
  const dashboardLink = `${CONFIG.appUrl}/clients`;

  return `New Client Added

You've been added as a consultant to ${orgName}.

You can now access and manage their RevGuide content from your Clients dashboard:
${dashboardLink}

---
RevGuide - Contextual guidance for your revenue team`;
}

// ===========================================
// CORS HANDLING
// ===========================================

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';

  // Allow Chrome extensions and specified domains
  const isAllowed = origin.startsWith('chrome-extension://') ||
                    CONFIG.allowedOrigins.includes(origin);

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

// ===========================================
// REQUEST HANDLER
// ===========================================

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = getCorsHeaders(request);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(request.url);

    // Route: POST /api/invite
    if (url.pathname === '/api/invite' || url.pathname === '/invite') {
      return handleInvite(request, env, corsHeaders);
    }

    // Route: POST /api/invite-consultant - Invite a consultant (with auto-connect check)
    if (url.pathname === '/api/invite-consultant') {
      return handleInviteConsultant(request, env, corsHeaders);
    }

    // Route: POST /api/notify-access-request - Notify admins of access request
    if (url.pathname === '/api/notify-access-request') {
      return handleNotifyAccessRequest(request, env, corsHeaders);
    }

    // Route: POST /api/notify-request-approved - Notify consultant of approval
    if (url.pathname === '/api/notify-request-approved') {
      return handleNotifyRequestApproved(request, env, corsHeaders);
    }

    // Route: POST /api/notify-request-declined - Notify consultant of decline
    if (url.pathname === '/api/notify-request-declined') {
      return handleNotifyRequestDeclined(request, env, corsHeaders);
    }

    // Route: POST /api/notify-auto-connect - Notify consultant of auto-connection
    if (url.pathname === '/api/notify-auto-connect') {
      return handleNotifyAutoConnect(request, env, corsHeaders);
    }

    // Route: POST /api/signup-invited - Create user for invited users (skips email confirmation)
    if (url.pathname === '/api/signup-invited' || url.pathname === '/signup-invited') {
      return handleSignupInvited(request, env, corsHeaders);
    }

    // Health check
    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response(JSON.stringify({ status: 'ok', service: 'revguide-api' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

async function handleInvite(request, env, corsHeaders) {
  try {
    // Parse request body
    const body = await request.json();
    const { email, role, token, orgName } = body;

    // Validate input
    if (!email || !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: 'Valid email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Accept valid roles
    const validRoles = ['viewer', 'editor', 'admin'];
    if (!role || !validRoles.includes(role)) {
      return new Response(JSON.stringify({ error: 'Role must be "viewer", "editor", or "admin"' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!token) {
      return new Response(JSON.stringify({ error: 'Invitation token is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check for API key
    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Send email via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: CONFIG.fromEmail,
        to: [email],
        subject: orgName ? `You're invited to join ${orgName} on RevGuide` : "You're invited to RevGuide",
        html: buildInvitationEmailHtml(role, token, orgName),
        text: buildInvitationEmailText(role, token, orgName)
      })
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json().catch(() => ({}));
      console.error('Resend error:', errorData);
      return new Response(JSON.stringify({
        error: errorData.message || 'Failed to send email'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const result = await resendResponse.json();

    return new Response(JSON.stringify({
      success: true,
      message: 'Invitation sent',
      id: result.id
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Invite error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// ===========================================
// SIGNUP FOR INVITED USERS
// ===========================================

async function handleSignupInvited(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { email, password, fullName, inviteToken } = body;

    // Validate input
    if (!email || !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: 'Valid email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!password || password.length < 8) {
      return new Response(JSON.stringify({ error: 'Password must be at least 8 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!fullName || fullName.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Name is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!inviteToken) {
      return new Response(JSON.stringify({ error: 'Invitation token is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check for service role key
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY not configured');
      return new Response(JSON.stringify({ error: 'Service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 1. Verify invitation exists and is valid
    const inviteResponse = await fetch(
      `${CONFIG.supabaseUrl}/rest/v1/invitations?token=eq.${encodeURIComponent(inviteToken)}&accepted_at=is.null&select=*,organizations(id,name)`,
      {
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!inviteResponse.ok) {
      console.error('Failed to fetch invitation:', await inviteResponse.text());
      return new Response(JSON.stringify({ error: 'Failed to verify invitation' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const invitations = await inviteResponse.json();
    if (!invitations || invitations.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid or expired invitation' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const invitation = invitations[0];

    // Check if invitation email matches
    if (invitation.email.toLowerCase() !== email.toLowerCase()) {
      return new Response(JSON.stringify({ error: 'Email does not match invitation' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Invitation has expired' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Create auth user with email_confirm = true (skips email verification)
    const createUserResponse = await fetch(
      `${CONFIG.supabaseUrl}/auth/v1/admin/users`,
      {
        method: 'POST',
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email,
          password: password,
          email_confirm: true, // Skip email verification for invited users
          user_metadata: {
            full_name: fullName
          }
        })
      }
    );

    if (!createUserResponse.ok) {
      const errorData = await createUserResponse.json().catch(() => ({}));
      console.error('Failed to create user:', errorData);

      // Check if user already exists
      if (errorData.message?.includes('already been registered') || errorData.msg?.includes('already been registered')) {
        return new Response(JSON.stringify({
          error: 'An account with this email already exists',
          code: 'USER_EXISTS'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ error: errorData.message || 'Failed to create account' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const authUser = await createUserResponse.json();

    // 3. Create user profile in users table
    // Use the invitation role directly (users table now accepts viewer/editor/admin)
    const profilePayload = {
      auth_user_id: authUser.id,
      email: email.toLowerCase(),
      name: fullName,
      organization_id: invitation.organization_id,
      role: invitation.role
    };

    const createProfileResponse = await fetch(
      `${CONFIG.supabaseUrl}/rest/v1/users`,
      {
        method: 'POST',
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(profilePayload)
      }
    );

    if (!createProfileResponse.ok) {
      const errorData = await createProfileResponse.json().catch(() => ({}));
      console.error('Failed to create user profile:', JSON.stringify(errorData));
      // Return error to client so they know what happened
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to create user profile: ' + (errorData.message || errorData.details || JSON.stringify(errorData)),
        authUserCreated: true
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 4. Mark invitation as accepted
    const updateInviteResponse = await fetch(
      `${CONFIG.supabaseUrl}/rest/v1/invitations?id=eq.${invitation.id}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          accepted_at: new Date().toISOString()
        })
      }
    );

    if (!updateInviteResponse.ok) {
      console.error('Failed to mark invitation as accepted:', await updateInviteResponse.text());
      // Don't fail - user is already created
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Account created successfully',
      user: {
        id: authUser.id,
        email: authUser.email
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Signup error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ===========================================
// CONSULTANT INVITATION HANDLERS
// ===========================================

async function handleInviteConsultant(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { email, token, orgName, invitationType } = body;

    if (!email || !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: 'Valid email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!token) {
      return new Response(JSON.stringify({ error: 'Invitation token is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Send consultant invitation email
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: CONFIG.fromEmail,
        to: [email],
        subject: orgName ? `Consultant access invitation from ${orgName}` : 'Consultant Access Invitation - RevGuide',
        html: buildConsultantInvitationEmailHtml(token, orgName),
        text: buildConsultantInvitationEmailText(token, orgName)
      })
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json().catch(() => ({}));
      console.error('Resend error:', errorData);
      return new Response(JSON.stringify({
        error: errorData.message || 'Failed to send email'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const result = await resendResponse.json();

    return new Response(JSON.stringify({
      success: true,
      message: 'Consultant invitation sent',
      id: result.id
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Invite consultant error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function handleNotifyAccessRequest(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { adminEmails, consultantName, consultantEmail, orgName, message } = body;

    if (!adminEmails || !Array.isArray(adminEmails) || adminEmails.length === 0) {
      return new Response(JSON.stringify({ error: 'Admin emails are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!consultantEmail) {
      return new Response(JSON.stringify({ error: 'Consultant email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Send notification to all admins
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: CONFIG.fromEmail,
        to: adminEmails,
        subject: `New consultant access request for ${orgName || 'your organization'}`,
        html: buildAccessRequestNotificationEmailHtml(consultantName, consultantEmail, orgName, message),
        text: buildAccessRequestNotificationEmailText(consultantName, consultantEmail, orgName, message)
      })
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json().catch(() => ({}));
      console.error('Resend error:', errorData);
      return new Response(JSON.stringify({
        error: errorData.message || 'Failed to send notification'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const result = await resendResponse.json();

    return new Response(JSON.stringify({
      success: true,
      message: 'Access request notification sent',
      id: result.id
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Notify access request error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function handleNotifyRequestApproved(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { consultantEmail, orgName } = body;

    if (!consultantEmail) {
      return new Response(JSON.stringify({ error: 'Consultant email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: CONFIG.fromEmail,
        to: [consultantEmail],
        subject: `Your access request to ${orgName || 'an organization'} was approved!`,
        html: buildRequestApprovedEmailHtml(orgName),
        text: buildRequestApprovedEmailText(orgName)
      })
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json().catch(() => ({}));
      console.error('Resend error:', errorData);
      return new Response(JSON.stringify({
        error: errorData.message || 'Failed to send notification'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const result = await resendResponse.json();

    return new Response(JSON.stringify({
      success: true,
      message: 'Approval notification sent',
      id: result.id
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Notify request approved error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function handleNotifyRequestDeclined(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { consultantEmail, orgName, reason } = body;

    if (!consultantEmail) {
      return new Response(JSON.stringify({ error: 'Consultant email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: CONFIG.fromEmail,
        to: [consultantEmail],
        subject: `Your access request to ${orgName || 'an organization'} was declined`,
        html: buildRequestDeclinedEmailHtml(orgName, reason),
        text: buildRequestDeclinedEmailText(orgName, reason)
      })
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json().catch(() => ({}));
      console.error('Resend error:', errorData);
      return new Response(JSON.stringify({
        error: errorData.message || 'Failed to send notification'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const result = await resendResponse.json();

    return new Response(JSON.stringify({
      success: true,
      message: 'Decline notification sent',
      id: result.id
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Notify request declined error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function handleNotifyAutoConnect(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { consultantEmail, orgName } = body;

    if (!consultantEmail) {
      return new Response(JSON.stringify({ error: 'Consultant email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const apiKey = env.RESEND_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: CONFIG.fromEmail,
        to: [consultantEmail],
        subject: `You've been added as a consultant to ${orgName || 'a new organization'}`,
        html: buildAutoConnectNotificationEmailHtml(orgName),
        text: buildAutoConnectNotificationEmailText(orgName)
      })
    });

    if (!resendResponse.ok) {
      const errorData = await resendResponse.json().catch(() => ({}));
      console.error('Resend error:', errorData);
      return new Response(JSON.stringify({
        error: errorData.message || 'Failed to send notification'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const result = await resendResponse.json();

    return new Response(JSON.stringify({
      success: true,
      message: 'Auto-connect notification sent',
      id: result.id
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Notify auto-connect error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
