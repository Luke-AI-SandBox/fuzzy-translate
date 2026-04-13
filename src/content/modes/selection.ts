import { showSelectionPopup, removeSelectionPopup } from '../dom/selection-popup';
import { connectTranslatePort } from '../../shared/messaging';
import { detectSourceLanguage, isTargetLanguage } from '../../shared/i18n/language-detect';
import { getPreferences } from '../../shared/config/storage';
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
      if (isTargetLanguage(text, prefs.targetLanguage)) return;

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
  triggerBtn.innerHTML = '🌐';
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
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    cursor: pointer;
    z-index: 2147483646;
    user-select: none;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  `;

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
    const sourceLang = detectSourceLanguage();

    const port = connectTranslatePort();

    port.onMessage.addListener((msg: PortMessage) => {
      switch (msg.type) {
        case 'translate_cached':
          popup.updateTranslation(msg.data.translation);
          popup.setComplete();
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
        targetLang: prefs.targetLanguage,
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

// Auto-enable on load
enableSelectionMode();
