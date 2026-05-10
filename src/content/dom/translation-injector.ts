import type { ParagraphInfo, TranslationStatus, DisplayMode, BubbleStyle } from '../../shared/types';

const CHUNK_CONTAINER_ATTR = 'data-ft-chunk-group';

// Global display mode — controlled by content/index.ts on startup and storage changes
let currentDisplayMode: DisplayMode = 'bilingual';
let currentBubbleStyle: BubbleStyle = 'bare';
let currentFontScale = 1.0;
let currentPosition: 'below' | 'above' = 'below';

export function setDisplayMode(mode: DisplayMode): void { currentDisplayMode = mode; }
export function getDisplayMode(): DisplayMode { return currentDisplayMode; }
export function setBubbleStyle(style: BubbleStyle): void { currentBubbleStyle = style; }
export function setFontScale(scale: number): void { currentFontScale = scale; }
export function setTranslationPosition(pos: 'below' | 'above'): void { currentPosition = pos; }

// Map translation element -> original source element (for replace mode)
const translationSourceMap = new WeakMap<HTMLElement, HTMLElement>();

// Tokens for inline markup preservation (keyed by source element, replace mode only)
interface TokenInfo { tag: string; attrs: string; }
const tokenMapForElement = new WeakMap<HTMLElement, Map<number, TokenInfo>>();

// Inline tags whose text we want to translate but whose markup we want to preserve
const INLINE_MARKUP_TAGS = new Set([
  'A', 'CODE', 'KBD', 'SAMP', 'MARK', 'STRONG', 'B', 'EM', 'I',
  'U', 'INS', 'DEL', 'SUP', 'SUB', 'SMALL', 'Q', 'CITE',
]);

/** Tokenize source element: replace inline tags with <Tn>...</Tn> markers */
function tokenize(source: HTMLElement): { text: string; tokens: Map<number, TokenInfo> } {
  const tokens = new Map<number, TokenInfo>();
  let counter = 0;
  let result = '';

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || '';
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (INLINE_MARKUP_TAGS.has(el.tagName)) {
      counter++;
      const id = counter;
      // Serialize attributes safely
      const attrsStr = Array.from(el.attributes)
        .map(a => `${a.name}="${a.value.replace(/"/g, '&quot;')}"`)
        .join(' ');
      tokens.set(id, { tag: el.tagName.toLowerCase(), attrs: attrsStr });
      result += `<T${id}>${el.textContent || ''}</T${id}>`;
    } else {
      // For other elements (spans, wrappers), walk through
      for (const child of el.childNodes) walk(child);
    }
  };

  for (const child of source.childNodes) walk(child);
  return { text: result, tokens };
}

/** Replace <Tn>content</Tn> markers with their original HTML tags */
function detokenize(translatedText: string, tokens: Map<number, TokenInfo>): string {
  // Escape any stray HTML characters in the translation that aren't our markers.
  // Strategy: first replace markers with sentinels, then escape, then substitute back.
  const escapeHtml = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let html = translatedText;
  // Find token matches and substitute with placeholders that escaping won't touch
  const placeholders: Array<{ open: string; close: string; inner: string }> = [];
  html = html.replace(/<T(\d+)>([\s\S]*?)<\/T\1>/g, (_match, id, inner) => {
    const info = tokens.get(parseInt(id, 10));
    if (!info) return inner; // unknown token, strip
    const openTag = `<${info.tag}${info.attrs ? ' ' + info.attrs : ''}>`;
    const closeTag = `</${info.tag}>`;
    const idx = placeholders.length;
    placeholders.push({ open: openTag, close: closeTag, inner });
    return `\x00${idx}\x00`;
  });
  // Escape the rest of the text
  html = escapeHtml(html);
  // Restore placeholders
  html = html.replace(/\x00(\d+)\x00/g, (_, idx) => {
    const p = placeholders[parseInt(idx, 10)];
    return `${p.open}${escapeHtml(p.inner)}${p.close}`;
  });
  return html;
}

/** Prepare text for API: if replace mode + source has inline markup, tokenize. Otherwise plain text. */
export function prepareTextForApi(sourceElement: HTMLElement, plainText: string): string {
  if (currentDisplayMode !== 'replace') return plainText;
  const hasInline = sourceElement.querySelector('a, code, kbd, samp, mark, strong, b, em, i, u, ins, del, sup, sub, small, q, cite');
  if (!hasInline) return plainText;
  const { text, tokens } = tokenize(sourceElement);
  if (tokens.size === 0) return plainText;
  tokenMapForElement.set(sourceElement, tokens);
  // Prepend a concise instruction to help the LLM preserve the markers
  return `[Translate the text below to the target language. Preserve every <Tn>...</Tn> marker exactly — do not translate or alter the marker tags themselves, only the text around and within them.]\n\n${text}`;
}

