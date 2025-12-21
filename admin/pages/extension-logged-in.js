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
  console.log('[RevGuide Callback] User agent:', navigator.userAgent);
  console.log('[RevGuide Callback] Is Chrome:', navigator.userAgent.includes('Chrome'));

  // Debug: Check if we're in extension context or web page
  const isExtensionContext = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
  console.log('[RevGuide Callback] Is extension context:', isExtensionContext);

  // In web page context, chrome.runtime might still be available for externally_connectable
  if (typeof chrome !== 'undefined') {
    console.log('[RevGuide Callback] Chrome object keys:', Object.keys(chrome));
  }

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

  // Try to notify the extension with retry logic
  // Service workers in Manifest V3 can be dormant and need time to wake up

  async function sendMessageWithRetry(message, maxRetries = 3, delayMs = 500) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[RevGuide Callback] Attempt ${attempt}/${maxRetries} - sending ${message.type}`);

        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(extensionId, message, (resp) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(resp);
            }
          });
        });

        console.log('[RevGuide Callback] Got response:', response);
        return { success: true, response };
      } catch (err) {
        console.warn(`[RevGuide Callback] Attempt ${attempt} failed:`, err.message);

        if (attempt < maxRetries) {
          // Wait before retrying - increases with each attempt to give service worker time to wake
          const waitTime = delayMs * attempt;
          console.log(`[RevGuide Callback] Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          return { success: false, error: err.message };
        }
      }
    }
  }

  if (extensionId && typeof chrome !== 'undefined' && chrome.runtime) {
    try {
      console.log('[RevGuide Callback] Sending message to extension:', extensionId);

      // First, send a PING to wake up the service worker
      console.log('[RevGuide Callback] Sending PING to wake up service worker...');
      const pingResult = await sendMessageWithRetry({ type: 'PING' }, 4, 300);

      if (!pingResult.success) {
        console.warn('[RevGuide Callback] Could not reach extension after retries');
        showError(pingResult.error);
        return;
      }

      console.log('[RevGuide Callback] Extension is awake, sending auth state...');

      // Now send the actual auth message
      const authResult = await sendMessageWithRetry({
        type: 'AUTH_STATE_CHANGED',
        payload: authPayload
      }, 2, 500);

      if (authResult.success) {
        console.log('[RevGuide Callback] Extension notified successfully');
        showSuccess();
      } else {
        console.warn('[RevGuide Callback] Failed to send auth state:', authResult.error);
        showError(authResult.error);
      }

    } catch (e) {
      console.error('[RevGuide Callback] Error sending message:', e);
      showError(e.message);
    }
  } else {
    // No extension ID or Chrome APIs not available
    console.log('[RevGuide Callback] Cannot send message - extensionId:', extensionId, 'chrome:', typeof chrome);
    console.log('[RevGuide Callback] chrome.runtime:', typeof chrome !== 'undefined' ? chrome.runtime : 'N/A');

    if (!extensionId) {
      showError('No extension ID provided. Please try signing in from the extension again.');
    } else if (typeof chrome === 'undefined') {
      showError('Chrome browser APIs not detected. Make sure you are using Google Chrome or a Chromium-based browser.');
    } else if (!chrome.runtime) {
      // This typically means the extension isn't installed or the extension ID doesn't match
      showError('Cannot connect to RevGuide extension. Please ensure the extension is installed and enabled, then try again.');
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
      <p class="callback-hint">Closing this tab...</p>
      <button class="callback-btn" id="closeTabBtn">Close Tab</button>
    `;

    // Try to close the tab via extension
    if (extensionId && chrome.runtime) {
      chrome.runtime.sendMessage(extensionId, { type: 'CLOSE_AUTH_TAB' }, (response) => {
        // If extension doesn't close the tab, update the UI
        if (chrome.runtime.lastError || !response?.success) {
          const hint = document.querySelector('.callback-hint');
          if (hint) hint.textContent = 'You can now close this tab and return to HubSpot.';
        }
      });
    }

    // Also set up the button as a fallback
    document.getElementById('closeTabBtn')?.addEventListener('click', () => {
      // Try extension first
      if (extensionId && chrome.runtime) {
        chrome.runtime.sendMessage(extensionId, { type: 'CLOSE_AUTH_TAB' });
      }
      // Also try window.close() as fallback (works if opened via window.open)
      window.close();
      // If neither works, redirect to HubSpot
      setTimeout(() => {
        window.location.href = 'https://app.hubspot.com';
      }, 500);
    });
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
