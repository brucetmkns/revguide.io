/**
 * RevGuide - Extension Login Callback
 * Notifies the browser extension that user has logged in
 */

document.addEventListener('DOMContentLoaded', async () => {
  const loadingIcon = document.getElementById('loadingIcon');
  const callbackTitle = document.getElementById('callbackTitle');
  const callbackMessage = document.getElementById('callbackMessage');
  const callbackContent = document.getElementById('callbackContent');

  // Get extension ID from URL params
  const params = new URLSearchParams(window.location.search);
  const extensionId = params.get('eid');

  console.log('[RevGuide Callback] Extension ID from URL:', extensionId);
  console.log('[RevGuide Callback] Chrome available:', typeof chrome !== 'undefined');
  console.log('[RevGuide Callback] Chrome runtime available:', typeof chrome !== 'undefined' && !!chrome.runtime);

  // Check if user is logged in
  const { data: { session } } = await RevGuideAuth.getSession();
  console.log('[RevGuide Callback] Session:', session ? 'found' : 'not found');

  if (!session) {
    // Not logged in - redirect to login with return path
    const returnPath = `/extension/logged-in${extensionId ? `?eid=${extensionId}` : ''}`;
    console.log('[RevGuide Callback] Redirecting to login with return path:', returnPath);
    window.location.href = `/login?request_path=${encodeURIComponent(returnPath)}`;
    return;
  }

  // Get user profile to include organization info
  let userProfile = null;
  try {
    const profileResult = await RevGuideDB.getUserProfile();
    if (profileResult.data) {
      userProfile = profileResult.data;
    }
    console.log('[RevGuide Callback] User profile:', userProfile ? 'found' : 'not found');
  } catch (e) {
    console.warn('[RevGuide Callback] Could not fetch user profile:', e);
  }

  // Build the auth payload
  const authPayload = {
    isAuthenticated: true,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at,
    user: {
      id: session.user.id,
      email: session.user.email
    },
    profile: userProfile ? {
      id: userProfile.id,
      name: userProfile.name,
      organizationId: userProfile.organization_id,
      role: userProfile.role
    } : null
  };

  console.log('[RevGuide Callback] Auth payload prepared for user:', session.user.email);

  // Try to notify the extension
  let extensionNotified = false;
  let messageSent = false;

  if (extensionId && typeof chrome !== 'undefined' && chrome.runtime) {
    try {
      console.log('[RevGuide Callback] Sending message to extension:', extensionId);

      // Send message to specific extension
      chrome.runtime.sendMessage(extensionId, {
        type: 'AUTH_STATE_CHANGED',
        payload: authPayload
      }, (response) => {
        console.log('[RevGuide Callback] Got response from extension:', response);
        if (chrome.runtime.lastError) {
          console.warn('[RevGuide Callback] Extension message failed:', chrome.runtime.lastError.message);
          showError(chrome.runtime.lastError.message);
        } else {
          console.log('[RevGuide Callback] Extension notified successfully');
          extensionNotified = true;
          showSuccess();
        }
      });

      messageSent = true;
      console.log('[RevGuide Callback] Message sent, waiting for response...');

      // Give it a moment to respond
      setTimeout(() => {
        if (!extensionNotified && messageSent) {
          console.log('[RevGuide Callback] No response after timeout, showing success anyway');
          // The message was sent, extension might have received it
          // Chrome doesn't always call the callback for external messages
          showSuccess();
        }
      }, 2000);

    } catch (e) {
      console.error('[RevGuide Callback] Error sending message:', e);
      showError(e.message);
    }
  } else {
    // No extension ID or Chrome APIs not available
    console.log('[RevGuide Callback] Cannot send message - extensionId:', extensionId, 'chrome:', typeof chrome);
    if (!extensionId) {
      showError('No extension ID provided. Please try signing in from the extension again.');
    } else {
      showError('Chrome messaging API not available. Make sure you are using Chrome browser.');
    }
  }

  function showSuccess() {
    loadingIcon.outerHTML = `
      <svg class="callback-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    `;
    callbackTitle.textContent = 'Extension Connected!';
    callbackMessage.textContent = 'Your RevGuide extension is now connected to your account.';
    callbackContent.innerHTML += `
      <p class="callback-hint">You can close this tab and return to HubSpot.</p>
      <button class="callback-btn" onclick="window.close()">Close Tab</button>
    `;
  }

  function showError(errorMsg) {
    loadingIcon.outerHTML = `
      <svg class="callback-icon error" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    `;
    callbackTitle.textContent = 'Connection Issue';
    callbackMessage.textContent = errorMsg || 'Could not connect to the extension. Make sure RevGuide is installed and try again.';
    callbackContent.innerHTML += `
      <a href="/home" class="callback-btn">Go to Dashboard</a>
      <p class="callback-hint">Extension ID: ${extensionId || 'not provided'}<br>If you continue having issues, try reloading the extension.</p>
    `;
  }
});
