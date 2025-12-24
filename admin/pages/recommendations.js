/**
 * Recommended Content Admin Page
 * Manages content items for the recommendation system
 */

(function() {
  'use strict';

  // State
  let contentItems = [];
  let tags = [];
  let editingContent = null;
  let selectedTagIds = new Set();
  let deleteContentId = null;

  // DOM Elements
  const elements = {};

  /**
   * Initialize the page
   */
  async function init() {
    // Check authentication
    const isAuthenticated = await AdminShared.checkAuth();
    if (!isAuthenticated) return;

    // Render sidebar
    AdminShared.renderSidebar('recommendations');

    // Cache DOM elements
    cacheElements();

    // Check permissions
    if (!AdminShared.canEditContent()) {
      showViewerMessage();
      return;
    }

    // Set up event listeners
    setupEventListeners();

    // Load data
    await loadData();
  }

  /**
   * Cache DOM elements
   */
  function cacheElements() {
    elements.loadingState = document.getElementById('loadingState');
    elements.emptyState = document.getElementById('emptyState');
    elements.contentGrid = document.getElementById('contentGrid');
    elements.searchInput = document.getElementById('searchInput');
    elements.typeFilter = document.getElementById('typeFilter');
    elements.tagFilter = document.getElementById('tagFilter');
    elements.addContentBtn = document.getElementById('addContentBtn');
    elements.createFirstBtn = document.getElementById('createFirstBtn');
    // Content Modal
    elements.contentModal = document.getElementById('contentModal');
    elements.contentModalTitle = document.getElementById('contentModalTitle');
    elements.closeContentModal = document.getElementById('closeContentModal');
    elements.cancelContentBtn = document.getElementById('cancelContentBtn');
    elements.saveContentBtn = document.getElementById('saveContentBtn');
    elements.contentTitle = document.getElementById('contentTitle');
    elements.contentUrl = document.getElementById('contentUrl');
    elements.contentDescription = document.getElementById('contentDescription');
    elements.contentCategory = document.getElementById('contentCategory');
    elements.contentPriority = document.getElementById('contentPriority');
    elements.contentEnabled = document.getElementById('contentEnabled');
    elements.displayOnAll = document.getElementById('displayOnAll');
    elements.tagSelectGrid = document.getElementById('tagSelectGrid');
    elements.noTagsMessage = document.getElementById('noTagsMessage');
    // Delete Modal
    elements.deleteModal = document.getElementById('deleteModal');
    elements.closeDeleteModal = document.getElementById('closeDeleteModal');
    elements.cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    elements.confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    elements.deleteContentTitle = document.getElementById('deleteContentTitle');
  }

  /**
   * Show viewer-only message
   */
  function showViewerMessage() {
    elements.loadingState.style.display = 'none';
    elements.emptyState.innerHTML = `
      <span class="icon icon-lock" style="font-size: 48px; color: var(--text-muted); margin-bottom: 16px; display: block;"></span>
      <h3 style="font-size: 18px; font-weight: 500; color: var(--text-primary); margin-bottom: 8px;">View Only</h3>
      <p style="color: var(--text-secondary);">You don't have permission to manage content.</p>
    `;
    elements.emptyState.style.display = 'block';
    elements.addContentBtn.style.display = 'none';
  }

  /**
   * Set up event listeners
   */
  function setupEventListeners() {
    // Add content buttons
    elements.addContentBtn.addEventListener('click', () => openContentModal());
    elements.createFirstBtn.addEventListener('click', () => openContentModal());

    // Modal close
    elements.closeContentModal.addEventListener('click', closeContentModal);
    elements.cancelContentBtn.addEventListener('click', closeContentModal);
    elements.contentModal.addEventListener('click', (e) => {
      if (e.target === elements.contentModal) closeContentModal();
    });

    // Save content
    elements.saveContentBtn.addEventListener('click', saveContent);

    // Delete modal
    elements.closeDeleteModal.addEventListener('click', closeDeleteModal);
    elements.cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    elements.deleteModal.addEventListener('click', (e) => {
      if (e.target === elements.deleteModal) closeDeleteModal();
    });
    elements.confirmDeleteBtn.addEventListener('click', confirmDelete);

    // Filters
    elements.searchInput.addEventListener('input', renderContent);
    elements.typeFilter.addEventListener('change', renderContent);
    elements.tagFilter.addEventListener('change', renderContent);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (elements.contentModal.classList.contains('open')) closeContentModal();
        if (elements.deleteModal.classList.contains('open')) closeDeleteModal();
      }
    });
  }

  /**
   * Load data from database
   */
  async function loadData() {
    try {
      elements.loadingState.style.display = 'flex';
      elements.emptyState.style.display = 'none';
      elements.contentGrid.style.display = 'none';

      // Load tags and content in parallel
      const [tagsResult, contentResult] = await Promise.all([
        RevGuideDB.getContentTags(),
        RevGuideDB.getRecommendedContent()
      ]);

      if (tagsResult.error) {
        console.error('Error loading tags:', tagsResult.error);
      }
      if (contentResult.error) {
        console.error('Error loading content:', contentResult.error);
        AdminShared.showToast('Failed to load content', 'error');
        return;
      }

      tags = tagsResult.data || [];
      contentItems = contentResult.data || [];

      // Populate tag filter dropdown
      populateTagFilter();

      // Render content
      renderContent();
    } catch (err) {
      console.error('Error loading data:', err);
      AdminShared.showToast('Failed to load data', 'error');
    }
  }

  /**
   * Populate tag filter dropdown
   */
  function populateTagFilter() {
    const options = ['<option value="all">All Tags</option>'];
    tags.forEach(tag => {
      options.push(`<option value="${tag.id}">${escapeHtml(tag.name)}</option>`);
    });
    elements.tagFilter.innerHTML = options.join('');
  }

  /**
   * Render content grid
   */
  function renderContent() {
    elements.loadingState.style.display = 'none';

    // Apply filters
    const searchTerm = elements.searchInput.value.toLowerCase();
    const typeFilter = elements.typeFilter.value;
    const tagFilter = elements.tagFilter.value;

    let filtered = contentItems.filter(item => {
      // Search filter
      if (searchTerm) {
        const matchesSearch =
          (item.title || '').toLowerCase().includes(searchTerm) ||
          (item.description || '').toLowerCase().includes(searchTerm) ||
          (item.url || '').toLowerCase().includes(searchTerm);
        if (!matchesSearch) return false;
      }

      // Type filter
      if (typeFilter !== 'all' && item.content_type !== typeFilter) {
        return false;
      }

      // Tag filter
      if (tagFilter !== 'all') {
        const itemTags = item.tag_ids || [];
        if (!itemTags.includes(tagFilter)) return false;
      }

      return true;
    });

    if (filtered.length === 0 && contentItems.length === 0) {
      elements.emptyState.style.display = 'block';
      elements.contentGrid.style.display = 'none';
      return;
    }

    elements.emptyState.style.display = 'none';
    elements.contentGrid.style.display = 'grid';

    // Sort by priority
    filtered.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // Build tag lookup
    const tagMap = {};
    tags.forEach(t => tagMap[t.id] = t);

    elements.contentGrid.innerHTML = filtered.map(item => {
      const itemTags = (item.tag_ids || [])
        .map(id => tagMap[id])
        .filter(Boolean);

      const typeLabel = {
        external_link: 'Link',
        hubspot_document: 'Document',
        hubspot_sequence: 'Sequence'
      }[item.content_type] || item.content_type;

      return `
        <div class="content-card">
          <div style="display: flex; align-items: start; justify-content: space-between; margin-bottom: 12px;">
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span class="content-type-badge ${item.content_type}">${typeLabel}</span>
                ${!item.enabled ? '<span style="color: var(--text-muted); font-size: 12px;">(Disabled)</span>' : ''}
                ${item.display_on_all ? '<span style="color: var(--success); font-size: 12px;">Always shown</span>' : ''}
              </div>
              <h3 style="font-size: 16px; font-weight: 500; color: var(--text-primary); margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${escapeHtml(item.title)}
              </h3>
            </div>
            <div style="display: flex; gap: 4px; margin-left: 8px;">
              <button class="btn-icon btn-sm" title="Edit" onclick="RecommendationsPage.editContent('${item.id}')">
                <span class="icon icon-edit icon--sm"></span>
              </button>
              <button class="btn-icon btn-sm" title="Delete" onclick="RecommendationsPage.deleteContent('${item.id}')" style="color: var(--danger);">
                <span class="icon icon-trash icon--sm"></span>
              </button>
            </div>
          </div>
          ${item.description ? `<p style="font-size: 13px; color: var(--text-secondary); margin: 0 0 8px 0; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${escapeHtml(item.description)}</p>` : ''}
          ${item.url ? `<p style="font-size: 12px; color: var(--text-muted); margin: 0 0 8px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.url)}</a></p>` : ''}
          ${itemTags.length > 0 ? `
            <div style="display: flex; flex-wrap: wrap; gap: 4px;">
              ${itemTags.map(tag => `<span class="tag-badge" style="background: ${tag.color};">${escapeHtml(tag.name)}</span>`).join('')}
            </div>
          ` : ''}
          ${item.category ? `<p style="font-size: 11px; color: var(--text-muted); margin: 8px 0 0 0;">Category: ${escapeHtml(item.category)}</p>` : ''}
        </div>
      `;
    }).join('');
  }

  /**
   * Open content modal for add/edit
   */
  function openContentModal(contentId = null) {
    editingContent = contentId ? contentItems.find(c => c.id === contentId) : null;
    selectedTagIds = new Set(editingContent?.tag_ids || []);

    elements.contentModalTitle.textContent = editingContent ? 'Edit Content' : 'Add Content';

    // Reset form
    document.querySelector('input[name="contentType"][value="external_link"]').checked = true;
    elements.contentTitle.value = editingContent?.title || '';
    elements.contentUrl.value = editingContent?.url || '';
    elements.contentDescription.value = editingContent?.description || '';
    elements.contentCategory.value = editingContent?.category || '';
    elements.contentPriority.value = editingContent?.priority || 0;
    elements.contentEnabled.checked = editingContent?.enabled !== false;
    elements.displayOnAll.checked = editingContent?.display_on_all || false;

    // Render tag selection
    renderTagSelection();

    elements.contentModal.classList.add('open');
    elements.contentTitle.focus();
  }

  /**
   * Render tag selection grid
   */
  function renderTagSelection() {
    if (tags.length === 0) {
      elements.tagSelectGrid.style.display = 'none';
      elements.noTagsMessage.style.display = 'block';
      return;
    }

    elements.tagSelectGrid.style.display = 'flex';
    elements.noTagsMessage.style.display = 'none';

    elements.tagSelectGrid.innerHTML = tags.map(tag => {
      const isSelected = selectedTagIds.has(tag.id);
      return `
        <button type="button"
          class="tag-select-item ${isSelected ? 'selected' : ''}"
          style="background: ${tag.color}; color: white;"
          data-tag-id="${tag.id}"
          onclick="RecommendationsPage.toggleTag('${tag.id}')">
          <span class="tag-check">&#10003;</span>
          ${escapeHtml(tag.name)}
        </button>
      `;
    }).join('');
  }

  /**
   * Toggle tag selection
   */
  function toggleTag(tagId) {
    if (selectedTagIds.has(tagId)) {
      selectedTagIds.delete(tagId);
    } else {
      selectedTagIds.add(tagId);
    }
    renderTagSelection();
  }

  /**
   * Close content modal
   */
  function closeContentModal() {
    elements.contentModal.classList.remove('open');
    editingContent = null;
    selectedTagIds.clear();
  }

  /**
   * Save content (create or update)
   */
  async function saveContent() {
    const contentType = document.querySelector('input[name="contentType"]:checked').value;
    const title = elements.contentTitle.value.trim();
    const url = elements.contentUrl.value.trim();
    const description = elements.contentDescription.value.trim();
    const category = elements.contentCategory.value.trim();
    const priority = parseInt(elements.contentPriority.value) || 0;
    const enabled = elements.contentEnabled.checked;
    const displayOnAll = elements.displayOnAll.checked;

    // Validation
    if (!title) {
      AdminShared.showToast('Title is required', 'error');
      elements.contentTitle.focus();
      return;
    }

    if (contentType === 'external_link' && !url) {
      AdminShared.showToast('URL is required for external links', 'error');
      elements.contentUrl.focus();
      return;
    }

    elements.saveContentBtn.disabled = true;
    elements.saveContentBtn.innerHTML = '<span class="loading-spinner loading-spinner--sm"></span> Saving...';

    try {
      const contentData = {
        content_type: contentType,
        title,
        url: contentType === 'external_link' ? url : null,
        description: description || null,
        category: category || null,
        priority,
        enabled,
        display_on_all: displayOnAll,
        tag_ids: Array.from(selectedTagIds)
      };

      let result;
      if (editingContent) {
        result = await RevGuideDB.updateRecommendedContent(editingContent.id, contentData);
      } else {
        result = await RevGuideDB.createRecommendedContent(contentData);
      }

      if (result.error) {
        throw result.error;
      }

      AdminShared.showToast(
        editingContent ? 'Content updated' : 'Content created',
        'success'
      );

      closeContentModal();
      await loadData();
    } catch (err) {
      console.error('Error saving content:', err);
      AdminShared.showToast(err.message || 'Failed to save content', 'error');
    } finally {
      elements.saveContentBtn.disabled = false;
      elements.saveContentBtn.innerHTML = 'Save Content';
    }
  }

  /**
   * Open delete confirmation
   */
  function deleteContent(contentId) {
    const content = contentItems.find(c => c.id === contentId);
    if (!content) return;

    deleteContentId = contentId;
    elements.deleteContentTitle.textContent = content.title;
    elements.deleteModal.classList.add('open');
  }

  /**
   * Close delete modal
   */
  function closeDeleteModal() {
    elements.deleteModal.classList.remove('open');
    deleteContentId = null;
  }

  /**
   * Confirm delete
   */
  async function confirmDelete() {
    if (!deleteContentId) return;

    elements.confirmDeleteBtn.disabled = true;
    elements.confirmDeleteBtn.innerHTML = '<span class="loading-spinner loading-spinner--sm"></span> Deleting...';

    try {
      const result = await RevGuideDB.deleteRecommendedContent(deleteContentId);

      if (result.error) {
        throw result.error;
      }

      AdminShared.showToast('Content deleted', 'success');
      closeDeleteModal();
      await loadData();
    } catch (err) {
      console.error('Error deleting content:', err);
      AdminShared.showToast(err.message || 'Failed to delete content', 'error');
    } finally {
      elements.confirmDeleteBtn.disabled = false;
      elements.confirmDeleteBtn.innerHTML = 'Delete';
    }
  }

  /**
   * Escape HTML
   */
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Export for inline onclick handlers
  window.RecommendationsPage = {
    editContent: openContentModal,
    deleteContent: deleteContent,
    toggleTag: toggleTag
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
