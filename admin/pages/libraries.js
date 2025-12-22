/**
 * RevGuide - Content Libraries
 * Browse and install pre-built wiki entry packs
 */

// Configuration
const LIBRARIES_BASE_URL = 'https://raw.githubusercontent.com/brucetmkns/revguide.io/main/library-data';
const MANIFEST_URL = `${LIBRARIES_BASE_URL}/index.json`;

// State
let librariesManifest = null;
let installedLibraries = {};
let existingWikiEntries = [];
let currentLibrary = null;
let currentLibraryEntries = [];

// DOM Elements
const elements = {
  loading: null,
  error: null,
  errorMessage: null,
  content: null,
  installedSection: null,
  installedGrid: null,
  availableGrid: null,
  previewModal: null,
  previewModalTitle: null,
  previewDescription: null,
  previewEntryCount: null,
  previewVersion: null,
  previewSearch: null,
  previewEntriesList: null,
  installModal: null,
  installModalTitle: null,
  installSummary: null,
  installSearch: null,
  installEntriesList: null,
  selectAllEntries: null,
  installCount: null,
  uninstallModal: null,
  uninstallMessage: null,
  uninstallWarning: null
};

/**
 * Initialize the libraries page
 */
async function init() {
  // Check authentication (redirects to login if not authenticated)
  const isAuthenticated = await AdminShared.checkAuth();
  if (!isAuthenticated) return;

  // Cache DOM elements
  cacheElements();

  // Render sidebar
  AdminShared.renderSidebar('libraries');

  // Set up event listeners
  setupEventListeners();

  // Load data
  await loadData();

  // Initialize partner features (My Libraries section)
  await initPartnerFeatures();
}

/**
 * Cache DOM element references
 */
function cacheElements() {
  elements.loading = document.getElementById('librariesLoading');
  elements.error = document.getElementById('librariesError');
  elements.errorMessage = document.getElementById('librariesErrorMessage');
  elements.content = document.getElementById('librariesContent');
  elements.installedSection = document.getElementById('installedSection');
  elements.installedGrid = document.getElementById('installedGrid');
  elements.availableGrid = document.getElementById('availableGrid');
  elements.previewModal = document.getElementById('previewModal');
  elements.previewModalTitle = document.getElementById('previewModalTitle');
  elements.previewDescription = document.getElementById('previewDescription');
  elements.previewEntryCount = document.getElementById('previewEntryCount');
  elements.previewVersion = document.getElementById('previewVersion');
  elements.previewSearch = document.getElementById('previewSearch');
  elements.previewEntriesList = document.getElementById('previewEntriesList');
  elements.installModal = document.getElementById('installModal');
  elements.installModalTitle = document.getElementById('installModalTitle');
  elements.installSummary = document.getElementById('installSummary');
  elements.installSearch = document.getElementById('installSearch');
  elements.installEntriesList = document.getElementById('installEntriesList');
  elements.selectAllEntries = document.getElementById('selectAllEntries');
  elements.installCount = document.getElementById('installCount');
  elements.uninstallModal = document.getElementById('uninstallModal');
  elements.uninstallMessage = document.getElementById('uninstallMessage');
  elements.uninstallWarning = document.getElementById('uninstallWarning');
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Retry button
  document.getElementById('retryLoadBtn').addEventListener('click', loadData);

  // Preview modal
  document.getElementById('closePreviewModal').addEventListener('click', closePreviewModal);
  document.getElementById('cancelPreviewBtn').addEventListener('click', closePreviewModal);
  document.getElementById('installFromPreviewBtn').addEventListener('click', () => {
    closePreviewModal();
    openInstallModal(currentLibrary);
  });
  elements.previewSearch.addEventListener('input', filterPreviewEntries);

  // Install modal
  document.getElementById('closeInstallModal').addEventListener('click', closeInstallModal);
  document.getElementById('cancelInstallBtn').addEventListener('click', closeInstallModal);
  document.getElementById('confirmInstallBtn').addEventListener('click', performInstall);
  elements.selectAllEntries.addEventListener('change', toggleSelectAll);
  elements.installSearch.addEventListener('input', filterInstallEntries);

  // Uninstall modal
  document.getElementById('closeUninstallModal').addEventListener('click', closeUninstallModal);
  document.getElementById('cancelUninstallBtn').addEventListener('click', closeUninstallModal);
  document.getElementById('confirmUninstallBtn').addEventListener('click', performUninstall);

  // Close modals on backdrop click
  elements.previewModal.addEventListener('click', (e) => {
    if (e.target === elements.previewModal) closePreviewModal();
  });
  elements.installModal.addEventListener('click', (e) => {
    if (e.target === elements.installModal) closeInstallModal();
  });
  elements.uninstallModal.addEventListener('click', (e) => {
    if (e.target === elements.uninstallModal) closeUninstallModal();
  });
}

/**
 * Load all required data
 */
async function loadData() {
  showLoading();

  try {
    // Load local data
    const storageData = await AdminShared.loadStorageData();
    existingWikiEntries = storageData.wikiEntries || [];

    // Load installed libraries from storage
    installedLibraries = await AdminShared.getInstalledLibraries();

    // Fetch manifest from remote
    await fetchManifest();

    // Render UI
    renderLibraries();
    showContent();
  } catch (error) {
    console.error('Failed to load libraries:', error);
    showError(error.message || 'Failed to load libraries. Please try again.');
  }
}

/**
 * Fetch the libraries manifest
 */
