/**
 * Tiptap Rich Text Editor Wrapper
 * Provides a Notion-like editing experience with headings, tables, lists, etc.
 *
 * Usage:
 *   const editor = await TiptapEditor.create('#my-editor', {
 *     content: '<p>Initial content</p>',
 *     placeholder: 'Start typing...',
 *     onChange: (html) => console.log(html)
 *   });
 *
 *   // Get content
 *   editor.getHTML();
 *
 *   // Set content
 *   editor.setContent('<p>New content</p>');
 *
 *   // Destroy
 *   editor.destroy();
 */

// Tiptap CDN loader
const TiptapLoader = {
  loaded: false,
  loading: null,

  async load() {
    if (this.loaded) return;
    if (this.loading) return this.loading;

    this.loading = new Promise(async (resolve, reject) => {
      try {
        // Load Tiptap via ES module imports from CDN
        const cdn = 'https://esm.sh';

        // Import all needed modules
        const [
          { Editor },
          { StarterKit },
          { Link },
          { Underline },
          { Placeholder },
          { Table },
          { TableRow },
          { TableCell },
          { TableHeader },
          { Image },
          { TextAlign },
          { Heading }
        ] = await Promise.all([
          import(`${cdn}/@tiptap/core@2.11.2`),
          import(`${cdn}/@tiptap/starter-kit@2.11.2`),
          import(`${cdn}/@tiptap/extension-link@2.11.2`),
          import(`${cdn}/@tiptap/extension-underline@2.11.2`),
          import(`${cdn}/@tiptap/extension-placeholder@2.11.2`),
          import(`${cdn}/@tiptap/extension-table@2.11.2`),
          import(`${cdn}/@tiptap/extension-table-row@2.11.2`),
          import(`${cdn}/@tiptap/extension-table-cell@2.11.2`),
          import(`${cdn}/@tiptap/extension-table-header@2.11.2`),
          import(`${cdn}/@tiptap/extension-image@2.11.2`),
          import(`${cdn}/@tiptap/extension-text-align@2.11.2`),
          import(`${cdn}/@tiptap/extension-heading@2.11.2`)
        ]);

        // Store on window for reuse
        window.TiptapModules = {
          Editor,
          StarterKit,
          Link,
          Underline,
          Placeholder,
          Table,
          TableRow,
          TableCell,
          TableHeader,
          Image,
          TextAlign,
          Heading
        };

        this.loaded = true;
        resolve();
      } catch (error) {
        console.error('Failed to load Tiptap:', error);
        reject(error);
      }
    });

    return this.loading;
  }
};

// Editor wrapper class
class TiptapEditorInstance {
  constructor(editor, container, toolbar) {
    this.editor = editor;
    this.container = container;
    this.toolbar = toolbar;
  }

  getHTML() {
    return this.editor.getHTML();
  }

  getText() {
    return this.editor.getText();
  }

  setContent(content) {
    this.editor.commands.setContent(content || '');
  }

  isEmpty() {
    return this.editor.isEmpty;
  }

  focus() {
    this.editor.commands.focus();
  }

  destroy() {
    this.editor.destroy();
    if (this.toolbar) {
      this.toolbar.remove();
    }
  }
}

