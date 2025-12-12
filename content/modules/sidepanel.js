/**
 * HubSpot Helper - Side Panel Module
 *
 * Handles the Floating Action Button (FAB) and side panel functionality
 * for displaying battle cards (plays) on HubSpot record pages.
 *
 * Features:
 * - Renders a draggable FAB showing count of matching battle cards
 * - FAB position persists across sessions (stored in localStorage)
 * - Opens Chrome's native side panel when clicked
 * - Communicates with side panel via Chrome runtime messaging
 *
 * Dependencies:
 * - Requires Chrome's Side Panel API (managed by background.js)
 * - Uses chrome.runtime for messaging
 *
 * Usage:
 *   const sidepanel = new SidePanelModule(helper);
 *   sidepanel.renderFAB(cardCount);
 *   sidepanel.cleanup();
 */

class SidePanelModule {
  /**
   * @param {Object} helper - Reference to main HubSpotHelper instance
   * @param {Object} helper.settings - User settings including showBattleCards
   */
  constructor(helper) {
    this.helper = helper;
    this.fab = null;
  }

  // ============ FAB RENDERING ============

  /**
   * Render the Floating Action Button
   * @param {number} cardCount - Number of matching battle cards to show in badge
   */
  renderFAB(cardCount) {
    // Check if setting is enabled
    if (this.helper.settings.showBattleCards === false) {
      return;
    }

    // Don't render if no cards
    if (cardCount === 0) {
      return;
    }

    // Remove existing FAB if present
    const existingFab = document.getElementById('hshelper-fab');
    if (existingFab) {
      existingFab.remove();
    }

    const fab = document.createElement('button');
    fab.className = 'hshelper-fab has-cards';
    fab.id = 'hshelper-fab';
    fab.innerHTML = `
      <span class="hshelper-fab-drag-handle"></span>
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>
      <span class="hshelper-fab-badge">${cardCount}</span>
    `;

    // Restore saved position from localStorage
    const savedPosition = localStorage.getItem('hshelper-fab-position');
    if (savedPosition) {
      try {
        const pos = JSON.parse(savedPosition);
        fab.style.top = `${pos.top}px`;
        fab.style.transform = 'none';
      } catch (e) {
        this.log('Error restoring FAB position:', e);
      }
    }

    // Setup drag functionality
    this.setupFABDrag(fab);

    // Click handler to open side panel
    fab.addEventListener('click', (e) => {
      this.log('FAB clicked, wasDragging:', fab.dataset.wasDragging);
      // Only open panel if not dragging
      if (!fab.dataset.wasDragging) {
        this.openSidePanel();
      }
      delete fab.dataset.wasDragging;
    });

    // Add to container
    const container = document.getElementById('hshelper-container');
    if (container) {
      container.appendChild(fab);
      this.fab = fab;
    }
  }

  // ============ FAB DRAG FUNCTIONALITY ============

  /**
   * Set up drag functionality for the FAB
   * Allows vertical dragging within viewport bounds
   * @param {HTMLElement} fab - The FAB element
   */
  setupFABDrag(fab) {
    let isDragging = false;
    let startY = 0;
    let startTop = 0;
    let hasMoved = false;

    const onMouseDown = (e) => {
      // Prevent default to avoid text selection
      e.preventDefault();

      isDragging = true;
      hasMoved = false;
      startY = e.clientY;

      // Get current top position
      const rect = fab.getBoundingClientRect();
      startTop = rect.top;

      fab.classList.add('dragging');
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;

      const deltaY = e.clientY - startY;

      // Only mark as moved if we've moved more than 5px (to distinguish from clicks)
      if (Math.abs(deltaY) > 5) {
        hasMoved = true;
      }

      // Calculate new position, keeping within viewport bounds
      const fabHeight = fab.offsetHeight;
      let newTop = startTop + deltaY;

      // Clamp to viewport bounds with 10px padding
      newTop = Math.max(10, Math.min(window.innerHeight - fabHeight - 10, newTop));

      fab.style.top = `${newTop}px`;
      fab.style.transform = 'none';
    };

    const onMouseUp = () => {
      isDragging = false;
      fab.classList.remove('dragging');

      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      // Mark that we were dragging so click handler knows not to open panel
      if (hasMoved) {
        fab.dataset.wasDragging = 'true';

        // Save position to localStorage for persistence
        const rect = fab.getBoundingClientRect();
        localStorage.setItem('hshelper-fab-position', JSON.stringify({
          top: rect.top
        }));
      }
    };

    fab.addEventListener('mousedown', onMouseDown);
  }

  // ============ SIDE PANEL ============

  /**
   * Open the Chrome side panel
   * Sends message to background script which handles the actual panel opening
   */
  openSidePanel() {
    this.log('Sending openSidePanel message to background');
    chrome.runtime.sendMessage({ action: 'openSidePanel' }, (response) => {
      if (chrome.runtime.lastError) {
        this.log('Error sending message:', chrome.runtime.lastError.message);
      } else {
        this.log('Message sent successfully');
      }
    });
  }

  /**
   * Update the FAB badge count
   * @param {number} count - New count to display
   */
  updateBadge(count) {
    const badge = document.querySelector('.hshelper-fab-badge');
    if (badge) {
      badge.textContent = count;
    }
  }

  // ============ CLEANUP ============

  /**
   * Remove FAB and clean up
   */
  cleanup() {
    const fab = document.getElementById('hshelper-fab');
    if (fab) {
      fab.remove();
    }
    this.fab = null;
  }

  /**
   * Log message with prefix
   * @param {...any} args - Arguments to log
   */
  log(...args) {
    console.log('[HubSpot Helper]', ...args);
  }
}

// Export for use in content.js
if (typeof window !== 'undefined') {
  window.SidePanelModule = SidePanelModule;
}