/** Inject a translation element below the original paragraph */
export function injectTranslation(paragraph: ParagraphInfo, status: TranslationStatus = 'streaming'): HTMLElement {
  // Check if chunk container already exists for this paragraph
  const baseId = paragraph.id.replace(/_chunk_\d+$/, '');
  const isChunk = paragraph.id !== baseId;

  if (isChunk) {
    // Look for existing chunk container
    const existing = paragraph.element.parentElement?.querySelector(
      `[${CHUNK_CONTAINER_ATTR}="${baseId}"]`
    ) as HTMLElement | null;
    if (existing) {
      // Append to existing container — create a span for this chunk
      const chunkSpan = document.createElement('span');
      chunkSpan.setAttribute('data-ft-id', paragraph.id);
      chunkSpan.setAttribute('data-ft-status', status);
      existing.appendChild(chunkSpan);
      return chunkSpan;
    }
  }

  const translationDiv = document.createElement('div');
  translationDiv.className = `ft-translation ft-bubble-${currentBubbleStyle}`;
  translationDiv.setAttribute('data-ft-id', paragraph.id);
  translationDiv.setAttribute('data-ft-status', status);
  if (currentFontScale !== 1.0) {
    translationDiv.style.fontSize = `${currentFontScale}em`;
  }

  if (isChunk) {
    translationDiv.setAttribute(CHUNK_CONTAINER_ATTR, baseId);
  }

  // Copy key styles from original element for consistency
  copyStyles(paragraph.element, translationDiv);

  // Add spinner for bilingual mode streaming (hover/full-page)
  if (currentDisplayMode !== 'replace' && status === 'streaming') {
    const spinner = document.createElement('span');
    spinner.className = 'ft-spinner';
    translationDiv.appendChild(spinner);
  }

  // Mark the original element
  paragraph.element.setAttribute('data-ft-original', baseId);

  if (currentDisplayMode === 'replace') {
    // Some tags have strict DOM contracts (must be direct child of parent):
    // <summary> in <details>, <option> in <select>, <caption> in <table>, etc.
    // For these, do in-place innerHTML replacement instead of sibling replacement.
    const INPLACE_TAGS = new Set(['SUMMARY', 'OPTION', 'OPTGROUP', 'CAPTION', 'LEGEND', 'FIGCAPTION']);
    if (INPLACE_TAGS.has(paragraph.element.tagName)) {
      paragraph.element.classList.add('ft-source-fading');
      translationDiv.setAttribute('data-ft-inplace', 'true');
      translationSourceMap.set(translationDiv, paragraph.element);
      return translationDiv;
    }

    // Default: sibling replacement (create new element, hide source)
    const replacementEl = document.createElement(paragraph.element.tagName);
    replacementEl.className = paragraph.element.className;
    replacementEl.setAttribute('data-ft-replacement', 'true');
    replacementEl.setAttribute('data-ft-status', status);
    const styleAttr = paragraph.element.getAttribute('style');
    if (styleAttr) replacementEl.setAttribute('style', styleAttr);

    paragraph.element.classList.add('ft-source-fading');
    translationSourceMap.set(replacementEl, paragraph.element);
    return replacementEl;
  }

  // Bilingual mode: insert INSIDE the original element. Position determines the order:
  // 'below' → appended (default), 'above' → inserted before first child.
  if (currentPosition === 'above') {
    paragraph.element.insertBefore(translationDiv, paragraph.element.firstChild);
  } else {
    paragraph.element.appendChild(translationDiv);
  }

  return translationDiv;
}

/** Update translation text. Replace mode buffers silently; bilingual streams directly. */
export function updateTranslation(element: HTMLElement, chunk: string): void {
  if (currentDisplayMode === 'replace') {
    const existing = element.getAttribute('data-ft-buffer') || '';
    element.setAttribute('data-ft-buffer', existing + chunk);
    return;
  }
  // Bilingual mode: stream chunks directly to DOM
  const spinner = element.querySelector('.ft-spinner');
  if (spinner) spinner.remove();
  element.appendChild(document.createTextNode(chunk));
}

