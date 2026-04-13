import {
  injectTranslation,
  updateTranslation,
  setTranslationStatus,
} from '../dom/translation-injector';
import { connectTranslatePort } from '../../shared/messaging';
import { detectSourceLanguage } from '../../shared/i18n/language-detect';
import { getPreferences } from '../../shared/config/storage';
import type { ParagraphInfo } from '../../shared/types';
import type { PortMessage } from '../../shared/messaging';

let isHoverMode = false;
let lastHoverTarget: HTMLElement | null = null;
let configuredKey = 'Control'; // Will be loaded from preferences

// Map: original paragraph element -> injected translation element
const paragraphTranslationMap = new Map<HTMLElement, HTMLElement>();

export function enableHoverMode(): void {
  isHoverMode = true;
  // Load the configured hover key
  getPreferences().then(prefs => { configuredKey = prefs.hoverKey || 'Control'; });
  // Listen for settings changes in real-time
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.hoverKey?.newValue) {
      configuredKey = changes.hoverKey.newValue as string;
    }
  });
  document.addEventListener('mouseover', handleMouseOver);
  document.addEventListener('keydown', handleKeyDown);
}

export function disableHoverMode(): void {
  isHoverMode = false;
  lastHoverTarget = null;
  document.removeEventListener('mouseover', handleMouseOver);
  document.removeEventListener('keydown', handleKeyDown);
  document.querySelectorAll('.ft-translation[data-ft-hover]').forEach(el => el.remove());
  paragraphTranslationMap.clear();
}

export function isHoverModeEnabled(): boolean {
  return isHoverMode;
}

export function toggleHoverMode(): boolean {
  if (isHoverMode) {
    disableHoverMode();
  } else {
    enableHoverMode();
  }
  return isHoverMode;
}

function handleMouseOver(e: MouseEvent): void {
  if (!isHoverMode) return;
  lastHoverTarget = e.target as HTMLElement;
}

function handleKeyDown(e: KeyboardEvent): void {
  if (!isHoverMode || e.key !== configuredKey) return;
  if (e.repeat) return; // Ignore key repeat

  if (!lastHoverTarget) return;
  const target = lastHoverTarget;
  if (target.classList.contains('ft-translation')) return;

  const paragraph = findParagraphAncestor(target);
  if (!paragraph) return;

  // Toggle: if already has translation, hide/show it
  const existingEl = paragraphTranslationMap.get(paragraph);
  if (existingEl) {
    if (existingEl.style.display === 'none') {
      existingEl.style.display = '';
    } else {
      existingEl.style.display = 'none';
    }
    return;
  }

  translateHoverParagraph(paragraph);
}

function findParagraphAncestor(el: HTMLElement): HTMLElement | null {
  const PARAGRAPH_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'FIGCAPTION', 'DIV', 'ARTICLE']);
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'NOSCRIPT', 'SVG']);

  let current: HTMLElement | null = el;
  while (current && current !== document.body) {
    if (SKIP_TAGS.has(current.tagName)) return null;
    if (PARAGRAPH_TAGS.has(current.tagName)) {
      const text = (current.textContent || '').trim();
      if (text.length >= 10) return current;
    }
    current = current.parentElement;
  }
  return null;
}

async function translateHoverParagraph(element: HTMLElement): Promise<void> {
  const text = (element.textContent || '').trim();
  if (text.length < 10) return;

  const paragraphInfo: ParagraphInfo = {
    id: `ft-hover-${Date.now()}`,
    element,
    text,
    hash: '',
  };

  // Inject with streaming status (shows loading)
  const translationEl = injectTranslation(paragraphInfo, 'streaming');
  translationEl.setAttribute('data-ft-hover', 'true');
  paragraphTranslationMap.set(element, translationEl);

  try {
    const prefs = await getPreferences();
    const sourceLang = detectSourceLanguage();
    const port = connectTranslatePort();

    port.onMessage.addListener((msg: PortMessage) => {
      switch (msg.type) {
        case 'translate_cached':
          updateTranslation(translationEl, msg.data.translation);
          setTranslationStatus(translationEl, 'complete');
          port.disconnect();
          break;
        case 'translate_chunk':
          updateTranslation(translationEl, msg.data.chunk);
          break;
        case 'translate_done':
          setTranslationStatus(translationEl, 'complete');
          port.disconnect();
          break;
        case 'translate_error':
          setTranslationStatus(translationEl, 'error');
          // Translation failed — remove from map so user can retry
          paragraphTranslationMap.delete(element);
          port.disconnect();
          break;
        case 'keepalive':
          break;
      }
    });

    port.onDisconnect.addListener(() => {
      if (translationEl.getAttribute('data-ft-status') === 'streaming') {
        setTranslationStatus(translationEl, 'error');
        paragraphTranslationMap.delete(element);
      }
    });

    port.postMessage({
      type: 'translate_request',
      data: {
        id: paragraphInfo.id,
        text: paragraphInfo.text,
        hash: '',
        sourceLang,
        targetLang: prefs.targetLanguage,
      }
    } as PortMessage);
  } catch (_err) {
    setTranslationStatus(translationEl, 'error');
    paragraphTranslationMap.delete(element);
  }
}
