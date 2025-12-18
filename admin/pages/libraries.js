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

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);
