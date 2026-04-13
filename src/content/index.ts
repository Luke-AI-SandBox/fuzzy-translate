import type { Message } from '../shared/messaging';
import { toggleFullPageTranslation, cancelTranslation, isFullPageTranslating, getProgress } from './modes/full-page';
import { removeAllTranslations } from './dom/translation-injector';
import { toggleHoverMode, isHoverModeEnabled, enableHoverMode } from './modes/hover';
import { getPreferences } from '../shared/config/storage';
import { createFloatingBall } from './dom/floating-ball';
import './modes/selection';

console.log('Fuzzy Translate loaded');

/** Show a brief toast notification */
function showToast(message: string, duration = 2000): void {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%) translateY(10px);
    background: rgba(0,0,0,0.8);
    color: #fff;
    padding: 8px 20px;
    border-radius: 20px;
    font-size: 14px;
    font-family: system-ui, -apple-system, sans-serif;
    z-index: 2147483647;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.25s ease, transform 0.25s ease;
  `;
  document.body.appendChild(toast);
  // Trigger animation
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Auto-enable hover mode based on saved preference (default: on)
let currentFabSize: 'small' | 'medium' | 'large' = 'medium';
getPreferences().then(prefs => {
  if (prefs.hoverMode) enableHoverMode();
  currentFabSize = prefs.fabSize || 'medium';
  initFab();
});

// --- Floating Ball ---
let fab: ReturnType<typeof createFloatingBall>;

function initFab() {
  if (fab) fab.destroy();
  fab = createFabInstance(currentFabSize);
}

function createFabInstance(size: 'small' | 'medium' | 'large') {
  return createFloatingBall({
  onTranslate: () => {
    if (isFullPageTranslating()) {
      // Stop: cancel all pending requests and remove incomplete translations
      cancelTranslation();
      fab.updateTranslatingState(false);
    } else {
      // Start full-page translation
      toggleFullPageTranslation();
      setTimeout(() => fab.updateTranslatingState(isFullPageTranslating()), 100);
    }
  },
  onClear: () => {
    chrome.runtime.sendMessage({ type: 'CLEAR_PAGE_CACHE' });
    cancelTranslation();
    removeAllTranslations();
    fab.updateTranslatingState(false);
    showToast('翻译缓存已清除');
  },
  onSettings: () => {
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
  },
}, size);
}

// Listen for fabSize changes to recreate the FAB
chrome.storage.onChanged.addListener((changes) => {
  if (changes.fabSize?.newValue && changes.fabSize.newValue !== currentFabSize) {
    currentFabSize = changes.fabSize.newValue as 'small' | 'medium' | 'large';
    initFab();
  }
});

// --- SPA Navigation Support ---
let lastUrl = location.href;

// MutationObserver for SPA detection (debounced)
let spaDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const observer = new MutationObserver(() => {
  if (spaDebounceTimer) clearTimeout(spaDebounceTimer);
  spaDebounceTimer = setTimeout(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      handleNavigation();
    }
  }, 500);
});

observer.observe(document.body, { childList: true, subtree: true });

// History API navigation
window.addEventListener('popstate', () => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    handleNavigation();
  }
});

function handleNavigation(): void {
  // On SPA navigation, cancel any ongoing translation and clean up
  if (isFullPageTranslating()) {
    cancelTranslation();
  }
  // Also remove completed translations from previous page view
  removeAllTranslations();
}

// --- Message Handling ---
chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  switch (message.type) {
    case 'TRANSLATE_PAGE':
      toggleFullPageTranslation();
      setTimeout(() => fab.updateTranslatingState(isFullPageTranslating()), 100);
      sendResponse({ status: 'ok' });
      break;
    case 'CANCEL_TRANSLATION':
      cancelTranslation();
      fab.updateTranslatingState(false);
      sendResponse({ status: 'ok' });
      break;
    case 'TOGGLE_HOVER_MODE': {
      const hoverEnabled = toggleHoverMode();
      sendResponse({ status: 'ok', hoverEnabled });
      break;
    }
    case 'GET_PAGE_STATUS': {
      const progress = getProgress();
      sendResponse({
        translated: progress.translated,
        total: progress.total,
        mode: isFullPageTranslating() ? 'full-page' : null
      });
      break;
    }
  }
  return true;
});

// --- Retry handler ---
document.addEventListener('ft-retry', ((e: CustomEvent) => {
  const id = e.detail?.id;
  if (id) {
    console.log('Retry translation for:', id);
    // TODO: Implement retry logic in a future iteration
  }
}) as EventListener);
