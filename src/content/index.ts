import type { Message } from '../shared/messaging';
import { toggleFullPageTranslation, cancelTranslation, isFullPageTranslating, getProgress } from './modes/full-page';
import { removeAllTranslations, setDisplayMode, setBubbleStyle, setFontScale, setTranslationPosition } from './dom/translation-injector';
import type { DisplayMode } from '../shared/types';
import { toggleHoverMode, isHoverModeEnabled, enableHoverMode } from './modes/hover';
import { getPreferences } from '../shared/config/storage';
import { createFloatingBall } from './dom/floating-ball';
import { showTranslateToolbar, hideTranslateToolbar, updateToolbarProgress, isToolbarVisible } from './dom/translate-toolbar';
import { initTheme } from './theme-sync';
import { isExtensionAlive, safeSendMessage } from './ext-guard';
import './modes/selection';

// Initialize theme early so Shadow DOMs created later pick it up
initTheme();

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
getPreferences().catch(() => null).then(prefs => {
  if (!prefs) return;
  // Site rule lookup — 'never' hides all UI, 'always' auto-triggers translation
  const host = location.hostname;
  const siteRule = prefs.siteRules?.[host];
  if (siteRule === 'never') return; // Full opt-out for this site

  if (prefs.hoverMode) enableHoverMode();
  currentFabSize = prefs.fabSize || 'medium';
  setDisplayMode(prefs.displayMode || 'bilingual');
  setBubbleStyle(prefs.bubbleStyle || 'bare');
  setFontScale(prefs.fontScale || 1.0);
  setTranslationPosition(prefs.translationPosition || 'below');
  initFab();

  // Auto-translate if rule is 'always'
  if (siteRule === 'always') {
    setTimeout(() => {
      if (!isFullPageTranslating()) {
        toggleFullPageTranslation();
        setTimeout(() => {
          fab?.updateTranslatingState(isFullPageTranslating());
          showToolbar();
        }, 200);
      }
    }, 400);
  }
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
      cancelTranslation();
      fab.updateTranslatingState(false);
      hideToolbar();
    } else {
      toggleFullPageTranslation();
      setTimeout(() => {
        fab.updateTranslatingState(isFullPageTranslating());
        showToolbar();
      }, 100);
    }
  },
  onClear: () => {
    safeSendMessage({ type: 'CLEAR_PAGE_CACHE' });
    cancelTranslation();
    removeAllTranslations();
    fab.updateTranslatingState(false);
    hideToolbar();
    showToast('翻译缓存已清除');
  },
  onSettings: () => {
    safeSendMessage({ type: 'OPEN_OPTIONS' });
  },
}, size);
}

// Cancel ongoing translations when the page enters bfcache (prevents orphaned ports)
window.addEventListener('pagehide', (e) => {
  if (e.persisted && isFullPageTranslating()) {
    cancelTranslation();
  }
});

// Listen for fabSize changes to recreate the FAB
if (isExtensionAlive()) chrome.storage.onChanged.addListener((changes) => {
  if (changes.fabSize?.newValue && changes.fabSize.newValue !== currentFabSize) {
    currentFabSize = changes.fabSize.newValue as 'small' | 'medium' | 'large';
    initFab();
  }
  if (changes.displayMode?.newValue) {
    setDisplayMode(changes.displayMode.newValue as DisplayMode);
  }
  if (changes.bubbleStyle?.newValue) {
    setBubbleStyle(changes.bubbleStyle.newValue as any);
  }
  if (changes.fontScale?.newValue !== undefined) {
    setFontScale(changes.fontScale.newValue as number);
  }
  if (changes.translationPosition?.newValue) {
    setTranslationPosition(changes.translationPosition.newValue as 'below' | 'above');
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
      setTimeout(() => {
        fab.updateTranslatingState(isFullPageTranslating());
        if (isFullPageTranslating()) showToolbar(); else hideToolbar();
      }, 100);
      sendResponse({ status: 'ok' });
      break;
    case 'CANCEL_TRANSLATION':
      cancelTranslation();
      fab.updateTranslatingState(false);
      hideToolbar();
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

// --- Translate toolbar lifecycle ---
let toolbarPollTimer: ReturnType<typeof setInterval> | null = null;

function showToolbar(): void {
  if (isToolbarVisible()) return;
  showTranslateToolbar({
    onRetry: () => {
      cancelTranslation();
      removeAllTranslations();
      setTimeout(() => {
        toggleFullPageTranslation();
        setTimeout(() => fab.updateTranslatingState(isFullPageTranslating()), 100);
      }, 100);
    },
    onSettings: () => safeSendMessage({ type: 'OPEN_OPTIONS' }),
    onStop: () => {
      cancelTranslation();
      fab.updateTranslatingState(false);
      hideToolbar();
    },
  });
  // Poll progress to update the toolbar
  if (toolbarPollTimer) clearInterval(toolbarPollTimer);
  toolbarPollTimer = setInterval(() => {
    if (!isFullPageTranslating() && !isToolbarVisible()) return;
    const { translated, total } = getProgress();
    updateToolbarProgress(translated, total);
    // Auto-hide when translation finished (all done)
    if (!isFullPageTranslating() && translated > 0 && translated >= total) {
      // Keep toolbar visible briefly showing "done" state, then hide
      setTimeout(() => hideToolbar(), 2500);
      clearInterval(toolbarPollTimer!);
      toolbarPollTimer = null;
    }
  }, 400);
}

function hideToolbar(): void {
  hideTranslateToolbar();
  if (toolbarPollTimer) {
    clearInterval(toolbarPollTimer);
    toolbarPollTimer = null;
  }
}
