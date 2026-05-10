import {
  injectTranslation,
  updateTranslation,
  setTranslationStatus,
  prepareTextForApi,
} from '../dom/translation-injector';
import { showHoverPopover, removeHoverPopover } from '../dom/hover-popover';
import { connectTranslatePort } from '../../shared/messaging';
import { detectSourceLanguage } from '../../shared/i18n/language-detect';
import { getPreferences, getActivePair } from '../../shared/config/storage';
import { isExtensionAlive } from '../ext-guard';
import type { ParagraphInfo, HoverDisplayMode } from '../../shared/types';
import type { PortMessage } from '../../shared/messaging';

let isHoverMode = false;
let lastHoverTarget: HTMLElement | null = null;
let configuredKey = 'Control';
let hoverDisplayMode: HoverDisplayMode = 'inline';
let hoverKeyPressed = false; // Track if the hover modifier key is currently held

// Map: original paragraph element -> injected translation element
const paragraphTranslationMap = new Map<HTMLElement, HTMLElement>();

let hoverPrefsListenerBound = false;

/** Check if the right modifier key is currently pressed */
function isHoverKeyPressed(e: MouseEvent | KeyboardEvent): boolean {
  if (configuredKey === 'Control') return e.ctrlKey;
  if (configuredKey === 'Meta') return e.metaKey;
  if (configuredKey === 'Alt') return e.altKey;
  if (configuredKey === 'Shift') return e.shiftKey;
  return false;
}

export function enableHoverMode(): void {
  isHoverMode = true;
  hoverKeyPressed = false;
  getPreferences().catch(() => null).then(prefs => {
    if (!prefs) return;
    configuredKey = prefs.hoverKey || 'Control';
    hoverDisplayMode = prefs.hoverDisplay || 'inline';
  });
  if (!hoverPrefsListenerBound && isExtensionAlive()) {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.hoverKey?.newValue) configuredKey = changes.hoverKey.newValue as string;
      if (changes.hoverDisplay?.newValue) hoverDisplayMode = changes.hoverDisplay.newValue as HoverDisplayMode;
    });
    hoverPrefsListenerBound = true;
  }
  document.addEventListener('mouseover', handleMouseOver);
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
}

export function disableHoverMode(): void {
  isHoverMode = false;
  hoverKeyPressed = false;
  lastHoverTarget = null;
  document.removeEventListener('mouseover', handleMouseOver);
  document.removeEventListener('keydown', handleKeyDown);
  document.removeEventListener('keyup', handleKeyUp);
  document.querySelectorAll('.ft-translation[data-ft-hover]').forEach(el => el.remove());
  paragraphTranslationMap.clear();
  removeHoverPopover();
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

  // If the hover key is currently held (user pressed key then moved mouse), translate immediately
  if (hoverKeyPressed && lastHoverTarget) {
    triggerHoverTranslation(lastHoverTarget);
  }
}

function handleKeyDown(e: KeyboardEvent): void {
  if (!isHoverMode) return;
  if (e.key !== configuredKey) return;
  if (e.repeat) return;

  hoverKeyPressed = true;

  if (!lastHoverTarget) return;
  triggerHoverTranslation(lastHoverTarget);
}

function handleKeyUp(e: KeyboardEvent): void {
  if (!isHoverMode) return;
  if (e.key !== configuredKey) return;
  hoverKeyPressed = false;
}

