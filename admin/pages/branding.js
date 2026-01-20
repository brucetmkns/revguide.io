/**
 * RevGuide - Branding Page Controller
 *
 * Handles the partner branding settings page:
 * - Logo/icon uploads
 * - Color picker
 * - Live preview
 * - Save/load branding
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Wait for shared utilities to load
  await AdminShared.checkAuth();

  // Check if user can manage branding (is partner with owner/admin role)
  const canManage = await RevGuideBranding.canManageBranding();

  if (!canManage) {
    document.getElementById('loadingOverlay').classList.add('hidden');
    document.getElementById('partnerOnlyNotice').style.display = 'block';
    document.querySelector('.branding-container').style.display = 'none';
    return;
  }

  // Initialize page
  await initBrandingPage();
});

/**
 * Initialize the branding page
 */
async function initBrandingPage() {
  // Load current branding
  const branding = await RevGuideBranding.getCurrentBranding(true);
  populateForm(branding);
  updatePreview(branding);

  // Hide loading overlay
  document.getElementById('loadingOverlay').classList.add('hidden');

  // Show partner nav group
  document.getElementById('partnerNavGroup').style.display = 'block';

  // Set up event listeners
  setupFormListeners();
  setupUploadListeners();
  setupColorPicker();
  setupRadioGroup();
  setupSaveButton();
  setupResetButton();
}

/**
 * Populate form with branding data
 */
function populateForm(branding) {
  document.getElementById('displayName').value = branding.displayName || '';
  document.getElementById('tagline').value = branding.tagline || '';
  document.getElementById('helpUrl').value = branding.helpUrl || '';
  document.getElementById('supportEmail').value = branding.supportEmail || '';
  document.getElementById('websiteUrl').value = branding.websiteUrl || '';
  document.getElementById('privacyUrl').value = branding.privacyUrl || '';

  // Color
  const color = branding.primaryColor || '#b2ef63';
  const defaultColor = '#b2ef63';
  document.getElementById('primaryColorPicker').value = color;
  document.getElementById('primaryColorHex').value = color;
  document.getElementById('primaryColorPreview').style.background = color;

  // Update reset button visibility
  const resetBtn = document.getElementById('primaryColorReset');
  if (resetBtn) {
    resetBtn.classList.toggle('hidden', color.toLowerCase() === defaultColor.toLowerCase());
  }

  // Tooltip attribution
  const attribution = branding.tooltipAttribution || 'revguide';
  const radioGroup = document.getElementById('tooltipAttributionGroup');
  radioGroup.querySelectorAll('.radio-option').forEach(option => {
    const isSelected = option.dataset.value === attribution;
    option.classList.toggle('selected', isSelected);
    option.querySelector('input').checked = isSelected;
  });

  // Logo preview
  if (branding.logoUrl) {
    showUploadPreview('logo', branding.logoUrl, 'Current logo');
  }

  // Icon preview
  if (branding.logoIconUrl) {
    showUploadPreview('icon', branding.logoIconUrl, 'Current icon');
  }
}

/**
 * Update live preview
 */
function updatePreview(branding) {
  const displayName = branding.displayName || 'RevGuide';
  const primaryColor = branding.primaryColor || '#b2ef63';
  const attribution = branding.tooltipAttribution || 'revguide';

  // Update sidebar preview
  document.getElementById('previewSidebarName').textContent = displayName;

  // Update logo in preview
  const previewLogo = document.getElementById('previewSidebarLogo');
  if (branding.logoIconUrl) {
    previewLogo.innerHTML = `<img src="${branding.logoIconUrl}" alt="${displayName}">`;
  } else {
    previewLogo.innerHTML = '<span class="icon icon-target-white"></span>';
  }
  previewLogo.style.background = primaryColor;

  // Update tooltip preview
  document.getElementById('previewTooltipIcon').style.background = primaryColor;

  // Update tooltip footer
  const tooltipFooter = document.getElementById('previewTooltipFooter');
  if (attribution === 'none') {
    tooltipFooter.style.display = 'none';
  } else if (attribution === 'agency') {
    tooltipFooter.style.display = 'block';
    tooltipFooter.textContent = `Powered by ${displayName}`;
  } else {
    tooltipFooter.style.display = 'block';
    tooltipFooter.textContent = 'Powered by RevGuide';
  }
}

