/**
 * RevGuide - Onboarding Page
 * Handles new user setup: profile creation and HubSpot connection
 */

document.addEventListener('DOMContentLoaded', async () => {
  const profileForm = document.getElementById('profileForm');
  const continueBtn = document.getElementById('continueBtn');
  const connectHubSpotBtn = document.getElementById('connectHubSpotBtn');
  const skipHubSpotBtn = document.getElementById('skipHubSpotBtn');
  const onboardingMessage = document.getElementById('onboardingMessage');
  const fullNameInput = document.getElementById('fullName');
  const companyNameInput = document.getElementById('companyName');
  const emailInput = document.getElementById('email');

  const step1 = document.getElementById('step1');
  const step2 = document.getElementById('step2');
  const progressSteps = document.querySelectorAll('.progress-step');

  // Check if returning from HubSpot OAuth
  const oauthReturn = RevGuideHubSpot.checkOAuthReturn();
  if (oauthReturn.isReturning) {
    RevGuideHubSpot.clearOAuthParams();

    if (oauthReturn.success) {
      showMessage(`Connected to ${oauthReturn.portal || 'HubSpot'} successfully!`, 'success');
      // Wait a moment then redirect to home
      setTimeout(() => {
        window.location.href = '/home';
      }, 1500);
      return;
    } else if (oauthReturn.error) {
      showMessage(`Connection failed: ${oauthReturn.error}`, 'error');
      // Show step 2 (HubSpot connection) on error
      goToStep(2);
    }
  }

  // Check authentication
  const { data: { session } } = await RevGuideAuth.getSession();
  if (!session) {
    // Not logged in, redirect to signup
    window.location.href = '/signup';
    return;
  }

  // Check if user already has an organization (completed onboarding)
  try {
    const { data: profile } = await RevGuideDB.getUserProfile();
    if (profile?.organization_id) {
      // Already onboarded, go to home
      window.location.href = '/home';
      return;
    }
  } catch (e) {
    // No profile yet, continue with onboarding
  }

  // Pre-fill form from signup data stored in sessionStorage
  const signupData = getSignupData();
  if (signupData) {
    fullNameInput.value = signupData.fullName || '';
    companyNameInput.value = signupData.companyName || '';
  }

  // Set email from session (read-only)
  const { data: { user } } = await RevGuideAuth.getUser();
  if (user?.email) {
    emailInput.value = user.email;
  }

  // Handle profile form submission
  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullName = fullNameInput.value.trim();
    const companyName = companyNameInput.value.trim();

    console.log('[Onboarding] Form submitted with:', { fullName, companyName });

    if (!fullName || !companyName) {
      showMessage('Please fill in all fields', 'error');
      return;
    }

    continueBtn.disabled = true;
    continueBtn.textContent = 'Setting up...';

    try {
      // Create user profile and organization using shared method
      console.log('[Onboarding] Calling createUserWithOrganization...');
      const result = await RevGuideDB.createUserWithOrganization(fullName, companyName);
      console.log('[Onboarding] Result:', result);

      if (result.error) {
        throw new Error(result.error.message || 'Failed to create account');
      }

      // Clear signup data from sessionStorage
      sessionStorage.removeItem('revguide_signup_data');

      // Move to step 2 (HubSpot connection)
      goToStep(2);

    } catch (error) {
      console.error('Onboarding error:', error);
      showMessage(error.message || 'Failed to set up account. Please try again.', 'error');
      continueBtn.disabled = false;
      continueBtn.textContent = 'Continue';
    }
  });

  // Handle HubSpot connection
  connectHubSpotBtn.addEventListener('click', async () => {
    connectHubSpotBtn.disabled = true;
    connectHubSpotBtn.innerHTML = `
      <svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
        <circle cx="12" cy="12" r="10"/>
      </svg>
      Connecting...
    `;

    try {
      // Start OAuth flow - will redirect to HubSpot
      await RevGuideHubSpot.connect(window.location.href);
    } catch (error) {
      console.error('HubSpot connection error:', error);
      showMessage('Failed to start HubSpot connection. Please try again.', 'error');
      connectHubSpotBtn.disabled = false;
      connectHubSpotBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M18.164 7.93V5.084a2.198 2.198 0 001.267-1.984 2.21 2.21 0 00-2.212-2.212 2.21 2.21 0 00-2.212 2.212c0 .863.502 1.609 1.227 1.968v2.879a5.197 5.197 0 00-2.382 1.193l-6.376-4.96a2.567 2.567 0 00.09-.62 2.453 2.453 0 00-2.455-2.456A2.453 2.453 0 002.656 3.56a2.453 2.453 0 002.455 2.456c.405 0 .784-.103 1.12-.28l6.272 4.879a5.19 5.19 0 00-.701 2.605 5.222 5.222 0 005.222 5.222 5.222 5.222 0 005.222-5.222 5.207 5.207 0 00-4.082-5.089zm-1.14 7.526a2.637 2.637 0 01-2.639-2.639 2.637 2.637 0 012.639-2.639 2.637 2.637 0 012.639 2.639 2.637 2.637 0 01-2.639 2.639z"/>
        </svg>
        Connect HubSpot
      `;
    }
  });

  // Handle skip HubSpot
  skipHubSpotBtn.addEventListener('click', () => {
    window.location.href = '/home';
  });

  /**
   * Get signup data from sessionStorage
   */
  function getSignupData() {
    try {
      const data = sessionStorage.getItem('revguide_signup_data');
      if (data) {
        const parsed = JSON.parse(data);
        // Check if data is not too old (1 hour max)
        if (Date.now() - parsed.timestamp < 60 * 60 * 1000) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to parse signup data:', e);
    }
    return null;
  }

  /**
   * Navigate to a step
   */
  function goToStep(stepNumber) {
    // Update progress indicators
    progressSteps.forEach((step, index) => {
      const stepNum = index + 1;
      step.classList.remove('active', 'completed');
      if (stepNum < stepNumber) {
        step.classList.add('completed');
      } else if (stepNum === stepNumber) {
        step.classList.add('active');
      }
    });

    // Show/hide step content
    step1.classList.toggle('active', stepNumber === 1);
    step2.classList.toggle('active', stepNumber === 2);

    // Clear any messages
    hideMessage();
  }

  /**
   * Show a message to the user
   */
  function showMessage(text, type) {
    onboardingMessage.textContent = text;
    onboardingMessage.className = `onboarding-message ${type}`;
    onboardingMessage.style.display = 'block';
  }

  /**
   * Hide the message
   */
  function hideMessage() {
    onboardingMessage.style.display = 'none';
  }
});
