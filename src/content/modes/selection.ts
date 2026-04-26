import { showSelectionPopup, removeSelectionPopup } from '../dom/selection-popup';
import { connectTranslatePort } from '../../shared/messaging';
import { detectSourceLanguage, isTargetLanguage } from '../../shared/i18n/language-detect';
import { getPreferences, getActivePair } from '../../shared/config/storage';
import { isExtensionAlive } from '../ext-guard';
import type { PortMessage } from '../../shared/messaging';

const MIN_SELECTION_LENGTH = 2;

let isEnabled = true;
let triggerBtn: HTMLElement | null = null;

export function enableSelectionMode(): void {
  isEnabled = true;
  document.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('mousedown', handleMouseDown);
}

export function disableSelectionMode(): void {
  isEnabled = false;
  document.removeEventListener('mouseup', handleMouseUp);
  document.removeEventListener('mousedown', handleMouseDown);
  removeTriggerBtn();
  removeSelectionPopup();
}

/** On mousedown outside our elements, remove the trigger button */
function handleMouseDown(e: MouseEvent): void {
  if (triggerBtn && !triggerBtn.contains(e.target as Node)) {
    removeTriggerBtn();
  }
}

function handleMouseUp(_e: MouseEvent): void {
  if (!isEnabled) return;

  setTimeout(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString().trim();
    if (text.length < MIN_SELECTION_LENGTH) return;

    const anchorNode = selection.anchorNode;
    if (anchorNode && isInsideFtElement(anchorNode)) return;

    // Skip if selected text is already in target language
    getPreferences().then(prefs => {
      const pair = getActivePair(prefs);
      if (isTargetLanguage(text, pair.to)) return;

      const range = selection!.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      showTriggerBtn(rect, text, range);
    });
  }, 50);
}

/** Show a small translate icon button near the selection */
function showTriggerBtn(rect: DOMRect, text: string, range?: Range): void {
  removeTriggerBtn();

  triggerBtn = document.createElement('div');
  triggerBtn.id = 'ft-selection-trigger';
  triggerBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
      <path d="M3 6h10M8 4v2M5 6c0 5 3 8 7 8M13 6c-1 4-4 7-8 8"/>
      <path d="M13 21l4-10 4 10M14.5 17.5h5"/>
    </svg>
  `;
  triggerBtn.title = '翻译';

  // Position at the end of the last line of selection (right side)
  const rects = range ? range.getClientRects() : null;
  const lastRect = (rects && rects.length > 0) ? rects[rects.length - 1] : rect;

  let top = lastRect.top + window.scrollY + (lastRect.height - 30) / 2; // vertically center with last line
  let left = lastRect.right + window.scrollX + 4;

  // Boundary: if too far right, place just inside viewport
  if (left + 32 > window.innerWidth + window.scrollX) {
    left = lastRect.right + window.scrollX - 34;
  }
  // Boundary: if too far down, move up
  if (top + 32 > window.innerHeight + window.scrollY) {
    top = lastRect.top + window.scrollY - 36;
  }

  triggerBtn.style.cssText = `
    position: absolute;
    left: ${left}px;
    top: ${top}px;
    width: 30px;
    height: 30px;
    border-radius: 9px;
    background: oklch(1 0 0 / 0.95);
    backdrop-filter: blur(16px) saturate(160%);
    -webkit-backdrop-filter: blur(16px) saturate(160%);
    border: 1px solid oklch(0.30 0.01 260 / 0.12);
    box-shadow: 0 6px 18px -6px rgba(20,20,40,0.35), inset 0 1px 0 oklch(1 0 0 / 0.70);
    color: oklch(0.42 0.14 248);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 2147483646;
    user-select: none;
    transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
    animation: ft-trigger-pop 0.16s ease-out;
  `;
  // Inject keyframes once via a style tag on the element itself (Shadow-free but scoped by id)
  if (!document.getElementById('ft-trigger-keyframes')) {
    const style = document.createElement('style');
    style.id = 'ft-trigger-keyframes';
    style.textContent = '@keyframes ft-trigger-pop { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }';
    document.head.appendChild(style);
  }

  triggerBtn.addEventListener('mouseenter', () => {
    if (triggerBtn) triggerBtn.style.transform = 'scale(1.15)';
  });
  triggerBtn.addEventListener('mouseleave', () => {
    if (triggerBtn) triggerBtn.style.transform = 'scale(1)';
  });

  triggerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    removeTriggerBtn();
    startTranslation(rect, text);
  });

  document.body.appendChild(triggerBtn);
}

function removeTriggerBtn(): void {
  if (triggerBtn) {
    triggerBtn.remove();
    triggerBtn = null;
  }
}

/** Open translation popup and start streaming */
async function startTranslation(rect: DOMRect, text: string): Promise<void> {
  const popup = showSelectionPopup(rect, text);

  try {
    const prefs = await getPreferences();
    const pair = getActivePair(prefs);
    const sourceLang = pair.from === 'auto' ? detectSourceLanguage() : pair.from;
    const targetLang = pair.to;

    // Show current model name in popup footer
    if (isExtensionAlive()) {
      try {
        const result = await chrome.storage.local.get(['providers', 'activeProviderId', 'activeModelId']);
        const providers = result.providers as any[] | undefined;
        if (providers) {
          const p = providers.find((x: any) => x.id === result.activeProviderId) || providers[0];
          const m = p?.models?.find((x: any) => x.id === result.activeModelId) || p?.models?.[0];
          if (m?.name) popup.setModel(m.name);
        }
      } catch { /* ignore */ }
    }

    const port = connectTranslatePort();

    port.onMessage.addListener((msg: PortMessage) => {
      switch (msg.type) {
        case 'translate_cached':
          popup.updateTranslation(msg.data.translation);
          popup.setCached();
          port.disconnect();
          break;
        case 'translate_chunk':
          popup.updateTranslation(msg.data.chunk);
          break;
        case 'translate_done':
          popup.setComplete();
          port.disconnect();
          break;
        case 'translate_error':
          popup.setError(msg.data?.error || 'Unknown error');
          port.disconnect();
          break;
        case 'keepalive':
          break;
      }
    });

    port.onDisconnect.addListener(() => {});

    port.postMessage({
      type: 'translate_request',
      data: {
        id: 'selection-' + Date.now(),
        text,
        hash: '',
        sourceLang,
        targetLang,
      }
    } as PortMessage);

  } catch (err) {
    popup.setError((err as Error).message);
  }
}

function isInsideFtElement(node: Node): boolean {
  let current: Node | null = node;
  while (current) {
    if (current instanceof HTMLElement) {
      if (current.id === 'ft-selection-popup-host') return true;
      if (current.id === 'ft-selection-trigger') return true;
      if (current.classList.contains('ft-translation')) return true;
    }
    current = current.parentNode;
  }
  return false;
}

// Enable based on user preference (default on)
getPreferences().catch(() => null).then(prefs => {
  if (prefs && prefs.selectionMode !== false) enableSelectionMode();
});

// React to pref changes
if (isExtensionAlive()) {
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.selectionMode !== undefined) {
      const newVal = changes.selectionMode.newValue as boolean;
      if (newVal && !isEnabled) enableSelectionMode();
      else if (!newVal && isEnabled) disableSelectionMode();
    }
  });
}