/**
 * Get current form values as branding object
 */
function getFormBranding() {
  const attribution = document.querySelector('input[name="tooltipAttribution"]:checked')?.value || 'revguide';

  return {
    displayName: document.getElementById('displayName').value.trim(),
    tagline: document.getElementById('tagline').value.trim() || null,
    logoUrl: getUploadedUrl('logo'),
    logoIconUrl: getUploadedUrl('icon'),
    primaryColor: document.getElementById('primaryColorHex').value,
    helpUrl: document.getElementById('helpUrl').value.trim() || null,
    supportEmail: document.getElementById('supportEmail').value.trim() || null,
    websiteUrl: document.getElementById('websiteUrl').value.trim() || null,
    privacyUrl: document.getElementById('privacyUrl').value.trim() || null,
    tooltipAttribution: attribution
  };
}

/**
 * Get uploaded file URL (stored in data attribute)
 */
function getUploadedUrl(type) {
  const zone = document.getElementById(`${type}UploadZone`);
  return zone.dataset.uploadedUrl || null;
}

/**
 * Set up form field listeners for live preview
 */
function setupFormListeners() {
  // Text fields
  ['displayName', 'tagline'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      updatePreview(getFormBranding());
    });
  });
}

/**
 * Set up file upload listeners
 */
function setupUploadListeners() {
  ['logo', 'icon'].forEach(type => {
    const zone = document.getElementById(`${type}UploadZone`);
    const input = document.getElementById(`${type}FileInput`);
    const removeBtn = document.getElementById(`${type}Remove`);

    // Click to upload
    zone.addEventListener('click', (e) => {
      if (e.target.closest('.upload-remove')) return;
      input.click();
    });

    // File selected
    input.addEventListener('change', async () => {
      if (input.files.length > 0) {
        await handleFileUpload(type, input.files[0]);
      }
    });

    // Drag and drop
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', async (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (e.dataTransfer.files.length > 0) {
        await handleFileUpload(type, e.dataTransfer.files[0]);
      }
    });

    // Remove button
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearUpload(type);
    });
  });
}

/**
 * Handle file upload
 */
async function handleFileUpload(type, file) {
  // Validate file size (500KB max)
  if (file.size > 500 * 1024) {
    AdminShared.showToast('File too large. Maximum size is 500KB.', 'error');
    return;
  }

  // Validate file type
  const validTypes = ['image/svg+xml', 'image/png', 'image/jpeg'];
  if (!validTypes.includes(file.type)) {
    AdminShared.showToast('Invalid file type. Please upload SVG, PNG, or JPG.', 'error');
    return;
  }

  // Show uploading state
  const zone = document.getElementById(`${type}UploadZone`);
  zone.classList.add('uploading');

  try {
    // Upload to Supabase Storage
    const { success, url, error } = await RevGuideBranding.uploadAsset(file, type);

    if (!success) {
      throw error || new Error('Upload failed');
    }

    // Store URL and show preview
    zone.dataset.uploadedUrl = url;
    showUploadPreview(type, url, file.name, file.size);

    // Update live preview
    updatePreview(getFormBranding());

    AdminShared.showToast(`${type === 'logo' ? 'Logo' : 'Icon'} uploaded successfully`, 'success');
  } catch (error) {
    console.error('Upload error:', error);
    AdminShared.showToast('Failed to upload file. Please try again.', 'error');
  } finally {
    zone.classList.remove('uploading');
  }
}

/**
 * Show upload preview
 */
function showUploadPreview(type, url, fileName, fileSize = null) {
  const zone = document.getElementById(`${type}UploadZone`);
  const placeholder = document.getElementById(`${type}Placeholder`);
  const preview = document.getElementById(`${type}Preview`);
  const previewImg = document.getElementById(`${type}PreviewImg`);
  const fileNameEl = document.getElementById(`${type}FileName`);
  const fileSizeEl = document.getElementById(`${type}FileSize`);

  zone.dataset.uploadedUrl = url;
  placeholder.style.display = 'none';
  preview.style.display = 'flex';
  previewImg.src = url;
  fileNameEl.textContent = fileName;
  fileSizeEl.textContent = fileSize ? formatFileSize(fileSize) : '';
  zone.classList.add('has-file');
}