// Main TiptapEditor factory
window.TiptapEditor = {
  instances: new Map(),

  /**
   * Create a new Tiptap editor
   * @param {string|Element} selector - CSS selector or DOM element
   * @param {Object} options - Editor options
   * @param {string} options.content - Initial HTML content
   * @param {string} options.placeholder - Placeholder text
   * @param {Function} options.onChange - Callback when content changes
   * @param {boolean} options.minimal - Use minimal toolbar (no tables/headings)
   * @returns {Promise<TiptapEditorInstance>}
   */
  async create(selector, options = {}) {
    await TiptapLoader.load();

    const container = typeof selector === 'string'
      ? document.querySelector(selector)
      : selector;

    if (!container) {
      throw new Error(`Element not found: ${selector}`);
    }

    // Destroy existing instance if present
    const existingId = container.dataset.tiptapId;
    if (existingId && this.instances.has(existingId)) {
      this.instances.get(existingId).destroy();
      this.instances.delete(existingId);
    }

    const { Editor, StarterKit, Link, Underline, Placeholder, Table, TableRow, TableCell, TableHeader, Image, TextAlign, Heading } = window.TiptapModules;

    // Create wrapper structure
    const wrapper = document.createElement('div');
    wrapper.className = 'tiptap-wrapper';

    // Create toolbar
    const toolbar = this.createToolbar(options.minimal);
    wrapper.appendChild(toolbar);

    // Create editor container
    const editorElement = document.createElement('div');
    editorElement.className = 'tiptap-editor';
    wrapper.appendChild(editorElement);

    // Replace or wrap container
    container.innerHTML = '';
    container.appendChild(wrapper);

    // Build extensions
    const extensions = [
      StarterKit.configure({
        heading: false // We'll add our own heading extension
      }),
      Heading.configure({
        levels: [1, 2, 3]
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer'
        }
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph']
      })
    ];

    // Add placeholder if provided
    if (options.placeholder) {
      extensions.push(
        Placeholder.configure({
          placeholder: options.placeholder
        })
      );
    }

    // Add table extensions if not minimal
    if (!options.minimal) {
      extensions.push(
        Table.configure({
          resizable: true
        }),
        TableRow,
        TableCell,
        TableHeader,
        Image.configure({
          inline: true,
          allowBase64: true
        })
      );
    }

    // Create editor
    const editor = new Editor({
      element: editorElement,
      extensions,
      content: options.content || '',
      onUpdate: ({ editor }) => {
        this.updateToolbarState(toolbar, editor);
        if (options.onChange) {
          options.onChange(editor.getHTML());
        }
      },
      onSelectionUpdate: ({ editor }) => {
        this.updateToolbarState(toolbar, editor);
      }
    });

    // Bind toolbar events
    this.bindToolbarEvents(toolbar, editor, options.minimal);

    // Initial toolbar state
    this.updateToolbarState(toolbar, editor);

    // Generate unique ID
    const id = 'tiptap-' + Math.random().toString(36).substr(2, 9);
    container.dataset.tiptapId = id;

    const instance = new TiptapEditorInstance(editor, container, toolbar);
    this.instances.set(id, instance);

    return instance;
  },

  createToolbar(minimal = false) {
    const toolbar = document.createElement('div');
    toolbar.className = 'tiptap-toolbar';

    // Build toolbar HTML based on mode
    let html = '';

    if (!minimal) {
      // Heading dropdown
      html += `
        <div class="tiptap-dropdown">
          <button type="button" class="tiptap-btn tiptap-dropdown-toggle" data-action="heading-dropdown" title="Text style">
            <span class="dropdown-label">Paragraph</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          <div class="tiptap-dropdown-menu">
            <button type="button" class="tiptap-dropdown-item" data-action="paragraph">Paragraph</button>
            <button type="button" class="tiptap-dropdown-item" data-action="heading" data-level="1">Heading 1</button>
            <button type="button" class="tiptap-dropdown-item" data-action="heading" data-level="2">Heading 2</button>
            <button type="button" class="tiptap-dropdown-item" data-action="heading" data-level="3">Heading 3</button>
          </div>
        </div>
        <span class="tiptap-divider"></span>
      `;
    }

    // Text formatting
    html += `
      <button type="button" class="tiptap-btn" data-action="bold" title="Bold (Cmd+B)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
          <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
        </svg>
      </button>
      <button type="button" class="tiptap-btn" data-action="italic" title="Italic (Cmd+I)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="19" y1="4" x2="10" y2="4"></line>
          <line x1="14" y1="20" x2="5" y2="20"></line>
          <line x1="15" y1="4" x2="9" y2="20"></line>
        </svg>
      </button>
      <button type="button" class="tiptap-btn" data-action="underline" title="Underline (Cmd+U)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 4v6a6 6 0 0 0 12 0V4"></path>
          <line x1="4" y1="20" x2="20" y2="20"></line>
        </svg>
      </button>
      <button type="button" class="tiptap-btn" data-action="strike" title="Strikethrough">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="4" y1="12" x2="20" y2="12"></line>
          <path d="M17.5 7.5c-1.5-1.5-4-2-6-1.5s-4 2.5-4 5c0 2 1.5 3.5 4 4"></path>
          <path d="M8 16.5c1.5 1.5 4 2 6 1.5s3.5-2 3.5-4"></path>
        </svg>
      </button>
      <span class="tiptap-divider"></span>
    `;

    // Lists
    html += `
      <button type="button" class="tiptap-btn" data-action="bulletList" title="Bullet list">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="9" y1="6" x2="20" y2="6"></line>
          <line x1="9" y1="12" x2="20" y2="12"></line>
          <line x1="9" y1="18" x2="20" y2="18"></line>
          <circle cx="4" cy="6" r="1.5" fill="currentColor"></circle>
          <circle cx="4" cy="12" r="1.5" fill="currentColor"></circle>
          <circle cx="4" cy="18" r="1.5" fill="currentColor"></circle>
        </svg>
      </button>
      <button type="button" class="tiptap-btn" data-action="orderedList" title="Numbered list">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="10" y1="6" x2="21" y2="6"></line>
          <line x1="10" y1="12" x2="21" y2="12"></line>
          <line x1="10" y1="18" x2="21" y2="18"></line>
          <text x="4" y="8" font-size="8" fill="currentColor" font-family="sans-serif">1</text>
          <text x="4" y="14" font-size="8" fill="currentColor" font-family="sans-serif">2</text>
          <text x="4" y="20" font-size="8" fill="currentColor" font-family="sans-serif">3</text>
        </svg>
      </button>
      <span class="tiptap-divider"></span>
    `;

    // Block elements
    if (!minimal) {
      html += `
        <button type="button" class="tiptap-btn" data-action="blockquote" title="Quote">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"></path>
            <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"></path>
          </svg>
        </button>
        <button type="button" class="tiptap-btn" data-action="codeBlock" title="Code block">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
        </button>
        <button type="button" class="tiptap-btn" data-action="horizontalRule" title="Horizontal line">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="12" x2="21" y2="12"></line>
          </svg>
        </button>
        <span class="tiptap-divider"></span>
      `;
    }

    // Link
    html += `
      <button type="button" class="tiptap-btn" data-action="link" title="Insert link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>
      </button>
      <button type="button" class="tiptap-btn" data-action="unlink" title="Remove link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
          <path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l1.72-1.71"></path>
          <line x1="2" y1="2" x2="22" y2="22"></line>
        </svg>
      </button>
    `;

    // Image (if not minimal)
    if (!minimal) {
      html += `
        <span class="tiptap-divider"></span>
        <button type="button" class="tiptap-btn" data-action="image" title="Insert image">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
        </button>
      `;
    }

    // Table (if not minimal)
    if (!minimal) {
      html += `
        <span class="tiptap-divider"></span>
        <div class="tiptap-dropdown">
          <button type="button" class="tiptap-btn tiptap-dropdown-toggle" data-action="table-dropdown" title="Table">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <line x1="3" y1="9" x2="21" y2="9"></line>
              <line x1="3" y1="15" x2="21" y2="15"></line>
              <line x1="9" y1="3" x2="9" y2="21"></line>
              <line x1="15" y1="3" x2="15" y2="21"></line>
            </svg>
          </button>
          <div class="tiptap-dropdown-menu">
            <button type="button" class="tiptap-dropdown-item" data-action="insertTable">Insert table</button>
            <button type="button" class="tiptap-dropdown-item" data-action="addColumnBefore">Add column before</button>
            <button type="button" class="tiptap-dropdown-item" data-action="addColumnAfter">Add column after</button>
            <button type="button" class="tiptap-dropdown-item" data-action="deleteColumn">Delete column</button>
            <button type="button" class="tiptap-dropdown-item" data-action="addRowBefore">Add row before</button>
            <button type="button" class="tiptap-dropdown-item" data-action="addRowAfter">Add row after</button>
            <button type="button" class="tiptap-dropdown-item" data-action="deleteRow">Delete row</button>
            <button type="button" class="tiptap-dropdown-item" data-action="deleteTable">Delete table</button>
          </div>
        </div>
      `;
    }

    toolbar.innerHTML = html;
    return toolbar;
  },

  bindToolbarEvents(toolbar, editor, minimal) {
    // Regular buttons
    toolbar.querySelectorAll('.tiptap-btn:not(.tiptap-dropdown-toggle)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.executeAction(btn.dataset.action, editor);
      });
    });

    // Dropdown toggles
    toolbar.querySelectorAll('.tiptap-dropdown-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const dropdown = toggle.closest('.tiptap-dropdown');
        dropdown.classList.toggle('open');

        // Close other dropdowns
        toolbar.querySelectorAll('.tiptap-dropdown').forEach(d => {
          if (d !== dropdown) d.classList.remove('open');
        });
      });
    });

    // Dropdown items
    toolbar.querySelectorAll('.tiptap-dropdown-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const action = item.dataset.action;
        const level = item.dataset.level;

        if (action === 'heading' && level) {
          editor.chain().focus().toggleHeading({ level: parseInt(level) }).run();
        } else if (action === 'paragraph') {
          editor.chain().focus().setParagraph().run();
        } else {
          this.executeAction(action, editor);
        }

        // Close dropdown
        item.closest('.tiptap-dropdown').classList.remove('open');
      });
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', () => {
      toolbar.querySelectorAll('.tiptap-dropdown').forEach(d => d.classList.remove('open'));
    });
  },

  executeAction(action, editor) {
    switch (action) {
      case 'bold':
        editor.chain().focus().toggleBold().run();
        break;
      case 'italic':
        editor.chain().focus().toggleItalic().run();
        break;
      case 'underline':
        editor.chain().focus().toggleUnderline().run();
        break;
      case 'strike':
        editor.chain().focus().toggleStrike().run();
        break;
      case 'bulletList':
        editor.chain().focus().toggleBulletList().run();
        break;
      case 'orderedList':
        editor.chain().focus().toggleOrderedList().run();
        break;
      case 'blockquote':
        editor.chain().focus().toggleBlockquote().run();
        break;
      case 'codeBlock':
        editor.chain().focus().toggleCodeBlock().run();
        break;
      case 'horizontalRule':
        editor.chain().focus().setHorizontalRule().run();
        break;
      case 'link':
        const url = prompt('Enter URL:', 'https://');
        if (url) {
          editor.chain().focus().setLink({ href: url }).run();
        }
        break;
      case 'unlink':
        editor.chain().focus().unsetLink().run();
        break;
      case 'image':
        this.showImageDialog(editor);
        break;
      case 'insertTable':
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        break;
      case 'addColumnBefore':
        editor.chain().focus().addColumnBefore().run();
        break;
      case 'addColumnAfter':
        editor.chain().focus().addColumnAfter().run();
        break;
      case 'deleteColumn':
        editor.chain().focus().deleteColumn().run();
        break;
      case 'addRowBefore':
        editor.chain().focus().addRowBefore().run();
        break;
      case 'addRowAfter':
        editor.chain().focus().addRowAfter().run();
        break;
      case 'deleteRow':
        editor.chain().focus().deleteRow().run();
        break;
      case 'deleteTable':
        editor.chain().focus().deleteTable().run();
        break;
    }
  },

  updateToolbarState(toolbar, editor) {
    // Update button active states
    const states = {
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      strike: editor.isActive('strike'),
      bulletList: editor.isActive('bulletList'),
      orderedList: editor.isActive('orderedList'),
      blockquote: editor.isActive('blockquote'),
      codeBlock: editor.isActive('codeBlock'),
      link: editor.isActive('link')
    };

    toolbar.querySelectorAll('.tiptap-btn[data-action]').forEach(btn => {
      const action = btn.dataset.action;
      if (states[action] !== undefined) {
        btn.classList.toggle('active', states[action]);
      }
    });

    // Update heading dropdown label
    const headingDropdown = toolbar.querySelector('[data-action="heading-dropdown"]');
    if (headingDropdown) {
      const label = headingDropdown.querySelector('.dropdown-label');
      if (editor.isActive('heading', { level: 1 })) {
        label.textContent = 'Heading 1';
      } else if (editor.isActive('heading', { level: 2 })) {
        label.textContent = 'Heading 2';
      } else if (editor.isActive('heading', { level: 3 })) {
        label.textContent = 'Heading 3';
      } else {
        label.textContent = 'Paragraph';
      }
    }
  },

  /**
   * Show image insert dialog (URL only - no uploads)
   */
  showImageDialog(editor) {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'tiptap-modal-overlay';
    overlay.innerHTML = `
      <div class="tiptap-modal">
        <div class="tiptap-modal-header">
          <h3>Insert Image</h3>
          <button type="button" class="tiptap-modal-close">&times;</button>
        </div>
        <div class="tiptap-modal-body">
          <input type="text" class="tiptap-url-input" placeholder="https://example.com/image.jpg" />
          <input type="text" class="tiptap-alt-input" placeholder="Alt text (optional)" />
        </div>
        <div class="tiptap-modal-footer">
          <button type="button" class="tiptap-modal-btn cancel">Cancel</button>
          <button type="button" class="tiptap-modal-btn primary" disabled>Insert</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector('.tiptap-modal-close');
    const cancelBtn = overlay.querySelector('.tiptap-modal-btn.cancel');
    const insertBtn = overlay.querySelector('.tiptap-modal-btn.primary');
    const urlInput = overlay.querySelector('.tiptap-url-input');
    const altInput = overlay.querySelector('.tiptap-alt-input');

    // Close modal function
    const closeModal = () => {
      overlay.remove();
      editor.commands.focus();
    };

    // Update insert button state
    const updateInsertButton = () => {
      insertBtn.disabled = !urlInput.value.trim();
    };

    // URL input
    urlInput.addEventListener('input', updateInsertButton);

    // Insert image
    insertBtn.addEventListener('click', () => {
      const src = urlInput.value.trim();
      const alt = altInput.value.trim();

      if (src) {
        editor.chain().focus().setImage({ src, alt: alt || undefined }).run();
        closeModal();
      }
    });

    // Close handlers
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    // Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // Focus URL input
    setTimeout(() => urlInput.focus(), 100);
  },

  /**
   * Get an editor instance by ID
   */
  get(id) {
    return this.instances.get(id);
  },

  /**
   * Get an editor instance by container element
   */
  getByElement(element) {
    const id = element.dataset?.tiptapId;
    return id ? this.instances.get(id) : null;
  },

  /**
   * Destroy all instances
   */
  destroyAll() {
    this.instances.forEach(instance => instance.destroy());
    this.instances.clear();
  }
};