async function fetchManifest() {
  const response = await fetch(MANIFEST_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch library manifest (${response.status})`);
  }
  librariesManifest = await response.json();
}

/**
 * Fetch a specific library's entries
 */
async function fetchLibraryEntries(library) {
  const url = `${LIBRARIES_BASE_URL}/${library.file}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch library: ${library.name}`);
  }
  const data = await response.json();
  return data.entries || [];
}

/**
 * Show loading state
 */
function showLoading() {
  elements.loading.style.display = 'flex';
  elements.error.style.display = 'none';
  elements.content.style.display = 'none';
}

/**
 * Show error state
 */
function showError(message) {
  elements.loading.style.display = 'none';
  elements.error.style.display = 'flex';
  elements.content.style.display = 'none';
  elements.errorMessage.textContent = message;
}

/**
 * Show content
 */
function showContent() {
  elements.loading.style.display = 'none';
  elements.error.style.display = 'none';
  elements.content.style.display = 'block';
}

/**
 * Render all libraries
 */
function renderLibraries() {
  const installed = [];
  const available = [];

  for (const library of librariesManifest.libraries) {
    if (installedLibraries[library.id]) {
      installed.push(library);
    } else {
      available.push(library);
    }
  }

  // Render installed section
  if (installed.length > 0) {
    elements.installedSection.style.display = 'block';
    elements.installedGrid.innerHTML = installed.map(lib => renderInstalledCard(lib)).join('');

    // Add event listeners
    elements.installedGrid.querySelectorAll('.library-card').forEach(card => {
      const libraryId = card.dataset.libraryId;
      card.querySelector('.btn-uninstall')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openUninstallModal(libraryId);
      });
      card.querySelector('.btn-reinstall')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const library = librariesManifest.libraries.find(l => l.id === libraryId);
        if (library) openInstallModal(library);
      });
    });
  } else {
    elements.installedSection.style.display = 'none';
  }

  // Render available section
  elements.availableGrid.innerHTML = available.length > 0
    ? available.map(lib => renderAvailableCard(lib)).join('')
    : '<p class="no-libraries">All libraries have been installed!</p>';

  // Add event listeners for available cards
  elements.availableGrid.querySelectorAll('.library-card').forEach(card => {
    const libraryId = card.dataset.libraryId;
    const library = librariesManifest.libraries.find(l => l.id === libraryId);

    card.querySelector('.btn-preview')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openPreviewModal(library);
    });
    card.querySelector('.btn-install')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openInstallModal(library);
    });
  });
}

/**
 * Render an installed library card
 */
function renderInstalledCard(library) {
  const installInfo = installedLibraries[library.id];
  const installedDate = new Date(installInfo.installedAt).toLocaleDateString();
  const entryCount = installInfo.entryIds?.length || 0;
  const hasUpdate = installInfo.version !== library.version;

  return `
    <div class="library-card library-card--installed" data-library-id="${library.id}">
      <div class="library-card-header">
        <div class="library-icon library-icon--${library.category || 'general'}">
          <span class="icon icon-${getLibraryIcon(library.icon || library.category)}"></span>
        </div>
        <div class="library-card-badge installed">
          <span class="icon icon-check icon--xs"></span> Installed
        </div>
      </div>
      <h4 class="library-card-title">${AdminShared.escapeHtml(library.name)}</h4>
      <p class="library-card-description">${AdminShared.escapeHtml(library.description)}</p>
      <div class="library-card-meta">
        <span class="meta-item">
          <span class="icon icon-book icon--xs"></span> ${entryCount} entries
        </span>
        <span class="meta-item">
          <span class="icon icon-calendar icon--xs"></span> ${installedDate}
        </span>
      </div>
      ${hasUpdate ? `
        <div class="library-update-badge">
          <span class="icon icon-arrow-up icon--xs"></span> Update available (v${library.version})
        </div>
      ` : ''}
      <div class="library-card-actions">
        <button class="btn btn-secondary btn-sm btn-reinstall">
          ${hasUpdate ? 'Update' : 'Reinstall'}
        </button>
        <button class="btn btn-danger btn-sm btn-uninstall">
          <span class="icon icon-trash icon--sm"></span>
        </button>
      </div>
    </div>
  `;
}

/**
 * Render an available library card
 */
function renderAvailableCard(library) {
  return `
    <div class="library-card" data-library-id="${library.id}">
      <div class="library-card-header">
        <div class="library-icon library-icon--${library.category || 'general'}">
          <span class="icon icon-${getLibraryIcon(library.icon || library.category)}"></span>
        </div>
        <span class="library-card-version">v${library.version}</span>
      </div>
      <h4 class="library-card-title">${AdminShared.escapeHtml(library.name)}</h4>
      <p class="library-card-description">${AdminShared.escapeHtml(library.description)}</p>
      <div class="library-card-meta">
        <span class="meta-item">
          <span class="icon icon-book icon--xs"></span> ${library.entryCount} entries
        </span>
      </div>
      <div class="library-card-actions">
        <button class="btn btn-secondary btn-sm btn-preview">Preview</button>
        <button class="btn btn-primary btn-sm btn-install">
          <span class="icon icon-download icon--sm"></span> Install
        </button>
      </div>
    </div>
  `;
}

/**
 * Get icon name for library category
 */
function getLibraryIcon(category) {
  const icons = {
    hubspot: 'hub',
    sales: 'dollar-sign',
    marketing: 'megaphone',
    service: 'headphones',
    contacts: 'users',
    general: 'book'
  };
  return icons[category] || 'book';
}

/**
 * Open preview modal
 */
async function openPreviewModal(library) {
  currentLibrary = library;

  elements.previewModalTitle.textContent = library.name;
  elements.previewDescription.textContent = library.description;
  elements.previewEntryCount.textContent = library.entryCount;
  elements.previewVersion.textContent = library.version;
  elements.previewSearch.value = '';
  elements.previewEntriesList.innerHTML = '<div class="loading-entries">Loading entries...</div>';

  elements.previewModal.classList.add('open');

  try {
    currentLibraryEntries = await fetchLibraryEntries(library);
    renderPreviewEntries();
  } catch (error) {
    elements.previewEntriesList.innerHTML = `<div class="error-message">Failed to load entries: ${error.message}</div>`;
  }
}

/**
 * Render preview entries list
 */
function renderPreviewEntries(filter = '') {
  const filtered = currentLibraryEntries.filter(entry => {
    const searchText = `${entry.title} ${entry.trigger || ''} ${entry.category || ''}`.toLowerCase();
    return searchText.includes(filter.toLowerCase());
  });

  elements.previewEntriesList.innerHTML = filtered.map(entry => `
    <div class="preview-entry-item">
      <div class="preview-entry-info">
        <span class="preview-entry-title">${AdminShared.escapeHtml(entry.title)}</span>
        ${entry.trigger ? `<span class="preview-entry-trigger">${AdminShared.escapeHtml(entry.trigger)}</span>` : ''}
      </div>
      <span class="preview-entry-category badge-category">${AdminShared.escapeHtml(entry.category || 'general')}</span>
    </div>
  `).join('');
}

/**
 * Filter preview entries
 */
function filterPreviewEntries() {
  renderPreviewEntries(elements.previewSearch.value);
}

/**
 * Close preview modal
 */
function closePreviewModal() {
  elements.previewModal.classList.remove('open');
  currentLibrary = null;
  currentLibraryEntries = [];
}

/**
 * Open install modal with smart merge
 */
async function openInstallModal(library) {
  currentLibrary = library;

  elements.installModalTitle.textContent = `Install ${library.name}`;
  elements.installSearch.value = '';
  elements.selectAllEntries.checked = true;
  elements.installEntriesList.innerHTML = '<div class="loading-entries">Analyzing entries...</div>';

  elements.installModal.classList.add('open');

  try {
    // Fetch entries if not already loaded
    if (currentLibraryEntries.length === 0 || currentLibrary.id !== library.id) {
      currentLibraryEntries = await fetchLibraryEntries(library);
    }

    // Analyze entries for duplicates
    const analysis = analyzeEntries(currentLibraryEntries);

    // Render summary
    elements.installSummary.innerHTML = `
      <div class="install-summary-stats">
        <span class="summary-stat summary-stat--new">
          <span class="icon icon-plus icon--sm"></span>
          <strong>${analysis.newCount}</strong> new entries
        </span>
        ${analysis.duplicateCount > 0 ? `
          <span class="summary-stat summary-stat--duplicate">
            <span class="icon icon-copy icon--sm"></span>
            <strong>${analysis.duplicateCount}</strong> duplicates found
          </span>
        ` : ''}
      </div>
      ${analysis.duplicateCount > 0 ? `
        <p class="install-summary-hint">Duplicates are unchecked by default. Select them to replace existing entries.</p>
      ` : ''}
    `;

    // Render entries
    renderInstallEntries(analysis.entries);
    updateInstallCount();

  } catch (error) {
    elements.installEntriesList.innerHTML = `<div class="error-message">Failed to analyze entries: ${error.message}</div>`;
  }
}

/**
 * Analyze library entries against existing wiki entries
 */
function analyzeEntries(libraryEntries) {
  const entries = [];
  let newCount = 0;
  let duplicateCount = 0;

  // Build lookup maps for existing entries
  const existingByTrigger = new Map();
  const existingByTitle = new Map();

  for (const entry of existingWikiEntries) {
    const trigger = (entry.trigger || entry.term || '').toLowerCase().trim();
    if (trigger) {
      existingByTrigger.set(trigger, entry);
    }
    existingByTitle.set(entry.title.toLowerCase().trim(), entry);

    // Also check aliases
    if (entry.aliases) {
      for (const alias of entry.aliases) {
        existingByTrigger.set(alias.toLowerCase().trim(), entry);
      }
    }
  }

  for (const libEntry of libraryEntries) {
    const trigger = (libEntry.trigger || '').toLowerCase().trim();
    const title = libEntry.title.toLowerCase().trim();

    // Check for duplicate by trigger or title
    const existingByTrig = trigger ? existingByTrigger.get(trigger) : null;
    const existingByTit = existingByTitle.get(title);
    const existing = existingByTrig || existingByTit;

    if (existing) {
      duplicateCount++;
      entries.push({
        ...libEntry,
        _status: 'duplicate',
        _existingId: existing.id,
        _existingTitle: existing.title,
        _selected: false // Duplicates unchecked by default
      });
    } else {
      newCount++;
      entries.push({
        ...libEntry,
        _status: 'new',
        _selected: true // New entries checked by default
      });
    }
  }

  return { entries, newCount, duplicateCount };
}

/**
 * Render install entries list
 */
function renderInstallEntries(entries, filter = '') {
  // Store entries for later use
  window._installEntries = entries;

  const filtered = entries.filter(entry => {
    const searchText = `${entry.title} ${entry.trigger || ''} ${entry.category || ''}`.toLowerCase();
    return searchText.includes(filter.toLowerCase());
  });

  elements.installEntriesList.innerHTML = filtered.map((entry, index) => {
    const originalIndex = entries.indexOf(entry);
    return `
      <div class="install-entry-item ${entry._status === 'duplicate' ? 'is-duplicate' : ''}" data-index="${originalIndex}">
        <label class="checkbox-label">
          <input type="checkbox" class="entry-checkbox" ${entry._selected ? 'checked' : ''}>
        </label>
        <div class="install-entry-info">
          <span class="install-entry-title">${AdminShared.escapeHtml(entry.title)}</span>
          ${entry.trigger ? `<span class="install-entry-trigger">${AdminShared.escapeHtml(entry.trigger)}</span>` : ''}
        </div>
        <div class="install-entry-status">
          ${entry._status === 'new'
            ? '<span class="status-badge status-badge--new">New</span>'
            : `<span class="status-badge status-badge--duplicate" title="Existing: ${AdminShared.escapeHtml(entry._existingTitle)}">Duplicate</span>`
          }
        </div>
      </div>
    `;
  }).join('');

  // Add checkbox listeners
  elements.installEntriesList.querySelectorAll('.entry-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const index = parseInt(e.target.closest('.install-entry-item').dataset.index);
      window._installEntries[index]._selected = e.target.checked;
      updateInstallCount();
      updateSelectAllState();
    });
  });
}

/**
 * Filter install entries
 */
function filterInstallEntries() {
  if (window._installEntries) {
    renderInstallEntries(window._installEntries, elements.installSearch.value);
  }
}

/**
 * Toggle select all
 */
function toggleSelectAll() {
  const checked = elements.selectAllEntries.checked;
  if (window._installEntries) {
    window._installEntries.forEach(entry => {
      entry._selected = checked;
    });
    renderInstallEntries(window._installEntries, elements.installSearch.value);
    updateInstallCount();
  }
}

/**
 * Update select all checkbox state
 */
function updateSelectAllState() {
  if (window._installEntries) {
    const allSelected = window._installEntries.every(e => e._selected);
    const someSelected = window._installEntries.some(e => e._selected);
    elements.selectAllEntries.checked = allSelected;
    elements.selectAllEntries.indeterminate = someSelected && !allSelected;
  }
}

/**
 * Update install count display
 */
function updateInstallCount() {
  if (window._installEntries) {
    const count = window._installEntries.filter(e => e._selected).length;
    elements.installCount.textContent = count;
  }
}

/**
 * Close install modal
 */
function closeInstallModal() {
  elements.installModal.classList.remove('open');
  window._installEntries = null;
}

/**
 * Perform the installation
 */
async function performInstall() {
  if (!window._installEntries || !currentLibrary) return;

  const selectedEntries = window._installEntries.filter(e => e._selected);
  if (selectedEntries.length === 0) {
    AdminShared.showToast('Please select at least one entry to install', 'error');
    return;
  }

  const confirmBtn = document.getElementById('confirmInstallBtn');
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = '<span class="icon icon-loader icon--sm spinning"></span> Installing...';

  try {
    // Load current data
    const data = await AdminShared.loadStorageData();
    const wikiEntries = data.wikiEntries || [];
    const entryIds = [];

    // Process selected entries
    for (const entry of selectedEntries) {
      // Remove internal properties
      const { _status, _existingId, _existingTitle, _selected, ...cleanEntry } = entry;

      // If duplicate, remove existing entry first
      if (_status === 'duplicate' && _existingId) {
        const existingIndex = wikiEntries.findIndex(e => e.id === _existingId);
        if (existingIndex !== -1) {
          wikiEntries.splice(existingIndex, 1);
        }
      }

      // Generate new ID and timestamps
      const newEntry = {
        ...cleanEntry,
        id: `wiki_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        enabled: true
      };

      wikiEntries.push(newEntry);
      entryIds.push(newEntry.id);

      // Small delay to ensure unique IDs
      await new Promise(r => setTimeout(r, 1));
    }

    // Save to Supabase in web context, or Chrome storage in extension
    let successCount = 0;
    let errorCount = 0;
    const createdEntryIds = []; // Track actual IDs from Supabase

    if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
      // Web context - insert entries directly to Supabase
      for (const entry of selectedEntries) {
        const { _status, _existingId, _existingTitle, _selected, ...cleanEntry } = entry;

        // If duplicate, delete existing first
        if (_status === 'duplicate' && _existingId) {
          await RevGuideDB.deleteWikiEntry(_existingId);
        }

        // Map camelCase to snake_case for Supabase
        const mappedEntry = AdminShared.mapWikiToSupabase(cleanEntry);
        console.log('[Library Install] Mapped entry:', mappedEntry);

        const { data, error } = await RevGuideDB.createWikiEntry(mappedEntry);
        if (error) {
          console.error('[Library Install] Failed to create wiki entry:', error);
          errorCount++;
        } else {
          console.log('[Library Install] Created entry:', data);
          successCount++;
          // Store the actual Supabase ID
          if (data?.id) {
            createdEntryIds.push(data.id);
          }
        }
      }
      AdminShared.clearStorageCache();
    } else {
      // Extension context - save full array
      await AdminShared.saveStorageData({ wikiEntries });
      successCount = selectedEntries.length;
      // Use the locally generated IDs for extension context
      createdEntryIds.push(...entryIds);
    }

    // Update installed libraries tracking with actual IDs
    const updatedInstalledLibraries = await AdminShared.getInstalledLibraries();
    updatedInstalledLibraries[currentLibrary.id] = {
      version: currentLibrary.version,
      installedAt: Date.now(),
      entryIds: createdEntryIds
    };

    // Only mark as installed if at least some entries were created
    if (successCount > 0) {
      await AdminShared.saveInstalledLibraries(updatedInstalledLibraries);
      installedLibraries = updatedInstalledLibraries;
      existingWikiEntries = wikiEntries;
    }

    // Close modal and refresh
    closeInstallModal();
    renderLibraries();

    // Show appropriate message
    if (errorCount > 0 && successCount > 0) {
      AdminShared.showToast(`Installed ${successCount} entries, ${errorCount} failed. Check console for details.`, 'warning');
    } else if (errorCount > 0 && successCount === 0) {
      AdminShared.showToast(`Installation failed: All ${errorCount} entries failed. Check console for details.`, 'error');
    } else {
      AdminShared.showToast(`Successfully installed ${successCount} entries from ${currentLibrary.name}`, 'success');
    }
    AdminShared.notifyContentScript();

  } catch (error) {
    console.error('Install failed:', error);
    AdminShared.showToast(`Installation failed: ${error.message}`, 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '<span class="icon icon-download icon--sm"></span> Install <span id="installCount">0</span> Entries';
  }
}