/** Central handler: find paragraph from target element and trigger translation */
function triggerHoverTranslation(target: HTMLElement): void {
  if (target.classList.contains('ft-translation')) return;

  // If the user hovered on a replacement element itself, treat it as a restore action
  if (target.hasAttribute('data-ft-replacement') || target.closest('[data-ft-replacement]')) {
    const replacement = (target.hasAttribute('data-ft-replacement') ? target : target.closest('[data-ft-replacement]')) as HTMLElement;
    const source = replacement.previousElementSibling as HTMLElement | null;
    if (source && source.classList.contains('ft-source-hidden')) {
      source.classList.remove('ft-source-hidden', 'ft-source-fading');
      source.style.removeProperty('display');
      source.removeAttribute('data-ft-original');
      replacement.remove();
      paragraphTranslationMap.delete(source);
    }
    return;
  }

  const paragraph = findParagraphAncestor(target);
  if (!paragraph) return;

  // --- Replace mode: source is hidden with a replacement element as next sibling ---
  if (paragraph.hasAttribute('data-ft-original-html')) {
    const originalHtml = paragraph.getAttribute('data-ft-original-html');
    if (originalHtml !== null) paragraph.innerHTML = originalHtml;
    paragraph.removeAttribute('data-ft-original-html');
    paragraph.removeAttribute('data-ft-original');
    paragraph.classList.remove('ft-source-fading', 'ft-source-hidden');
    paragraph.style.removeProperty('display');
    paragraphTranslationMap.delete(paragraph);
    return;
  }

  if (paragraph.classList.contains('ft-source-hidden') || paragraph.classList.contains('ft-source-fading')) {
    const next = paragraph.nextElementSibling as HTMLElement | null;
    if (next && next.hasAttribute('data-ft-replacement')) {
      next.remove();
    }
    paragraph.classList.remove('ft-source-fading', 'ft-source-hidden');
    paragraph.style.removeProperty('display');
    paragraph.removeAttribute('data-ft-original');
    paragraphTranslationMap.delete(paragraph);
    return;
  }

  // --- Bilingual mode: translation div appended inside. Remove it. ---
  const bilingualTranslation = paragraph.querySelector(':scope > .ft-translation');
  if (bilingualTranslation) {
    bilingualTranslation.remove();
    paragraph.removeAttribute('data-ft-original');
    paragraphTranslationMap.delete(paragraph);
    return;
  }

  // --- No translation yet: trigger translation ---
  translateHoverParagraph(paragraph);
}

// Known X.com / SPA content selectors — same set as paragraph-extractor
const HOVER_KNOWN_SELECTORS = [
  '[data-testid="tweetText"]',
  '[data-testid="tweet"] [lang]',
  'article [data-testid="tweetText"]',
];

function findParagraphAncestor(el: HTMLElement): HTMLElement | null {
  // Check if element or any ancestor matches known SPA content selectors (X.com, etc.)
  let check: HTMLElement | null = el;
  while (check && check !== document.body) {
    for (const sel of HOVER_KNOWN_SELECTORS) {
      if (check.matches(sel)) {
        const text = (check.textContent || '').trim();
        if (text.length >= 2 && text.length <= 5000) return check;
      }
    }
    check = check.parentElement;
  }
  console.log('[FT hover] No paragraph ancestor found for', el, 'tag:', el.tagName);

  // Leaf-level paragraph tags + interactive UI tags (buttons, labels, links, options).
  // Hover mode is opt-in per element — include UI elements that full-page translation
  // intentionally skips, so the user can explicitly translate buttons/menu items.
  const LEAF_TAGS = new Set([
    'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH',
    'BLOCKQUOTE', 'FIGCAPTION', 'DT', 'DD', 'SUMMARY',
    'BUTTON', 'LABEL', 'A', 'OPTION', 'CAPTION',
  ]);
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'NOSCRIPT', 'SVG']);
  const LEAF_MIN_LEN = 2;
  const DIV_MIN_LEN = 10;
  const MAX_LEN = 5000;

  let current: HTMLElement | null = el;
  while (current && current !== document.body) {
    if (SKIP_TAGS.has(current.tagName)) return null;

    const text = (current.textContent || '').trim();
    if (text.length > MAX_LEN) return null;

    if (LEAF_TAGS.has(current.tagName)) {
      if (text.length >= LEAF_MIN_LEN) return current;
    }

    if (current.tagName === 'DIV' || current.tagName === 'ARTICLE' || current.tagName === 'SECTION') {
      if (text.length >= DIV_MIN_LEN && !hasBlockChildren(current)) {
        return current;
      }
      // Mixed content: div has block children + loose text. Wrap the loose text run.
      if (hasBlockChildren(current)) {
        const wrapped = wrapLooseTextRun(current);
        if (wrapped) return wrapped;
      }
    }

    current = current.parentElement;
  }
  return null;
}

/**
 * For elements with mixed content (block children + loose text), wrap the first
 * meaningful run of consecutive loose text/inline nodes into a span so it can be
 * translated without affecting the block siblings.
 */