/** Set translation status and update visual style */
export function setTranslationStatus(element: HTMLElement, status: TranslationStatus): void {
  element.setAttribute('data-ft-status', status);

  // Replace mode: on complete, rebuild content (with inline markup preservation if tokens exist)
  const source = translationSourceMap.get(element);
  if (currentDisplayMode === 'replace' && source) {
    const isInplace = element.hasAttribute('data-ft-inplace');

    if (status === 'complete') {
      const buffered = element.getAttribute('data-ft-buffer') || '';
      if (buffered) {
        const tokens = tokenMapForElement.get(source);
        if (isInplace) {
          // In-place: modify source's innerHTML directly (preserves DOM contract like summary-in-details)
          if (!source.hasAttribute('data-ft-original-html')) {
            source.setAttribute('data-ft-original-html', source.innerHTML);
          }
          if (tokens && tokens.size > 0) {
            source.innerHTML = detokenize(buffered, tokens);
            tokenMapForElement.delete(source);
          } else {
            source.textContent = buffered;
          }
        } else {
          // Sibling replacement
          if (tokens && tokens.size > 0) {
            element.innerHTML = detokenize(buffered, tokens);
            tokenMapForElement.delete(source);
          } else {
            element.textContent = buffered;
          }
        }
        element.removeAttribute('data-ft-buffer');
      }
      if (isInplace) {
        // Source stays visible with new content; just clear fading
        source.classList.remove('ft-source-fading');
      } else {
        // Attach replacement and hide source
        if (!element.isConnected) {
          source.insertAdjacentElement('afterend', element);
        }
        source.classList.remove('ft-source-fading');
        source.classList.add('ft-source-hidden');
        source.style.setProperty('display', 'none', 'important');
      }
    } else if (status === 'error') {
      element.removeAttribute('data-ft-buffer');
      tokenMapForElement.delete(source);
      source.classList.remove('ft-source-fading');
    }
  }

  if (status === 'error') {
    injectErrorUI(element);
  }
}

/** Get translation element by paragraph ID */
export function getTranslationElement(paragraphId: string): HTMLElement | null {
  return document.querySelector(`[data-ft-id="${paragraphId}"]`);
}

/** Inject error UI with retry button */
function injectErrorUI(element: HTMLElement): void {
  // Clear partial translation
  const errorWrapper = document.createElement('div');
  errorWrapper.className = 'ft-error-content';

  const errorText = document.createElement('span');
  errorText.textContent = '翻译失败 ';

  const retryBtn = document.createElement('button');
  retryBtn.className = 'ft-retry-btn';
  retryBtn.textContent = '重试';
  retryBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // Dispatch custom event for retry — full-page.ts will handle it
    element.dispatchEvent(new CustomEvent('ft-retry', {
      bubbles: true,
      detail: { id: element.getAttribute('data-ft-id') }
    }));
  });

  errorWrapper.appendChild(errorText);
  errorWrapper.appendChild(retryBtn);

  // Replace content with error UI
  element.textContent = '';
  element.appendChild(errorWrapper);
}

/** Remove all injected translations from the page */
export function removeAllTranslations(): void {
  // Remove bilingual-mode translation divs (inside original)
  document.querySelectorAll('.ft-translation').forEach(el => el.remove());

  // Remove replace-mode replacement elements (siblings of originals)
  document.querySelectorAll('[data-ft-replacement]').forEach(el => el.remove());

  // Legacy cleanup (for in-place textContent replacement approach)
  document.querySelectorAll('[data-ft-original-html]').forEach(el => {
    const html = el.getAttribute('data-ft-original-html');
    if (html !== null) el.innerHTML = html;
    el.removeAttribute('data-ft-original-html');
  });

  // Clean tracking attributes and classes from source elements
  document.querySelectorAll('[data-ft-original]').forEach(el => {
    el.removeAttribute('data-ft-original');
    el.classList.remove('ft-source-fading', 'ft-source-hidden');
    (el as HTMLElement).style.removeProperty('display');
  });
  document.querySelectorAll('.ft-source-fading, .ft-source-hidden').forEach(el => {
    el.classList.remove('ft-source-fading', 'ft-source-hidden');
    (el as HTMLElement).style.removeProperty('display');
  });
}

/** Check if an element has block-level children (indicates complex structure, not a leaf paragraph) */
function hasBlockChildren(el: HTMLElement): boolean {
  const BLOCK_TAGS = new Set([
    'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH',
    'BLOCKQUOTE', 'FIGCAPTION', 'DIV', 'ARTICLE', 'SECTION',
    'UL', 'OL', 'TABLE', 'NAV', 'HEADER', 'FOOTER', 'ASIDE', 'MAIN', 'FORM',
  ]);
  for (const child of el.children) {
    if (BLOCK_TAGS.has(child.tagName)) return true;
  }
  return false;
}

/** Copy all typography styles from source to target so translation looks identical */
function copyStyles(source: HTMLElement, target: HTMLElement): void {
  const computed = getComputedStyle(source);
  target.style.fontSize = computed.fontSize;
  target.style.fontFamily = computed.fontFamily;
  target.style.fontWeight = computed.fontWeight;
  target.style.lineHeight = computed.lineHeight;
  target.style.textAlign = computed.textAlign;
  target.style.color = computed.color;
  target.style.letterSpacing = computed.letterSpacing;
  target.style.margin = computed.margin;
  target.style.padding = computed.padding;
}
