import { extractParagraphs } from '../dom/paragraph-extractor';
import {
  injectTranslation,
  updateTranslation,
  setTranslationStatus,
  removeAllTranslations,
  prepareTextForApi
} from '../dom/translation-injector';
import { connectTranslatePort } from '../../shared/messaging';
import { getPreferences, getActivePair } from '../../shared/config/storage';
import { detectSourceLanguage } from '../../shared/i18n/language-detect';
import type { ParagraphInfo } from '../../shared/types';
import type { PortMessage } from '../../shared/messaging';

let isTranslating = false;
let abortController: AbortController | null = null;
let intersectionObserver: IntersectionObserver | null = null;

const translationElMap = new Map<string, HTMLElement>();
const translatedOrQueued = new Set<string>();

// Queue of paragraphs waiting to be translated
let pendingQueue: ParagraphInfo[] = [];
let activeCount = 0;
let maxConcurrency = 3;
let sourceLang = '';
let targetLang = '';

/** Toggle full-page translation on/off */
export async function toggleFullPageTranslation(): Promise<void> {
  if (isTranslating) {
    cancelTranslation();
    return;
  }

  isTranslating = true;
  abortController = new AbortController();

  const prefs = await getPreferences();
  const pair = getActivePair(prefs);
  sourceLang = pair.from === 'auto' ? detectSourceLanguage() : pair.from;
  targetLang = pair.to;
  maxConcurrency = prefs.maxConcurrency;

  // X.com and other SPAs may not have rendered content yet — retry with backoff
  let paragraphs = extractParagraphs();
  if (paragraphs.length === 0) {
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
      if (!isTranslating) { isTranslating = false; return; }
      paragraphs = extractParagraphs();
      if (paragraphs.length > 0) break;
    }
  }

  if (paragraphs.length === 0) {
    isTranslating = false;
    return;
  }

  // Build a map: element -> all paragraphs referencing it (handles chunks)
  const elementToParagraphs = new Map<HTMLElement, ParagraphInfo[]>();
  for (const p of paragraphs) {
    const list = elementToParagraphs.get(p.element) || [];
    list.push(p);
    elementToParagraphs.set(p.element, list);
  }

  // Set up IntersectionObserver: only translate when element enters viewport
  intersectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting || !isTranslating) continue;

      const el = entry.target as HTMLElement;
      const elParagraphs = elementToParagraphs.get(el);
      if (!elParagraphs) continue;

      intersectionObserver?.unobserve(el);

      for (const paragraph of elParagraphs) {
        if (translatedOrQueued.has(paragraph.id)) continue;
        translatedOrQueued.add(paragraph.id);

        // Inject spinner
        const translationEl = injectTranslation(paragraph, 'streaming');
        translationElMap.set(paragraph.id, translationEl);

        // Enqueue
        pendingQueue.push(paragraph);
      }

      drainQueue();
    }
  }, { rootMargin: '200px 0px' });

  // Observe each unique element (not each paragraph — one element may have multiple chunks)
  for (const el of elementToParagraphs.keys()) {
    intersectionObserver.observe(el);
  }
}

/** Drain the pending queue respecting concurrency limit */
function drainQueue(): void {
  while (pendingQueue.length > 0 && activeCount < maxConcurrency && !abortController?.signal.aborted) {
    const paragraph = pendingQueue.shift()!;
    activeCount++;
    translateOneParagraph(paragraph).finally(() => {
      activeCount--;
      drainQueue();
    });
  }
}

/**
 * Translate a single paragraph via Port — same flow as hover mode.
 * Background handles cache check + API call + streaming.
 */
function translateOneParagraph(paragraph: ParagraphInfo): Promise<void> {
  return new Promise((resolve) => {
    if (abortController?.signal.aborted) { resolve(); return; }

    const translationEl = translationElMap.get(paragraph.id);
    if (!translationEl) { resolve(); return; }

    const port = connectTranslatePort();

    const onAbort = () => { port.disconnect(); resolve(); };
    abortController?.signal.addEventListener('abort', onAbort, { once: true });

    port.onMessage.addListener((msg: PortMessage) => {
      switch (msg.type) {
        case 'translate_cached':
          updateTranslation(translationEl, msg.data.translation);
          setTranslationStatus(translationEl, 'complete');
          port.disconnect();
          resolve();
          break;
        case 'translate_chunk':
          updateTranslation(translationEl, msg.data.chunk);
          break;
        case 'translate_done':
          setTranslationStatus(translationEl, 'complete');
          port.disconnect();
          resolve();
          break;
        case 'translate_error':
          setTranslationStatus(translationEl, 'error');
          port.disconnect();
          resolve();
          break;
        case 'keepalive':
          break;
      }
    });

    port.onDisconnect.addListener(() => {
      abortController?.signal.removeEventListener('abort', onAbort);
      if (translationEl.getAttribute('data-ft-status') === 'streaming') {
        setTranslationStatus(translationEl, 'error');
        resolve();
      }
    });

    const textForApi = prepareTextForApi(paragraph.element, paragraph.text);
    port.postMessage({
      type: 'translate_request',
      data: {
        id: paragraph.id,
        text: textForApi,
        hash: paragraph.hash,
        sourceLang,
        targetLang,
      }
    } as PortMessage);
  });
}

/** Cancel ongoing translation */
export function cancelTranslation(): void {
  isTranslating = false;
  if (abortController) { abortController.abort(); abortController = null; }
  if (intersectionObserver) { intersectionObserver.disconnect(); intersectionObserver = null; }
  pendingQueue = [];
  activeCount = 0;
  translatedOrQueued.clear();
  removeAllTranslations();
  translationElMap.clear();
}

export function isFullPageTranslating(): boolean {
  return isTranslating;
}

export function getProgress(): { translated: number; total: number } {
  const total = translatedOrQueued.size;
  const translated = document.querySelectorAll('.ft-translation[data-ft-status="complete"]').length;
  return { translated, total: Math.max(total, translated) };
}