function wrapLooseTextRun(el: HTMLElement): HTMLElement | null {
  // Reuse an existing wrapper if we already created one inside this element
  const existing = el.querySelector(':scope > [data-ft-loose-wrap]') as HTMLElement | null;
  if (existing) return existing;

  const BLOCK_CHILDREN = new Set([
    'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH',
    'BLOCKQUOTE', 'FIGCAPTION', 'DIV', 'ARTICLE', 'SECTION',
    'UL', 'OL', 'TABLE', 'NAV', 'HEADER', 'FOOTER', 'ASIDE', 'MAIN', 'FORM',
    'HR', 'BR',
  ]);

  // Collect runs of consecutive loose nodes
  const runs: Node[][] = [];
  let currentRun: Node[] = [];
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      if ((child.textContent || '').trim()) currentRun.push(child);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = (child as HTMLElement).tagName;
      if (BLOCK_CHILDREN.has(tag)) {
        if (currentRun.length > 0) { runs.push(currentRun); currentRun = []; }
      } else {
        currentRun.push(child);
      }
    }
  }
  if (currentRun.length > 0) runs.push(currentRun);

  // Pick the first run with meaningful length
  const bestRun = runs.find(r => {
    const text = r.map(n => n.textContent || '').join('').trim();
    return text.length >= 10 && text.length < 1500;
  });
  if (!bestRun || bestRun.length === 0) return null;

  // Wrap the run in a span
  const wrapper = document.createElement('span');
  wrapper.setAttribute('data-ft-loose-wrap', 'true');
  el.insertBefore(wrapper, bestRun[0]);
  for (const node of bestRun) wrapper.appendChild(node);
  return wrapper;
}

function hasBlockChildren(el: HTMLElement): boolean {
  const BLOCK_CHILD_TAGS = new Set([
    'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH',
    'BLOCKQUOTE', 'FIGCAPTION', 'DIV', 'ARTICLE', 'SECTION',
    'UL', 'OL', 'TABLE', 'NAV', 'HEADER', 'FOOTER', 'ASIDE', 'MAIN', 'FORM',
  ]);
  for (const child of el.children) {
    if (BLOCK_CHILD_TAGS.has(child.tagName)) return true;
  }
  return false;
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

  // Build a uniform sink that hides the inline-vs-popover rendering detail from the stream handler
  interface Sink {
    update: (chunk: string) => void;
    complete: () => void;
    error: (msg: string) => void;
    cached: (full: string) => void;
  }
  let sink: Sink;
  let translationEl: HTMLElement | null = null;

  if (hoverDisplayMode === 'popover') {
    const rect = element.getBoundingClientRect();
    const keyLabel = configuredKey === 'Control' ? 'Ctrl' : configuredKey === 'Meta' ? '⌘' : configuredKey;
    const handle = showHoverPopover(rect, text, keyLabel);
    sink = {
      update: (c) => handle.updateTranslation(c),
      complete: () => handle.setComplete(),
      error: (m) => handle.setError(m),
      cached: (full) => { handle.updateTranslation(full); handle.setCached(); },
    };
  } else {
    translationEl = injectTranslation(paragraphInfo, 'streaming');
    translationEl.setAttribute('data-ft-hover', 'true');
    paragraphTranslationMap.set(element, translationEl);
    sink = {
      update: (c) => translationEl && updateTranslation(translationEl, c),
      complete: () => translationEl && setTranslationStatus(translationEl, 'complete'),
      error: (_m) => {
        if (translationEl) setTranslationStatus(translationEl, 'error');
        paragraphTranslationMap.delete(element);
      },
      cached: (full) => {
        if (translationEl) {
          updateTranslation(translationEl, full);
          setTranslationStatus(translationEl, 'complete');
        }
      },
    };
  }

  try {
    const prefs = await getPreferences();
    const pair = getActivePair(prefs);
    const sourceLang = pair.from === 'auto' ? detectSourceLanguage() : pair.from;
    const targetLang = pair.to;
    const port = connectTranslatePort();

    port.onMessage.addListener((msg: PortMessage) => {
      switch (msg.type) {
        case 'translate_cached': sink.cached(msg.data.translation); port.disconnect(); break;
        case 'translate_chunk':  sink.update(msg.data.chunk); break;
        case 'translate_done':   sink.complete(); port.disconnect(); break;
        case 'translate_error':  sink.error(msg.data?.error || 'Unknown error'); port.disconnect(); break;
        case 'keepalive': break;
      }
    });

    port.onDisconnect.addListener(() => {
      // Inline mode: if still streaming on disconnect, mark as error
      if (translationEl && translationEl.getAttribute('data-ft-status') === 'streaming') {
        setTranslationStatus(translationEl, 'error');
        paragraphTranslationMap.delete(element);
      }
    });

    const textForApi = prepareTextForApi(element, paragraphInfo.text);
    port.postMessage({
      type: 'translate_request',
      data: {
        id: paragraphInfo.id,
        text: textForApi,
        hash: '',
        sourceLang,
        targetLang,
      }
    } as PortMessage);
  } catch (_err) {
    sink.error('Unknown error');
  }
}