/**
 * Open uninstall modal
 */
function openUninstallModal(libraryId) {
  currentLibrary = librariesManifest.libraries.find(l => l.id === libraryId);
  if (!currentLibrary) return;

  const installInfo = installedLibraries[libraryId];
  const entryCount = installInfo?.entryIds?.length || 0;

  elements.uninstallMessage.textContent = `Are you sure you want to uninstall "${currentLibrary.name}"? This will remove ${entryCount} wiki entries.`;
  elements.uninstallWarning.style.display = 'none'; // TODO: Check for modifications

  elements.uninstallModal.classList.add('open');
}

/**
 * Close uninstall modal
 */
function closeUninstallModal() {
  elements.uninstallModal.classList.remove('open');
}

/**
 * Perform uninstall
 */
async function performUninstall() {
  if (!currentLibrary) return;

  const confirmBtn = document.getElementById('confirmUninstallBtn');
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = '<span class="icon icon-loader icon--sm spinning"></span> Removing...';

  try {
    const installInfo = installedLibraries[currentLibrary.id];
    if (!installInfo) throw new Error('Library not found in installed list');

    // Load current data
    const data = await AdminShared.loadStorageData();
    let wikiEntries = data.wikiEntries || [];

    // Remove entries from this library
    const entryIdsToRemove = installInfo.entryIds || [];

    // Delete from Supabase in web context
    if (!AdminShared.isExtensionContext && typeof RevGuideDB !== 'undefined') {
      for (const entryId of entryIdsToRemove) {
        try {
          const { error } = await RevGuideDB.deleteWikiEntry(entryId);
          if (error) console.error(`[Library Uninstall] Failed to delete ${entryId}:`, error);
        } catch (e) {
          console.error(`[Library Uninstall] Failed to delete ${entryId}:`, e);
        }
      }
      AdminShared.clearStorageCache();
    } else {
      // Extension context - save filtered array
      wikiEntries = wikiEntries.filter(entry => !entryIdsToRemove.includes(entry.id));
      await AdminShared.saveStorageData({ wikiEntries });
    }

    // Remove from local array
    wikiEntries = wikiEntries.filter(entry => !entryIdsToRemove.includes(entry.id));

    // Remove from installed libraries
    delete installedLibraries[currentLibrary.id];

    await AdminShared.saveInstalledLibraries(installedLibraries);

    // Update local state
    existingWikiEntries = wikiEntries;

    // Close modal and refresh
    closeUninstallModal();
    renderLibraries();

    AdminShared.showToast(`Successfully uninstalled ${currentLibrary.name}`, 'success');
    AdminShared.notifyContentScript();

  } catch (error) {
    console.error('Uninstall failed:', error);
    AdminShared.showToast(`Uninstall failed: ${error.message}`, 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '<span class="icon icon-trash icon--sm"></span> Uninstall';
  }
}

// ============================================
// Partner Libraries Feature
// ============================================

// Partner state
let userIsPartner = false;
let myLibraries = [];
let partnerClients = [];
let currentEditingLibraryId = null;
let orgWikiEntries = [];
let orgPlays = [];
let orgBanners = [];
let selectedContent = {
  wikiEntries: new Set(),
  plays: new Set(),
  banners: new Set()
};
let activeLibraryTab = 'wiki';

// Partner DOM elements
const partnerElements = {
  myLibrariesSection: null,
  myLibrariesGrid: null,
  myLibrariesEmptyState: null,
  createLibraryBtn: null,
  libraryEditorModal: null,
  libraryEditorTitle: null,
  libraryName: null,
  libraryDescription: null,
  libraryTabs: null,
  libraryContentSearch: null,
  libraryContentList: null,
  libraryContentEmpty: null,
  deleteLibraryModal: null,
  installToOrgModal: null,
  installOrgList: null
};

/**
 * Initialize partner features
 */
async function initPartnerFeatures() {
  // Check if user is a partner
  if (typeof RevGuideDB !== 'undefined') {
    userIsPartner = await RevGuideDB.isPartner();
  }

  if (!userIsPartner) {
    return;
  }

  // Cache partner DOM elements
  cachePartnerElements();

  // Show My Libraries section
  partnerElements.myLibrariesSection.style.display = 'block';

  // Load partner data
  await loadPartnerData();

  // Render My Libraries
  renderMyLibraries();

  // Set up partner event listeners
  setupPartnerEventListeners();

  // Check for edit param
  const urlParams = new URLSearchParams(window.location.search);
  const editLibraryId = urlParams.get('edit');
  if (editLibraryId) {
    openLibraryEditor(editLibraryId);
  }
}

/**
 * Cache partner DOM elements
 */
function cachePartnerElements() {
  partnerElements.myLibrariesSection = document.getElementById('myLibrariesSection');
  partnerElements.myLibrariesGrid = document.getElementById('myLibrariesGrid');
  partnerElements.myLibrariesEmptyState = document.getElementById('myLibrariesEmptyState');
  partnerElements.createLibraryBtn = document.getElementById('createLibraryBtn');
  partnerElements.libraryEditorModal = document.getElementById('libraryEditorModal');
  partnerElements.libraryEditorTitle = document.getElementById('libraryEditorTitle');
  partnerElements.libraryName = document.getElementById('libraryName');
  partnerElements.libraryDescription = document.getElementById('libraryDescription');
  partnerElements.libraryTabs = document.querySelectorAll('.library-tab');
  partnerElements.libraryContentSearch = document.getElementById('libraryContentSearch');
  partnerElements.libraryContentList = document.getElementById('libraryContentList');
  partnerElements.libraryContentEmpty = document.getElementById('libraryContentEmpty');
  partnerElements.deleteLibraryModal = document.getElementById('deleteLibraryModal');
  partnerElements.installToOrgModal = document.getElementById('installToOrgModal');
  partnerElements.installOrgList = document.getElementById('installOrgList');
}

/**
 * Load partner data
 */
async function loadPartnerData() {
  try {
    const [librariesResult, clientsResult] = await Promise.all([
      RevGuideDB.getMyLibraries(),
      RevGuideDB.getPartnerClients()
    ]);

    myLibraries = librariesResult.data || [];
    partnerClients = clientsResult.data || [];
  } catch (error) {
    console.error('[Libraries] Failed to load partner data:', error);
  }
}

/**
 * Set up partner event listeners
 */
function setupPartnerEventListeners() {
  // Create Library button
  partnerElements.createLibraryBtn?.addEventListener('click', () => openLibraryEditor());

  // Library editor modal
  document.getElementById('closeLibraryEditorModal')?.addEventListener('click', closeLibraryEditor);
  document.getElementById('cancelLibraryEditorBtn')?.addEventListener('click', closeLibraryEditor);
  document.getElementById('saveLibraryBtn')?.addEventListener('click', saveLibrary);

  // Library tabs
  partnerElements.libraryTabs?.forEach(tab => {
    tab.addEventListener('click', () => switchLibraryTab(tab.dataset.tab));
  });

  // Content search
  partnerElements.libraryContentSearch?.addEventListener('input', renderLibraryContent);

  // Select/Deselect all
  document.getElementById('selectAllContentBtn')?.addEventListener('click', selectAllContent);
  document.getElementById('deselectAllContentBtn')?.addEventListener('click', deselectAllContent);

  // Delete library modal
  document.getElementById('closeDeleteLibraryModal')?.addEventListener('click', closeDeleteLibraryModal);
  document.getElementById('cancelDeleteLibraryBtn')?.addEventListener('click', closeDeleteLibraryModal);
  document.getElementById('confirmDeleteLibraryBtn')?.addEventListener('click', confirmDeleteLibrary);

  // Install to org modal
  document.getElementById('closeInstallToOrgModal')?.addEventListener('click', closeInstallToOrgModal);
  document.getElementById('cancelInstallToOrgBtn')?.addEventListener('click', closeInstallToOrgModal);

  // Close modals on backdrop click
  partnerElements.libraryEditorModal?.addEventListener('click', (e) => {
    if (e.target === partnerElements.libraryEditorModal) closeLibraryEditor();
  });
  partnerElements.deleteLibraryModal?.addEventListener('click', (e) => {
    if (e.target === partnerElements.deleteLibraryModal) closeDeleteLibraryModal();
  });
  partnerElements.installToOrgModal?.addEventListener('click', (e) => {
    if (e.target === partnerElements.installToOrgModal) closeInstallToOrgModal();
  });
}

/**
 * Render My Libraries grid
 */
function renderMyLibraries() {
  if (!myLibraries.length) {
    partnerElements.myLibrariesGrid.style.display = 'none';
    partnerElements.myLibrariesEmptyState.style.display = 'block';
    return;
  }

  partnerElements.myLibrariesGrid.style.display = 'grid';
  partnerElements.myLibrariesEmptyState.style.display = 'none';

  partnerElements.myLibrariesGrid.innerHTML = myLibraries.map(lib => {
    const content = lib.content || { wikiEntries: [], plays: [], banners: [] };
    const wikiCount = content.wikiEntries?.length || 0;
    const playsCount = content.plays?.length || 0;
    const bannersCount = content.banners?.length || 0;

    return `
      <div class="library-card library-card--partner" data-library-id="${lib.id}">
        <div class="library-card-header">
          <div class="library-icon">
            <span class="icon icon-folder"></span>
          </div>
          <span class="library-card-version">v${lib.version || '1.0.0'}</span>
        </div>
        <h4 class="library-card-title">${AdminShared.escapeHtml(lib.name)}</h4>
        <p class="library-card-description">${AdminShared.escapeHtml(lib.description || 'No description')}</p>
        <div class="library-card-content-counts">
          <span class="content-count">
            <span class="icon icon-book icon--xs"></span> ${wikiCount} wiki
          </span>
          <span class="content-count">
            <span class="icon icon-layers icon--xs"></span> ${playsCount} plays
          </span>
          <span class="content-count">
            <span class="icon icon-flag icon--xs"></span> ${bannersCount} banners
          </span>
        </div>
        <div class="library-card-actions">
          <button class="btn btn-secondary btn-sm btn-edit-library" data-library-id="${lib.id}">Edit</button>
          <button class="btn btn-primary btn-sm btn-install-library" data-library-id="${lib.id}">
            <span class="icon icon-download icon--sm"></span> Install
          </button>
          <button class="btn btn-danger btn-sm btn-delete-library" data-library-id="${lib.id}">
            <span class="icon icon-trash icon--sm"></span>
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Add event listeners for card buttons
  partnerElements.myLibrariesGrid.querySelectorAll('.btn-edit-library').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openLibraryEditor(btn.dataset.libraryId);
    });
  });

  partnerElements.myLibrariesGrid.querySelectorAll('.btn-install-library').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openInstallToOrgModal(btn.dataset.libraryId);
    });
  });

  partnerElements.myLibrariesGrid.querySelectorAll('.btn-delete-library').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDeleteLibraryModal(btn.dataset.libraryId);
    });
  });
}

/**
 * Open library editor modal
 */
async function openLibraryEditor(libraryId = null) {
  currentEditingLibraryId = libraryId;

  // Reset selection
  selectedContent = {
    wikiEntries: new Set(),
    plays: new Set(),
    banners: new Set()
  };

  // Load org content
  await loadOrgContent();

  if (libraryId) {
    // Edit mode - load existing library
    const library = myLibraries.find(l => l.id === libraryId);
    if (!library) {
      // Try fetching from API
      const { data, error } = await RevGuideDB.getLibraryById(libraryId);
      if (error || !data) {
        AdminShared.showToast('Library not found', 'error');
        return;
      }
      Object.assign(library || {}, data);
    }

    partnerElements.libraryEditorTitle.textContent = 'Edit Library';
    partnerElements.libraryName.value = library?.name || '';
    partnerElements.libraryDescription.value = library?.description || '';

    // Pre-select existing content
    const content = library?.content || {};
    (content.wikiEntries || []).forEach(e => selectedContent.wikiEntries.add(e.id));
    (content.plays || []).forEach(e => selectedContent.plays.add(e.id));
    (content.banners || []).forEach(e => selectedContent.banners.add(e.id));
  } else {
    // Create mode
    partnerElements.libraryEditorTitle.textContent = 'Create Library';
    partnerElements.libraryName.value = '';
    partnerElements.libraryDescription.value = '';
  }

  // Reset to wiki tab
  activeLibraryTab = 'wiki';
  updateLibraryTabs();
  renderLibraryContent();
  updateSelectionSummary();

  partnerElements.libraryEditorModal.classList.add('open');
  partnerElements.libraryName.focus();
}

/**
 * Close library editor modal
 */
function closeLibraryEditor() {
  partnerElements.libraryEditorModal.classList.remove('open');
  currentEditingLibraryId = null;

  // Clear URL param if present
  const url = new URL(window.location);
  if (url.searchParams.has('edit')) {
    url.searchParams.delete('edit');
    window.history.replaceState({}, '', url);
  }
}

/**
 * Load organization content for selection
 */
async function loadOrgContent() {
  try {
    const data = await AdminShared.loadStorageData();
    orgWikiEntries = data.wikiEntries || [];
    orgPlays = data.battleCards || [];
    orgBanners = data.rules || [];
  } catch (error) {
    console.error('[Libraries] Failed to load org content:', error);
    orgWikiEntries = [];
    orgPlays = [];
    orgBanners = [];
  }
}

/**
 * Switch library tab
 */
function switchLibraryTab(tab) {
  activeLibraryTab = tab;
  updateLibraryTabs();
  renderLibraryContent();
}

/**
 * Update library tabs UI
 */
function updateLibraryTabs() {
  partnerElements.libraryTabs?.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === activeLibraryTab);
  });

  // Update tab counts
  document.getElementById('wikiTabCount').textContent = `(${selectedContent.wikiEntries.size})`;
  document.getElementById('playsTabCount').textContent = `(${selectedContent.plays.size})`;
  document.getElementById('bannersTabCount').textContent = `(${selectedContent.banners.size})`;
}

/**
 * Render library content list based on active tab
 */
function renderLibraryContent() {
  const searchTerm = (partnerElements.libraryContentSearch?.value || '').toLowerCase();

  let items = [];
  let selectedSet = null;
  let contentType = '';

  switch (activeLibraryTab) {
    case 'wiki':
      items = orgWikiEntries;
      selectedSet = selectedContent.wikiEntries;
      contentType = 'wiki';
      break;
    case 'plays':
      items = orgPlays;
      selectedSet = selectedContent.plays;
      contentType = 'plays';
      break;
    case 'banners':
      items = orgBanners;
      selectedSet = selectedContent.banners;
      contentType = 'banners';
      break;
  }

  // Filter by search
  const filtered = items.filter(item => {
    const title = (item.title || item.name || '').toLowerCase();
    const trigger = (item.trigger || '').toLowerCase();
    return title.includes(searchTerm) || trigger.includes(searchTerm);
  });

  if (filtered.length === 0) {
    partnerElements.libraryContentList.style.display = 'none';
    partnerElements.libraryContentEmpty.style.display = 'block';
    return;
  }

  partnerElements.libraryContentList.style.display = 'block';
  partnerElements.libraryContentEmpty.style.display = 'none';

  partnerElements.libraryContentList.innerHTML = filtered.map(item => {
    const id = item.id;
    const title = item.title || item.name || 'Untitled';
    const meta = getMeta(item, contentType);
    const isSelected = selectedSet.has(id);

    return `
      <div class="library-content-item ${isSelected ? 'selected' : ''}" data-id="${id}" data-type="${contentType}">
        <label class="checkbox-label">
          <input type="checkbox" ${isSelected ? 'checked' : ''}>
        </label>
        <div class="library-content-info">
          <div class="library-content-title">${AdminShared.escapeHtml(title)}</div>
          ${meta ? `<div class="library-content-meta">${AdminShared.escapeHtml(meta)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Add checkbox listeners
  partnerElements.libraryContentList.querySelectorAll('.library-content-item').forEach(item => {
    const checkbox = item.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', () => {
      const id = item.dataset.id;
      const type = item.dataset.type;

      if (checkbox.checked) {
        selectedContent[type === 'wiki' ? 'wikiEntries' : type].add(id);
        item.classList.add('selected');
      } else {
        selectedContent[type === 'wiki' ? 'wikiEntries' : type].delete(id);
        item.classList.remove('selected');
      }

      updateLibraryTabs();
      updateSelectionSummary();
    });

    // Click anywhere on row to toggle
    item.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      }
    });
  });
}

/**
 * Get metadata string for content item
 */
function getMeta(item, type) {
  switch (type) {
    case 'wiki':
      return item.trigger || item.category || '';
    case 'plays':
      return item.objectType || item.subtitle || '';
    case 'banners':
      return item.type || item.objectType || '';
    default:
      return '';
  }
}

/**
 * Update selection summary
 */
function updateSelectionSummary() {
  document.getElementById('selectedWikiCount').textContent = selectedContent.wikiEntries.size;
  document.getElementById('selectedPlaysCount').textContent = selectedContent.plays.size;
  document.getElementById('selectedBannersCount').textContent = selectedContent.banners.size;
}

/**
 * Select all content in current tab
 */
function selectAllContent() {
  let items = [];
  let selectedSet = null;

  switch (activeLibraryTab) {
    case 'wiki':
      items = orgWikiEntries;
      selectedSet = selectedContent.wikiEntries;
      break;
    case 'plays':
      items = orgPlays;
      selectedSet = selectedContent.plays;
      break;
    case 'banners':
      items = orgBanners;
      selectedSet = selectedContent.banners;
      break;
  }

  items.forEach(item => selectedSet.add(item.id));
  renderLibraryContent();
  updateLibraryTabs();
  updateSelectionSummary();
}

/**
 * Deselect all content in current tab
 */
function deselectAllContent() {
  switch (activeLibraryTab) {
    case 'wiki':
      selectedContent.wikiEntries.clear();
      break;
    case 'plays':
      selectedContent.plays.clear();
      break;
    case 'banners':
      selectedContent.banners.clear();
      break;
  }

  renderLibraryContent();
  updateLibraryTabs();
  updateSelectionSummary();
}

/**
 * Save library
 */
async function saveLibrary() {
  const name = partnerElements.libraryName.value.trim();
  const description = partnerElements.libraryDescription.value.trim();

  if (!name) {
    AdminShared.showToast('Please enter a library name', 'error');
    partnerElements.libraryName.focus();
    return;
  }

  const saveBtn = document.getElementById('saveLibraryBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="icon icon-loader icon--sm spinning"></span> Saving...';

  try {
    // Build content object with full item data
    const content = {
      wikiEntries: orgWikiEntries.filter(e => selectedContent.wikiEntries.has(e.id)),
      plays: orgPlays.filter(e => selectedContent.plays.has(e.id)),
      banners: orgBanners.filter(e => selectedContent.banners.has(e.id))
    };

    let result;
    if (currentEditingLibraryId) {
      // Update existing
      result = await RevGuideDB.updateLibrary(currentEditingLibraryId, {
        name,
        description,
        content
      });
    } else {
      // Create new
      result = await RevGuideDB.createLibrary({
        name,
        description,
        content
      });
    }

    if (result.error) {
      throw result.error;
    }

    AdminShared.showToast(
      currentEditingLibraryId ? 'Library updated successfully' : 'Library created successfully',
      'success'
    );

    // Reload partner data and re-render
    await loadPartnerData();
    renderMyLibraries();

    closeLibraryEditor();

  } catch (error) {
    console.error('[Libraries] Save library error:', error);
    AdminShared.showToast(error.message || 'Failed to save library', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<span class="icon icon-save icon--sm"></span> Save Library';
  }
}

/**
 * Open delete library modal
 */
let deleteLibraryId = null;

function openDeleteLibraryModal(libraryId) {
  deleteLibraryId = libraryId;
  const library = myLibraries.find(l => l.id === libraryId);

  if (library) {
    document.getElementById('deleteLibraryMessage').textContent =
      `Are you sure you want to delete "${library.name}"? This action cannot be undone.`;
  }

  partnerElements.deleteLibraryModal.classList.add('open');
}

function closeDeleteLibraryModal() {
  partnerElements.deleteLibraryModal.classList.remove('open');
  deleteLibraryId = null;
}

async function confirmDeleteLibrary() {
  if (!deleteLibraryId) return;

  const confirmBtn = document.getElementById('confirmDeleteLibraryBtn');
  confirmBtn.disabled = true;
  confirmBtn.innerHTML = '<span class="icon icon-loader icon--sm spinning"></span> Deleting...';

  try {
    const { error } = await RevGuideDB.deleteLibrary(deleteLibraryId);

    if (error) {
      throw error;
    }

    AdminShared.showToast('Library deleted successfully', 'success');

    // Reload partner data and re-render
    await loadPartnerData();
    renderMyLibraries();

    closeDeleteLibraryModal();

  } catch (error) {
    console.error('[Libraries] Delete library error:', error);
    AdminShared.showToast(error.message || 'Failed to delete library', 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = '<span class="icon icon-trash icon--sm"></span> Delete Library';
  }
}

/**
 * Open install to org modal
 */
let installLibraryId = null;

function openInstallToOrgModal(libraryId) {
  installLibraryId = libraryId;

  const library = myLibraries.find(l => l.id === libraryId);
  if (library) {
    document.querySelector('#installToOrgModal .modal-header h2').textContent =
      `Install "${library.name}"`;
  }

  renderOrgList();
  partnerElements.installToOrgModal.classList.add('open');
}

function closeInstallToOrgModal() {
  partnerElements.installToOrgModal.classList.remove('open');
  installLibraryId = null;
}

/**
 * Render organization list for install modal
 */
function renderOrgList() {
  const orgListEmpty = document.getElementById('installOrgListEmpty');

  if (!partnerClients.length) {
    partnerElements.installOrgList.style.display = 'none';
    orgListEmpty.style.display = 'block';
    return;
  }

  partnerElements.installOrgList.style.display = 'flex';
  orgListEmpty.style.display = 'none';

  // Simple hash for colors (same as partner dashboard)
  const getColor = (orgId) => {
    const colors = [
      '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
      '#f97316', '#eab308', '#22c55e', '#14b8a6',
      '#06b6d4', '#3b82f6'
    ];
    let hash = 0;
    for (let i = 0; i < (orgId || '').length; i++) {
      hash = orgId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  partnerElements.installOrgList.innerHTML = partnerClients.map(client => `
    <div class="org-list-item" data-org-id="${client.organization_id}">
      <span class="org-color" style="background: ${getColor(client.organization_id)}"></span>
      <span class="org-name">${AdminShared.escapeHtml(client.organization_name)}</span>
      <span class="org-status">Click to install</span>
    </div>
  `).join('');

  // Add click listeners
  partnerElements.installOrgList.querySelectorAll('.org-list-item').forEach(item => {
    item.addEventListener('click', () => installToOrg(item.dataset.orgId, item));
  });
}

/**
 * Install library to organization
 */
async function installToOrg(orgId, itemElement) {
  if (!installLibraryId) return;

  itemElement.classList.add('installing');
  const statusEl = itemElement.querySelector('.org-status');
  statusEl.textContent = 'Installing...';

  try {
    const { data, error } = await RevGuideDB.installLibrary(installLibraryId, orgId);

    if (error) {
      throw error;
    }

    const results = data?.itemsInstalled || {};
    const total = (results.wikiEntries || 0) + (results.plays || 0) + (results.banners || 0);

    statusEl.textContent = `Installed ${total} items`;
    statusEl.classList.add('installed');

    AdminShared.showToast(`Successfully installed ${total} items`, 'success');

  } catch (error) {
    console.error('[Libraries] Install to org error:', error);
    statusEl.textContent = 'Failed';
    AdminShared.showToast(error.message || 'Failed to install library', 'error');
  } finally {
    itemElement.classList.remove('installing');
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);