/**
 * Clear upload
 */
function clearUpload(type) {
  const zone = document.getElementById(`${type}UploadZone`);
  const placeholder = document.getElementById(`${type}Placeholder`);
  const preview = document.getElementById(`${type}Preview`);
  const input = document.getElementById(`${type}FileInput`);

  delete zone.dataset.uploadedUrl;
  placeholder.style.display = 'block';
  preview.style.display = 'none';
  input.value = '';
  zone.classList.remove('has-file');

  // Update live preview
  updatePreview(getFormBranding());
}

/**
 * Format file size
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Set up color picker
 */
function setupColorPicker() {
  const picker = document.getElementById('primaryColorPicker');
  const hexInput = document.getElementById('primaryColorHex');
  const preview = document.getElementById('primaryColorPreview');
  const resetBtn = document.getElementById('primaryColorReset');
  const defaultColor = '#b2ef63';

  // Update reset button visibility
  function updateResetButtonVisibility() {
    const currentColor = hexInput.value.toLowerCase();
    resetBtn.classList.toggle('hidden', currentColor === defaultColor.toLowerCase());
  }

  // Picker change
  picker.addEventListener('input', () => {
    const color = picker.value;
    hexInput.value = color;
    preview.style.background = color;
    updateResetButtonVisibility();
    updatePreview(getFormBranding());
  });

  // Hex input change
  hexInput.addEventListener('input', () => {
    let color = hexInput.value;
    // Add # if missing
    if (color && !color.startsWith('#')) {
      color = '#' + color;
    }
    // Validate hex format
    if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
      picker.value = color;
      preview.style.background = color;
      updateResetButtonVisibility();
      updatePreview(getFormBranding());
    }
  });

  // Preview click opens picker
  preview.addEventListener('click', () => {
    picker.click();
  });

  // Reset button click
  resetBtn.addEventListener('click', () => {
    picker.value = defaultColor;
    hexInput.value = defaultColor;
    preview.style.background = defaultColor;
    updateResetButtonVisibility();
    updatePreview(getFormBranding());
  });

  // Initial visibility check
  updateResetButtonVisibility();
}

/**
 * Set up radio group
 */
function setupRadioGroup() {
  const group = document.getElementById('tooltipAttributionGroup');

  group.querySelectorAll('.radio-option').forEach(option => {
    option.addEventListener('click', () => {
      group.querySelectorAll('.radio-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
      option.querySelector('input').checked = true;
      updatePreview(getFormBranding());
    });
  });
}

/**
 * Set up save button
 */
function setupSaveButton() {
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('saveStatus');

  saveBtn.addEventListener('click', async () => {
    const branding = getFormBranding();

    // Validate
    const validation = RevGuideBranding.validateBranding(branding);
    if (!validation.valid) {
      AdminShared.showToast(validation.errors[0], 'error');
      return;
    }

    // Save
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    statusEl.textContent = '';

    try {
      const { success, error } = await RevGuideBranding.saveBranding(branding);

      if (!success) {
        throw error || new Error('Failed to save branding');
      }

      AdminShared.showToast('Branding saved successfully', 'success');
      statusEl.textContent = 'Saved';
      statusEl.style.color = 'var(--color-success)';

      // Apply branding to current page
      RevGuideBranding.applyBranding(branding);
    } catch (error) {
      console.error('Save error:', error);
      AdminShared.showToast('Failed to save branding. Please try again.', 'error');
      statusEl.textContent = 'Error saving';
      statusEl.style.color = 'var(--color-danger)';
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  });
}

/**
 * Set up reset button
 */
function setupResetButton() {
  const resetBtn = document.getElementById('resetBtn');

  resetBtn.addEventListener('click', () => {
    if (!confirm('Reset branding to RevGuide defaults? This cannot be undone.')) {
      return;
    }

    const defaults = RevGuideBranding.getDefaultBranding();
    populateForm(defaults);
    updatePreview(defaults);
    clearUpload('logo');
    clearUpload('icon');

    AdminShared.showToast('Branding reset to defaults. Click Save to apply.', 'info');
  });
}
