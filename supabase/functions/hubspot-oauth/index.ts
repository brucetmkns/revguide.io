// Direct HubSpot OAuth - Supabase Edge Function
// Replaces Nango with direct HubSpot OAuth implementation

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

// Environment variables
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const HUBSPOT_CLIENT_ID = Deno.env.get('HUBSPOT_CLIENT_ID')!
const HUBSPOT_CLIENT_SECRET = Deno.env.get('HUBSPOT_CLIENT_SECRET')!
const TOKEN_ENCRYPTION_KEY = Deno.env.get('TOKEN_ENCRYPTION_KEY')!

// Construct redirect URI from Supabase URL
const HUBSPOT_REDIRECT_URI = `${SUPABASE_URL}/functions/v1/hubspot-oauth/callback`

// HubSpot OAuth URLs
const HUBSPOT_AUTH_URL = 'https://app.hubspot.com/oauth/authorize'
const HUBSPOT_TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token'
const HUBSPOT_API_BASE = 'https://api.hubapi.com'

// HubSpot API version (2025 platform requirement)
const HUBSPOT_API_VERSION = '2025-02'

// Required OAuth scopes
const HUBSPOT_SCOPES = [
  'oauth',
  'crm.objects.contacts.read',
  'crm.objects.companies.read',
  'crm.objects.deals.read',
  'crm.schemas.contacts.read',
  'crm.schemas.companies.read',
  'crm.schemas.deals.read'
]

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const path = url.pathname.split('/').pop()

  try {
    switch (path) {
      case 'authorize':
        return await handleAuthorize(req)
      case 'callback':
        return await handleCallback(req)
      case 'connection':
        return await handleGetConnection(req)
      case 'disconnect':
        return await handleDisconnect(req)
      case 'proxy':
        return await handleProxy(req)
      default:
        return new Response(
          JSON.stringify({ error: 'Not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

/**
 * Start OAuth flow - generate HubSpot authorization URL
 */
async function handleAuthorize(req: Request): Promise<Response> {
  const body = await req.json()
  const { returnUrl, organizationId } = body

  if (!returnUrl) {
    return new Response(
      JSON.stringify({ error: 'returnUrl is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get user from authorization header
  const authHeader = req.headers.get('authorization')
  let userId: string | null = null

  if (authHeader) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await supabase.auth.getUser(token)
    userId = user?.id || null
  }

  // Generate state for CSRF protection
  const state = crypto.randomUUID()

  // Store state in database
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { error: stateError } = await supabase
    .from('oauth_states')
    .insert({
      state,
      user_id: userId,
      organization_id: organizationId || null,
      return_url: returnUrl,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
    })

  if (stateError) {
    console.error('Failed to store OAuth state:', stateError)
    return new Response(
      JSON.stringify({ error: 'Failed to initialize OAuth flow' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Build HubSpot authorization URL
  const authUrl = new URL(HUBSPOT_AUTH_URL)
  authUrl.searchParams.set('client_id', HUBSPOT_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', HUBSPOT_REDIRECT_URI)
  authUrl.searchParams.set('scope', HUBSPOT_SCOPES.join(' '))
  authUrl.searchParams.set('state', state)

  return new Response(
    JSON.stringify({ authUrl: authUrl.toString() }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

/**
 * Handle OAuth callback from HubSpot
 */
async function handleCallback(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')

  // Handle OAuth errors
  if (error) {
    console.error('HubSpot OAuth error:', error, errorDescription)
    return redirectWithError('OAuth was cancelled or failed', '')
  }

  if (!code || !state) {
    return redirectWithError('Missing code or state parameter', '')
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Validate state (CSRF protection)
  const { data: oauthState, error: stateError } = await supabase
    .from('oauth_states')
    .select('*')
    .eq('state', state)
    .single()

  if (stateError || !oauthState) {
    console.error('Invalid OAuth state:', state)
    return redirectWithError('Invalid or expired session', '')
  }

  // Check if state has expired
  if (new Date(oauthState.expires_at) < new Date()) {
    await supabase.from('oauth_states').delete().eq('state', state)
    return redirectWithError('Session expired, please try again', oauthState.return_url)
  }

  // Delete the used state
  await supabase.from('oauth_states').delete().eq('state', state)

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch(HUBSPOT_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: HUBSPOT_CLIENT_ID,
        client_secret: HUBSPOT_CLIENT_SECRET,
        redirect_uri: HUBSPOT_REDIRECT_URI,
        code
      })
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error('Token exchange failed:', tokenResponse.status, errorData)
      return redirectWithError('Failed to connect to HubSpot', oauthState.return_url)
    }

    const tokens = await tokenResponse.json()
    console.log('Tokens received, expires_in:', tokens.expires_in)

    // Get portal info using the access token
    const portalInfo = await fetchPortalInfo(tokens.access_token)
    if (!portalInfo) {
      return redirectWithError('Failed to get HubSpot account info', oauthState.return_url)
    }

    console.log('Portal info:', portalInfo)

    // Find or create organization
    let organizationId = oauthState.organization_id

    if (!organizationId) {
      // First check if user already has an organization (from onboarding)
      if (oauthState.user_id) {
        const { data: existingUserProfile } = await supabase
          .from('users')
          .select('organization_id')
          .eq('auth_user_id', oauthState.user_id)
          .single()

        if (existingUserProfile?.organization_id) {
          organizationId = existingUserProfile.organization_id
        }
      }
    }

    if (!organizationId) {
      // Check if org exists for this portal
      const { data: existingOrg } = await supabase
        .from('organizations')
        .select('id')
        .eq('hubspot_portal_id', portalInfo.portalId)
        .single()

      if (existingOrg) {
        organizationId = existingOrg.id
      } else {
        // Create new organization
        // Use HubSpot company name if available, otherwise use a generic name
        // Avoid using "app.hubspot.com" or similar portal domains as org name
        let orgName = 'My Organization'
        if (portalInfo.portalName &&
            portalInfo.portalName !== portalInfo.portalDomain &&
            !portalInfo.portalName.includes('hubspot.com')) {
          orgName = portalInfo.portalName
        }
        const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `org-${portalInfo.portalId}`

        const { data: newOrg, error: orgError } = await supabase
          .from('organizations')
          .insert({
            name: orgName,
            slug: slug,
            hubspot_portal_id: portalInfo.portalId,
            hubspot_portal_domain: portalInfo.portalDomain
          })
          .select()
          .single()

        if (orgError) {
          console.error('Failed to create organization:', orgError)
          return redirectWithError('Failed to create organization', oauthState.return_url)
        }

        organizationId = newOrg.id
      }
    }

    // Link user to organization if we have a user
    let connectedByUserId: string | null = null

    if (oauthState.user_id) {
      // Check if user already has a profile
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', oauthState.user_id)
        .single()

      if (!existingUser) {
        // Get email from auth.users
        const { data: authUser } = await supabase.auth.admin.getUserById(oauthState.user_id)

        if (authUser?.user) {
          const { data: newUser } = await supabase
            .from('users')
            .insert({
              auth_user_id: oauthState.user_id,
              email: authUser.user.email,
              organization_id: organizationId,
              role: 'admin'
            })
            .select('id')
            .single()

          connectedByUserId = newUser?.id || null
        }
      } else {
        // Update user's organization
        await supabase
          .from('users')
          .update({ organization_id: organizationId })
          .eq('auth_user_id', oauthState.user_id)

        connectedByUserId = existingUser.id
      }
    }

    // Store the connection with encrypted tokens using the database function
    const { data: connectionResult, error: connectionError } = await supabase.rpc(
      'store_hubspot_connection',
      {
        p_organization_id: organizationId,
        p_portal_id: portalInfo.portalId,
        p_portal_domain: portalInfo.portalDomain,
        p_portal_name: portalInfo.portalName,
        p_access_token: tokens.access_token,
        p_refresh_token: tokens.refresh_token,
        p_expires_in: tokens.expires_in,
        p_scopes: HUBSPOT_SCOPES,
        p_connected_by: connectedByUserId,
        p_encryption_key: TOKEN_ENCRYPTION_KEY
      }
    )

    if (connectionError) {
      console.error('Failed to store connection:', connectionError)
      return redirectWithError('Failed to save connection', oauthState.return_url)
    }

    console.log('Connection stored successfully:', connectionResult)

    // Update organization with portal info (but don't overwrite existing name)
    // First check if org already has a name set by user during onboarding
    const { data: existingOrg } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single()

    const updateData: any = {
      hubspot_portal_id: portalInfo.portalId,
      hubspot_portal_domain: portalInfo.portalDomain
    }

    // Only set name if it's currently "My Organization" (default) or empty
    if (!existingOrg?.name || existingOrg.name === 'My Organization') {
      if (portalInfo.portalName &&
          portalInfo.portalName !== portalInfo.portalDomain &&
          !portalInfo.portalName.includes('hubspot.com')) {
        updateData.name = portalInfo.portalName
      }
    }

    await supabase
      .from('organizations')
      .update(updateData)
      .eq('id', organizationId)

    // Redirect back to frontend with success
    const returnUrl = new URL(oauthState.return_url)
    returnUrl.searchParams.set('connected', 'true')
    returnUrl.searchParams.set('portal', portalInfo.portalName || portalInfo.portalId)

    return Response.redirect(returnUrl.toString(), 302)

  } catch (error) {
    console.error('OAuth callback error:', error)
    return redirectWithError('An error occurred during connection', oauthState.return_url)
  }
}

/**
 * Get connection status for current user/organization
 */
async function handleGetConnection(req: Request): Promise<Response> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Get user from authorization header
  const authHeader = req.headers.get('authorization')
  if (!authHeader) {
    return new Response(
      JSON.stringify({ isConnected: false, error: 'Not authenticated' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return new Response(
      JSON.stringify({ isConnected: false, error: 'Invalid token' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get user's organization
  const { data: userData } = await supabase
    .from('users')
    .select('organization_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData?.organization_id) {
    return new Response(
      JSON.stringify({ isConnected: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Get active connection for organization
  const { data: connection } = await supabase
    .from('hubspot_connections')
    .select('id, portal_id, portal_domain, portal_name, token_expires_at, scopes, connected_at')
    .eq('organization_id', userData.organization_id)
    .eq('is_active', true)
    .single()

  if (!connection) {
    return new Response(
      JSON.stringify({ isConnected: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({
      isConnected: true,
      connectionId: connection.id,
      portalId: connection.portal_id,
      portalDomain: connection.portal_domain,
      portalName: connection.portal_name,
      scopes: connection.scopes,
      connectedAt: connection.connected_at,
      tokenExpiresAt: connection.token_expires_at
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

/**
 * Disconnect HubSpot connection
 */
async function handleDisconnect(req: Request): Promise<Response> {
  const { connectionId } = await req.json()

  if (!connectionId) {
    return new Response(
      JSON.stringify({ error: 'connectionId required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Get the connection to optionally revoke the token
  const { data: connection } = await supabase
    .from('hubspot_connections')
    .select('id')
    .eq('id', connectionId)
    .single()

  if (!connection) {
    return new Response(
      JSON.stringify({ error: 'Connection not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Mark connection as inactive and clear tokens
  const { error: updateError } = await supabase
    .from('hubspot_connections')
    .update({
      is_active: false,
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      token_expires_at: null
    })
    .eq('id', connectionId)

  if (updateError) {
    console.error('Failed to disconnect:', updateError)
    return new Response(
      JSON.stringify({ error: 'Failed to disconnect' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

/**
 * Proxy requests to HubSpot API
 */
async function handleProxy(req: Request): Promise<Response> {
  const { connectionId, endpoint, method = 'GET', body } = await req.json()

  if (!connectionId || !endpoint) {
    return new Response(
      JSON.stringify({ error: 'connectionId and endpoint required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Get access token (refresh if needed)
  const accessToken = await getValidAccessToken(supabase, connectionId)

  if (!accessToken) {
    return new Response(
      JSON.stringify({ error: 'Connection not found or token refresh failed' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Make request to HubSpot
  const hubspotResponse = await fetch(`${HUBSPOT_API_BASE}${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-HubSpot-API-Version': HUBSPOT_API_VERSION
    },
    body: body ? JSON.stringify(body) : undefined
  })

  const data = await hubspotResponse.json()

  return new Response(
    JSON.stringify(data),
    {
      status: hubspotResponse.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  )
}

/**
 * Get a valid access token, refreshing if necessary
 */
async function getValidAccessToken(supabase: any, connectionId: string): Promise<string | null> {
  // Get token info from database
  const { data: tokenData, error } = await supabase.rpc(
    'get_hubspot_access_token',
    {
      p_connection_id: connectionId,
      p_encryption_key: TOKEN_ENCRYPTION_KEY
    }
  )

  if (error || !tokenData || tokenData.length === 0) {
    console.error('Failed to get access token:', error)
    return null
  }

  const { access_token, token_expires_at, refresh_token, is_expired } = tokenData[0]

  // Check if token expires within 5 minutes
  const expiresAt = new Date(token_expires_at)
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000)

  if (expiresAt > fiveMinutesFromNow && !is_expired) {
    // Token is still valid
    return access_token
  }

  // Token needs refresh
  console.log('Refreshing HubSpot token for connection:', connectionId)

  try {
    const response = await fetch(HUBSPOT_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: HUBSPOT_CLIENT_ID,
        client_secret: HUBSPOT_CLIENT_SECRET,
        refresh_token: refresh_token
      })
    })

    if (!response.ok) {
      console.error('Token refresh failed:', response.status, await response.text())
      return null
    }

    const newTokens = await response.json()

    // Update tokens in database
    const { error: updateError } = await supabase.rpc(
      'update_hubspot_tokens',
      {
        p_connection_id: connectionId,
        p_access_token: newTokens.access_token,
        p_refresh_token: newTokens.refresh_token,
        p_expires_in: newTokens.expires_in,
        p_encryption_key: TOKEN_ENCRYPTION_KEY
      }
    )

    if (updateError) {
      console.error('Failed to update tokens:', updateError)
    }

    return newTokens.access_token

  } catch (error) {
    console.error('Token refresh error:', error)
    return null
  }
}

/**
 * Fetch HubSpot portal info using access token
 */
async function fetchPortalInfo(accessToken: string): Promise<{
  portalId: string
  portalDomain: string
  portalName: string
} | null> {
  try {
    const response = await fetch(`${HUBSPOT_API_BASE}/account-info/v3/details`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-HubSpot-API-Version': HUBSPOT_API_VERSION
      }
    })

    if (!response.ok) {
      console.error('Failed to fetch portal info:', response.status)
      return null
    }

    const data = await response.json()
    return {
      portalId: data.portalId?.toString(),
      portalDomain: data.uiDomain,
      portalName: data.companyName || data.uiDomain
    }
  } catch (error) {
    console.error('Portal info fetch error:', error)
    return null
  }
}

/**
 * Redirect with error message
 */
function redirectWithError(message: string, returnUrl: string): Response {
  if (!returnUrl) {
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const url = new URL(returnUrl)
  url.searchParams.set('error', message)
  return Response.redirect(url.toString(), 302)
}
