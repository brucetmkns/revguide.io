/**
 * Content Library Admin Page
 * Manages recommended content and tags in one place
 */

(function() {
  'use strict';

  // State
  let contentItems = [];
  let tags = [];
  let editingContent = null;
  let selectedTagIds = new Set();
  let deleteTarget = null; // { type: 'content'|'tag', id, name }
  let selectedTagColor = '#6366f1';

  // DOM Elements
  const elements = {};

  /**
   * Initialize the page
   */
  async function init() {
    const isAuthenticated = await AdminShared.checkAuth();
    if (!isAuthenticated) return;

    AdminShared.renderSidebar('content');
    cacheElements();

    if (!AdminShared.canEditContent()) {
      showViewerMessage();
      return;
    }

    setupEventListeners();
    await loadData();
  }

  /**
   * Cache DOM elements
   */
  function cacheElements() {
    // Tabs
    elements.tabs = document.querySelectorAll('.content-tab');
    elements.tabContents = document.querySelectorAll('.tab-content');
    elements.addAssetBtn = document.getElementById('addAssetBtn');

    // Assets tab
    elements.assetsLoading = document.getElementById('assetsLoading');
    elements.assetsEmpty = document.getElementById('assetsEmpty');
    elements.contentGrid = document.getElementById('contentGrid');
    elements.searchInput = document.getElementById('searchInput');
    elements.tagFilter = document.getElementById('tagFilter');
    elements.createFirstBtn = document.getElementById('createFirstBtn');

    // Tags tab
    elements.tagsLoading = document.getElementById('tagsLoading');
    elements.tagsEmpty = document.getElementById('tagsEmpty');
    elements.tagsList = document.getElementById('tagsList');
    elements.newTagName = document.getElementById('newTagName');
    elements.addTagBtn = document.getElementById('addTagBtn');
    elements.colorPickerInline = document.getElementById('colorPickerInline');

    // Content Modal
    elements.contentModal = document.getElementById('contentModal');
    elements.contentModalTitle = document.getElementById('contentModalTitle');
    elements.closeContentModal = document.getElementById('closeContentModal');
    elements.cancelContentBtn = document.getElementById('cancelContentBtn');
    elements.saveContentBtn = document.getElementById('saveContentBtn');
    elements.contentTitle = document.getElementById('contentTitle');
    elements.contentUrl = document.getElementById('contentUrl');
    elements.contentDescription = document.getElementById('contentDescription');
    elements.contentEnabled = document.getElementById('contentEnabled');
    elements.displayOnAll = document.getElementById('displayOnAll');
    elements.tagSelectGrid = document.getElementById('tagSelectGrid');
    elements.noTagsMessage = document.getElementById('noTagsMessage');

    // Delete Modal
    elements.deleteModal = document.getElementById('deleteModal');
    elements.deleteModalTitle = document.getElementById('deleteModalTitle');
    elements.closeDeleteModal = document.getElementById('closeDeleteModal');
    elements.cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    elements.confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    elements.deleteItemName = document.getElementById('deleteItemName');
  }

  /**
   * Show viewer message
   */
  function showViewerMessage() {
    elements.assetsLoading.style.display = 'none';
    elements.assetsEmpty.innerHTML = `
      <span class="icon icon-lock" style="font-size: 48px; color: var(--text-muted); margin-bottom: 16px; display: block;"></span>
      <h3 style="font-size: 18px; font-weight: 500; color: var(--text-primary); margin-bottom: 8px;">View Only</h3>
      <p style="color: var(--text-secondary);">You don't have permission to manage content.</p>
    `;
    elements.assetsEmpty.style.display = 'block';
    elements.addAssetBtn.style.display = 'none';
  }

  /**
   * Set up event listeners
   */
  function setupEventListeners() {
    // Tab switching
    elements.tabs.forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Add content buttons
    elements.addAssetBtn.addEventListener('click', () => openContentModal());
    elements.createFirstBtn.addEventListener('click', () => openContentModal());

    // Content modal
    elements.closeContentModal.addEventListener('click', closeContentModal);
    elements.cancelContentBtn.addEventListener('click', closeContentModal);
    elements.contentModal.addEventListener('click', (e) => {
      if (e.target === elements.contentModal) closeContentModal();
    });
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
    elements.tagFilter.addEventListener('change', renderContent);

    // Add tag
    elements.addTagBtn.addEventListener('click', addTag);
    elements.newTagName.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') addTag();
    });

    // Color picker
    elements.colorPickerInline.addEventListener('click', (e) => {
      const dot = e.target.closest('.color-dot');
      if (dot) {
        elements.colorPickerInline.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
        dot.classList.add('selected');
        selectedTagColor = dot.dataset.color;
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (elements.contentModal.classList.contains('open')) closeContentModal();
        if (elements.deleteModal.classList.contains('open')) closeDeleteModal();
      }
    });
  }

  /**
   * Switch tabs
   */
  function switchTab(tabName) {
    elements.tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    elements.tabContents.forEach(c => c.classList.toggle('active', c.id === `${tabName}Tab`));
    elements.addAssetBtn.style.display = tabName === 'assets' ? 'flex' : 'none';
  }

  /**
   * Load data
   */
  async function loadData() {
    try {
      elements.assetsLoading.style.display = 'flex';
      elements.tagsLoading.style.display = 'block';

      const [tagsResult, contentResult] = await Promise.all([
        RevGuideDB.getContentTags(),
        RevGuideDB.getRecommendedContent()
      ]);

      if (tagsResult.error) console.error('Error loading tags:', tagsResult.error);
      if (contentResult.error) {
        console.error('Error loading content:', contentResult.error);
        AdminShared.showToast('Failed to load content', 'error');
        return;
      }

      tags = tagsResult.data || [];
      contentItems = contentResult.data || [];

      populateTagFilter();
      renderContent();
      renderTags();
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
    elements.assetsLoading.style.display = 'none';

    const searchTerm = elements.searchInput.value.toLowerCase();
    const tagFilter = elements.tagFilter.value;

    let filtered = contentItems.filter(item => {
      if (searchTerm) {
        const matchesSearch =
          (item.title || '').toLowerCase().includes(searchTerm) ||
          (item.description || '').toLowerCase().includes(searchTerm) ||
          (item.url || '').toLowerCase().includes(searchTerm);
        if (!matchesSearch) return false;
      }
      if (tagFilter !== 'all') {
        const itemTags = item.tag_ids || [];
        if (!itemTags.includes(tagFilter)) return false;
      }
      return true;
    });

    if (filtered.length === 0 && contentItems.length === 0) {
      elements.assetsEmpty.style.display = 'block';
      elements.contentGrid.style.display = 'none';
      return;
    }

    elements.assetsEmpty.style.display = 'none';
    elements.contentGrid.style.display = 'grid';

    filtered.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    const tagMap = {};
    tags.forEach(t => tagMap[t.id] = t);

    elements.contentGrid.innerHTML = filtered.map(item => {
      const itemTags = (item.tag_ids || []).map(id => tagMap[id]).filter(Boolean);
      return `
        <div class="content-card">
          <div style="display: flex; align-items: start; justify-content: space-between; margin-bottom: 12px;">
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span class="content-type-badge external_link">Link</span>
                ${!item.enabled ? '<span style="color: var(--text-muted); font-size: 12px;">(Disabled)</span>' : ''}
                ${item.display_on_all ? '<span style="color: var(--success); font-size: 12px;">Always shown</span>' : ''}
              </div>
              <h3 style="font-size: 16px; font-weight: 500; color: var(--text-primary); margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${escapeHtml(item.title)}
              </h3>
            </div>
            <div style="display: flex; gap: 4px; margin-left: 8px;">
              <button class="btn-icon btn-sm" title="Edit" onclick="ContentPage.editContent('${item.id}')">
                <span class="icon icon-edit icon--sm"></span>
              </button>
              <button class="btn-icon btn-sm" title="Delete" onclick="ContentPage.deleteContent('${item.id}')" style="color: var(--danger);">
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
        </div>
      `;
    }).join('');
  }

  /**
   * Render tags list
   */
  function renderTags() {
    elements.tagsLoading.style.display = 'none';

    if (tags.length === 0) {
      elements.tagsEmpty.style.display = 'block';
      elements.tagsList.style.display = 'none';
      return;
    }

    elements.tagsEmpty.style.display = 'none';
    elements.tagsList.style.display = 'flex';

    elements.tagsList.innerHTML = tags.map(tag => `
      <div class="tag-row">
        <div class="tag-color-dot" style="background: ${escapeHtml(tag.color || '#6366f1')};"></div>
        <div class="tag-info">
          <div class="tag-name">${escapeHtml(tag.name)}</div>
          <div class="tag-slug">${escapeHtml(tag.slug)}</div>
        </div>
        <div class="tag-actions">
          <button class="btn-icon btn-sm" title="Delete" onclick="ContentPage.deleteTag('${tag.id}')" style="color: var(--danger);">
            <span class="icon icon-trash icon--sm"></span>
          </button>
        </div>
      </div>
    `).join('');
  }

  /**
   * Add new tag
   */
  async function addTag() {
    const name = elements.newTagName.value.trim();
    if (!name) {
      AdminShared.showToast('Enter a tag name', 'error');
      elements.newTagName.focus();
      return;
    }

    const slug = name.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');
    if (!slug) {
      AdminShared.showToast('Invalid tag name', 'error');
      return;
    }

    // Check for duplicate
    if (tags.find(t => t.slug === slug)) {
      AdminShared.showToast('A tag with this name already exists', 'error');
      return;
    }

    elements.addTagBtn.disabled = true;
    elements.addTagBtn.textContent = 'Adding...';

    try {
      const result = await RevGuideDB.createContentTag({
        name,
        slug,
        color: selectedTagColor,
        description: ''
      });

      if (result.error) throw result.error;

      AdminShared.showToast('Tag created', 'success');
      elements.newTagName.value = '';
      await loadData();
    } catch (err) {
      console.error('Error creating tag:', err);
      AdminShared.showToast(err.message || 'Failed to create tag', 'error');
    } finally {
      elements.addTagBtn.disabled = false;
      elements.addTagBtn.textContent = 'Add Tag';
    }
  }

  /**
   * Open content modal
   */
  function openContentModal(contentId = null) {
    editingContent = contentId ? contentItems.find(c => c.id === contentId) : null;
    selectedTagIds = new Set(editingContent?.tag_ids || []);

    elements.contentModalTitle.textContent = editingContent ? 'Edit Content' : 'Add Content';
    elements.contentTitle.value = editingContent?.title || '';
    elements.contentUrl.value = editingContent?.url || '';
    elements.contentDescription.value = editingContent?.description || '';
    elements.contentEnabled.checked = editingContent?.enabled !== false;
    elements.displayOnAll.checked = editingContent?.display_on_all || false;

    renderTagSelection();
    elements.contentModal.classList.add('open');
    elements.contentTitle.focus();
  }

  /**
   * Render tag selection
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
          onclick="ContentPage.toggleTag('${tag.id}')">
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
   * Save content
   */
  async function saveContent() {
    const title = elements.contentTitle.value.trim();
    const url = elements.contentUrl.value.trim();
    const description = elements.contentDescription.value.trim();
    const enabled = elements.contentEnabled.checked;
    const displayOnAll = elements.displayOnAll.checked;

    if (!title) {
      AdminShared.showToast('Title is required', 'error');
      elements.contentTitle.focus();
      return;
    }
    if (!url) {
      AdminShared.showToast('URL is required', 'error');
      elements.contentUrl.focus();
      return;
    }

    elements.saveContentBtn.disabled = true;
    elements.saveContentBtn.innerHTML = '<span class="loading-spinner loading-spinner--sm"></span> Saving...';

    try {
      const contentData = {
        content_type: 'external_link',
        title,
        url,
        description: description || null,
        priority: 0,
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

      if (result.error) throw result.error;

      AdminShared.showToast(editingContent ? 'Content updated' : 'Content created', 'success');
      closeContentModal();
      await loadData();
    } catch (err) {
      console.error('Error saving content:', err);
      AdminShared.showToast(err.message || 'Failed to save content', 'error');
    } finally {
      elements.saveContentBtn.disabled = false;
      elements.saveContentBtn.innerHTML = 'Save';
    }
  }

  /**
   * Delete content
   */
  function deleteContent(contentId) {
    const content = contentItems.find(c => c.id === contentId);
    if (!content) return;
    deleteTarget = { type: 'content', id: contentId, name: content.title };
    elements.deleteModalTitle.textContent = 'Delete Content';
    elements.deleteItemName.textContent = content.title;
    elements.deleteModal.classList.add('open');
  }

  /**
   * Delete tag
   */
  function deleteTag(tagId) {
    const tag = tags.find(t => t.id === tagId);
    if (!tag) return;
    deleteTarget = { type: 'tag', id: tagId, name: tag.name };
    elements.deleteModalTitle.textContent = 'Delete Tag';
    elements.deleteItemName.textContent = tag.name;
    elements.deleteModal.classList.add('open');
  }

  /**
   * Close delete modal
   */
  function closeDeleteModal() {
    elements.deleteModal.classList.remove('open');
    deleteTarget = null;
  }

  /**
   * Confirm delete
   */
  async function confirmDelete() {
    if (!deleteTarget) return;

    elements.confirmDeleteBtn.disabled = true;
    elements.confirmDeleteBtn.innerHTML = '<span class="loading-spinner loading-spinner--sm"></span> Deleting...';

    try {
      let result;
      if (deleteTarget.type === 'content') {
        result = await RevGuideDB.deleteRecommendedContent(deleteTarget.id);
      } else {
        result = await RevGuideDB.deleteContentTag(deleteTarget.id);
      }

      if (result.error) throw result.error;

      AdminShared.showToast(`${deleteTarget.type === 'content' ? 'Content' : 'Tag'} deleted`, 'success');
      closeDeleteModal();
      await loadData();
    } catch (err) {
      console.error('Error deleting:', err);
      AdminShared.showToast(err.message || 'Failed to delete', 'error');
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

  // Export for inline handlers
  window.ContentPage = {
    editContent: openContentModal,
    deleteContent,
    deleteTag,
    toggleTag
  };

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
