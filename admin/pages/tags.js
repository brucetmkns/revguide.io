/**
 * Content Tags Admin Page
 * Manages content tags for the recommendation system
 */

(function() {
  'use strict';

  // State
  let tags = [];
  let editingTag = null;

  // DOM Elements
  const elements = {
    loadingState: document.getElementById('loadingState'),
    emptyState: document.getElementById('emptyState'),
    tagsGrid: document.getElementById('tagsGrid'),
    addTagBtn: document.getElementById('addTagBtn'),
    createFirstTagBtn: document.getElementById('createFirstTagBtn'),
    // Modal
    tagModal: document.getElementById('tagModal'),
    tagModalTitle: document.getElementById('tagModalTitle'),
    closeTagModal: document.getElementById('closeTagModal'),
    cancelTagBtn: document.getElementById('cancelTagBtn'),
    saveTagBtn: document.getElementById('saveTagBtn'),
    tagName: document.getElementById('tagName'),
    tagSlug: document.getElementById('tagSlug'),
    tagColor: document.getElementById('tagColor'),
    tagDescription: document.getElementById('tagDescription'),
    colorPicker: document.getElementById('colorPicker'),
    // Delete Modal
    deleteModal: document.getElementById('deleteModal'),
    closeDeleteModal: document.getElementById('closeDeleteModal'),
    cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
    confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
    deleteTagName: document.getElementById('deleteTagName')
  };

  let deleteTagId = null;

  /**
   * Initialize the page
   */
  async function init() {
    // Check authentication (redirects to login if not authenticated)
    const isAuthenticated = await AdminShared.checkAuth();
    if (!isAuthenticated) return;

    // Render sidebar
    AdminShared.renderSidebar('tags');

    // Check if user can edit content
    if (!AdminShared.canEditContent()) {
      showViewerMessage();
      return;
    }

    // Set up event listeners
    setupEventListeners();

    // Load tags
    await loadTags();
  }

  /**
   * Show viewer-only message
   */
  function showViewerMessage() {
    elements.loadingState.classList.add('hidden');
    elements.emptyState.innerHTML = `
      <span class="icon icon-lock icon--3xl text-text-muted mb-4"></span>
      <h3 class="text-lg font-medium text-text-primary mb-2">View Only</h3>
      <p class="text-text-secondary">You don't have permission to manage tags.</p>
    `;
    elements.emptyState.classList.remove('hidden');
    elements.addTagBtn.style.display = 'none';
  }

  /**
   * Set up event listeners
   */
  function setupEventListeners() {
    // Add tag buttons
    elements.addTagBtn.addEventListener('click', () => openTagModal());
    elements.createFirstTagBtn.addEventListener('click', () => openTagModal());

    // Modal close
    elements.closeTagModal.addEventListener('click', closeTagModal);
    elements.cancelTagBtn.addEventListener('click', closeTagModal);
    elements.tagModal.addEventListener('click', (e) => {
      if (e.target === elements.tagModal) closeTagModal();
    });

    // Save tag
    elements.saveTagBtn.addEventListener('click', saveTag);

    // Name change - auto-generate slug
    elements.tagName.addEventListener('input', () => {
      const name = elements.tagName.value;
      elements.tagSlug.value = generateSlug(name);
    });

    // Color picker
    elements.colorPicker.addEventListener('click', (e) => {
      const colorBtn = e.target.closest('.color-option');
      if (colorBtn) {
        // Remove selection from all
        elements.colorPicker.querySelectorAll('.color-option').forEach(btn => {
          btn.classList.remove('ring-2', 'ring-offset-2', 'ring-primary');
        });
        // Select clicked
        colorBtn.classList.add('ring-2', 'ring-offset-2', 'ring-primary');
        elements.tagColor.value = colorBtn.dataset.color;
      }
    });

    // Delete modal
    elements.closeDeleteModal.addEventListener('click', closeDeleteModal);
    elements.cancelDeleteBtn.addEventListener('click', closeDeleteModal);
    elements.deleteModal.addEventListener('click', (e) => {
      if (e.target === elements.deleteModal) closeDeleteModal();
    });
    elements.confirmDeleteBtn.addEventListener('click', confirmDelete);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (elements.tagModal.classList.contains('active')) closeTagModal();
        if (elements.deleteModal.classList.contains('active')) closeDeleteModal();
      }
    });
  }

  /**
   * Generate URL-safe slug from name
   */
  function generateSlug(name) {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  /**
   * Load tags from database
   */
  async function loadTags() {
    try {
      elements.loadingState.classList.remove('hidden');
      elements.emptyState.classList.add('hidden');
      elements.tagsGrid.classList.add('hidden');

      const { data, error } = await RevGuideDB.getContentTags();

      if (error) {
        console.error('Error loading tags:', error);
        AdminShared.showNotification('Failed to load tags', 'error');
        return;
      }

      tags = data || [];
      renderTags();
    } catch (err) {
      console.error('Error loading tags:', err);
      AdminShared.showNotification('Failed to load tags', 'error');
    }
  }

  /**
   * Render tags grid
   */
  function renderTags() {
    elements.loadingState.classList.add('hidden');

    if (tags.length === 0) {
      elements.emptyState.classList.remove('hidden');
      elements.tagsGrid.classList.add('hidden');
      return;
    }

    elements.emptyState.classList.add('hidden');
    elements.tagsGrid.classList.remove('hidden');

    elements.tagsGrid.innerHTML = tags.map(tag => `
      <div class="bg-surface border border-border rounded-lg p-4 hover:border-border-strong transition-colors">
        <div class="flex items-start justify-between mb-3">
          <div class="flex items-center gap-2">
            <span class="w-4 h-4 rounded-full flex-shrink-0" style="background: ${escapeHtml(tag.color || '#6366f1')};"></span>
            <h3 class="font-medium text-text-primary">${escapeHtml(tag.name)}</h3>
          </div>
          <div class="flex gap-1">
            <button class="btn-icon btn-sm" title="Edit" onclick="TagsPage.editTag('${tag.id}')">
              <span class="icon icon-edit icon--sm"></span>
            </button>
            <button class="btn-icon btn-sm text-danger" title="Delete" onclick="TagsPage.deleteTag('${tag.id}')">
              <span class="icon icon-trash icon--sm"></span>
            </button>
          </div>
        </div>
        <div class="text-xs text-text-muted mb-2">
          <code class="bg-bg-muted px-1 py-0.5 rounded">${escapeHtml(tag.slug)}</code>
        </div>
        ${tag.description ? `<p class="text-sm text-text-secondary line-clamp-2">${escapeHtml(tag.description)}</p>` : ''}
      </div>
    `).join('');
  }

  /**
   * Open tag modal for add/edit
   */
  function openTagModal(tagId = null) {
    editingTag = tagId ? tags.find(t => t.id === tagId) : null;

    elements.tagModalTitle.textContent = editingTag ? 'Edit Tag' : 'Add Tag';

    // Reset form
    elements.tagName.value = editingTag?.name || '';
    elements.tagSlug.value = editingTag?.slug || '';
    elements.tagColor.value = editingTag?.color || '#6366f1';
    elements.tagDescription.value = editingTag?.description || '';

    // Update color picker selection
    const color = editingTag?.color || '#6366f1';
    elements.colorPicker.querySelectorAll('.color-option').forEach(btn => {
      if (btn.dataset.color === color) {
        btn.classList.add('ring-2', 'ring-offset-2', 'ring-primary');
      } else {
        btn.classList.remove('ring-2', 'ring-offset-2', 'ring-primary');
      }
    });

    elements.tagModal.classList.add('active');
    elements.tagName.focus();
  }

  /**
   * Close tag modal
   */
  function closeTagModal() {
    elements.tagModal.classList.remove('active');
    editingTag = null;
  }

  /**
   * Save tag (create or update)
   */
  async function saveTag() {
    const name = elements.tagName.value.trim();
    const slug = elements.tagSlug.value.trim() || generateSlug(name);
    const color = elements.tagColor.value;
    const description = elements.tagDescription.value.trim();

    if (!name) {
      AdminShared.showNotification('Name is required', 'error');
      elements.tagName.focus();
      return;
    }

    if (!slug) {
      AdminShared.showNotification('Invalid name - cannot generate slug', 'error');
      return;
    }

    // Check for duplicate slug (excluding current tag if editing)
    const duplicate = tags.find(t =>
      t.slug === slug && (!editingTag || t.id !== editingTag.id)
    );
    if (duplicate) {
      AdminShared.showNotification('A tag with this slug already exists', 'error');
      return;
    }

    elements.saveTagBtn.disabled = true;
    elements.saveTagBtn.innerHTML = '<span class="loading-spinner loading-spinner--sm"></span> Saving...';

    try {
      const tagData = { name, slug, color, description };

      let result;
      if (editingTag) {
        result = await RevGuideDB.updateContentTag(editingTag.id, tagData);
      } else {
        result = await RevGuideDB.createContentTag(tagData);
      }

      if (result.error) {
        throw result.error;
      }

      AdminShared.showNotification(
        editingTag ? 'Tag updated' : 'Tag created',
        'success'
      );

      closeTagModal();
      await loadTags();
    } catch (err) {
      console.error('Error saving tag:', err);
      AdminShared.showNotification(err.message || 'Failed to save tag', 'error');
    } finally {
      elements.saveTagBtn.disabled = false;
      elements.saveTagBtn.innerHTML = 'Save Tag';
    }
  }

  /**
   * Open delete confirmation
   */
  function deleteTag(tagId) {
    const tag = tags.find(t => t.id === tagId);
    if (!tag) return;

    deleteTagId = tagId;
    elements.deleteTagName.textContent = tag.name;
    elements.deleteModal.classList.add('active');
  }

  /**
   * Close delete modal
   */
  function closeDeleteModal() {
    elements.deleteModal.classList.remove('active');
    deleteTagId = null;
  }

  /**
   * Confirm delete
   */
  async function confirmDelete() {
    if (!deleteTagId) return;

    elements.confirmDeleteBtn.disabled = true;
    elements.confirmDeleteBtn.innerHTML = '<span class="loading-spinner loading-spinner--sm"></span> Deleting...';

    try {
      const result = await RevGuideDB.deleteContentTag(deleteTagId);

      if (result.error) {
        throw result.error;
      }

      AdminShared.showNotification('Tag deleted', 'success');
      closeDeleteModal();
      await loadTags();
    } catch (err) {
      console.error('Error deleting tag:', err);
      AdminShared.showNotification(err.message || 'Failed to delete tag', 'error');
    } finally {
      elements.confirmDeleteBtn.disabled = false;
      elements.confirmDeleteBtn.innerHTML = 'Delete';
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Export for inline onclick handlers
  window.TagsPage = {
    editTag: openTagModal,
    deleteTag: deleteTag
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
