import type { ParagraphInfo } from '../../shared/types';

// --- Tags to skip entirely ---
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'CANVAS', 'VIDEO', 'AUDIO',
  'IFRAME', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'IMG', 'BR', 'HR',
  'CODE', 'PRE', 'KBD', 'SAMP', 'VAR', 'MATH',
]);

// --- Container tags that are typically navigation/chrome, not content ---
const NAV_TAGS = new Set([
  'NAV', 'HEADER', 'FOOTER', 'MENU', 'MENUITEM',
]);

// --- Semantic paragraph tags (leaf-level text containers) ---
const PARAGRAPH_TAGS = new Set([
  'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'LI', 'TD', 'TH', 'BLOCKQUOTE', 'FIGCAPTION',
  'CAPTION', 'DT', 'DD', 'SUMMARY',
]);

// --- Roles/classes/ids that indicate non-content areas ---
const SKIP_ROLES = new Set([
  'navigation', 'banner', 'contentinfo', 'complementary',
  'menu', 'menubar', 'toolbar', 'search', 'alert', 'dialog',
]);

const SKIP_CLASS_PATTERNS = /\b(nav|menu|sidebar|footer|header|toolbar|breadcrumb|pagination|ad|ads|advert|banner|social|share|comment-form|cookie|popup|modal|tooltip|dropdown)\b/i;

const SKIP_ID_PATTERNS = /\b(nav|menu|sidebar|footer|header|toolbar|ad|ads|banner)\b/i;

const MIN_TEXT_LENGTH = 20; // Raised from 10 to skip trivial UI labels
const MAX_PARAGRAPH_LENGTH = 5000;

// --- Known SPA content selectors (e.g. Twitter/X, Reddit) ---
const KNOWN_CONTENT_SELECTORS = [
  '[data-testid="tweetText"]',           // Twitter/X tweet body
  '[data-testid="card.layoutSmall.detail"]',  // Twitter/X link preview
  '[data-testid="tweet"] [lang]',       // X.com tweet with lang attribute
  'article [data-testid="tweetText"]',  // X.com nested tweet text
  '[data-test-id="post-content"]',       // Reddit post content
  '[data-click-id="text"]',              // Reddit comment text
  '.tweet-text', '.post-text',           // Legacy
];

/**
 * Extract translatable paragraphs from the page.
 * Strategy: only grab leaf-level paragraph elements with meaningful text content.
 * Skip navigation, menus, ads, code blocks, short UI labels.
 */
export function extractParagraphs(): ParagraphInfo[] {
  const paragraphs: ParagraphInfo[] = [];
  const seen = new WeakSet<HTMLElement>();

  // Try to find the main content area first
  const mainContent = document.querySelector('main, [role="main"], article, .article, .post, .content, .markdown-body, .entry-content, #content, #main')
    || document.body;

  // Step 0: Check for known SPA content selectors (Twitter/X, Reddit, etc.)
  // These are trusted — bypass normal nav filter since they're explicitly content
  for (const sel of KNOWN_CONTENT_SELECTORS) {
    const nodes = document.querySelectorAll(sel);
    for (const node of nodes) {
      const el = node as HTMLElement;
      if (seen.has(el)) continue;
      if (SKIP_TAGS.has(el.tagName)) continue;
      if (el.hasAttribute('data-ft-id') || el.classList.contains('ft-translation')) continue;
      if (hasAncestorInSet(el, seen)) continue;

      const text = el.textContent?.trim() || '';
      if (text.length < MIN_TEXT_LENGTH) continue;

      seen.add(el);
      addParagraph(paragraphs, el, text);
    }
  }

  // Step 1: Query semantic paragraph tags within main content
  const selector = Array.from(PARAGRAPH_TAGS).join(',');
  const candidates = mainContent.querySelectorAll(selector);

  for (const node of candidates) {
    const el = node as HTMLElement;
    if (seen.has(el)) continue;
    if (shouldSkip(el)) continue;

    const text = el.textContent?.trim() || '';
    if (!isTranslatableText(text)) continue;

    if (hasAncestorInSet(el, seen)) continue;

    seen.add(el);
    addParagraph(paragraphs, el, text);
  }

  // Step 2: Leaf-level divs in main content (no block children, has real text)
  const divCandidates = mainContent.querySelectorAll('div, article, section');

  for (const node of divCandidates) {
    const el = node as HTMLElement;
    if (seen.has(el)) continue;
    if (shouldSkip(el)) continue;
    if (hasBlockChildren(el)) continue;
    if (hasAncestorInSet(el, seen)) continue;

    const text = el.textContent?.trim() || '';
    if (!isTranslatableText(text)) continue;

    seen.add(el);
    addParagraph(paragraphs, el, text);
  }

  console.log(`[FT] Extracted ${paragraphs.length} paragraphs`);
  return paragraphs;
}

/** Check if text is worth translating */
function isTranslatableText(text: string): boolean {
  if (text.length < MIN_TEXT_LENGTH) return false;

  // Skip if mostly non-text characters (URLs, code, numbers, symbols)
  const letterCount = (text.match(/[\p{L}]/gu) || []).length;
  if (letterCount / text.length < 0.4) return false;

  // Skip single-word UI labels
  if (!text.includes(' ') && text.length < 30) return false;

  return true;
}

/** Check if element should be skipped (non-content area) */
function shouldSkip(el: HTMLElement): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;

  // Check visibility
  if (el.offsetParent === null && el.tagName !== 'BODY' && el.tagName !== 'HTML') {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
  }

  // Skip our own injected elements
  if (el.hasAttribute('data-ft-id')) return true;
  if (el.hasAttribute('data-ft-original')) return true;
  if (el.classList.contains('ft-translation')) return true;
  if (el.id === 'ft-fab-host') return true;
  if (el.id === 'ft-selection-popup-host') return true;

  // Skip if inside a navigation/non-content ancestor
  if (isInsideNonContent(el)) return true;

  return false;
}

/** Check if element is inside a nav, menu, footer, ad, etc. */
function isInsideNonContent(el: HTMLElement): boolean {
  let current: HTMLElement | null = el;
  while (current && current !== document.body) {
    // Check tag
    if (NAV_TAGS.has(current.tagName)) return true;

    // Check ARIA role
    const role = current.getAttribute('role');
    if (role && SKIP_ROLES.has(role)) return true;

    // Check class name
    if (current.className && typeof current.className === 'string' && SKIP_CLASS_PATTERNS.test(current.className)) return true;

    // Check id
    if (current.id && SKIP_ID_PATTERNS.test(current.id)) return true;

    current = current.parentElement;
  }
  return false;
}

function addParagraph(paragraphs: ParagraphInfo[], el: HTMLElement, text: string): void {
  if (text.length > MAX_PARAGRAPH_LENGTH) {
    const chunks = splitIntoChunks(text);
    const baseId = `ft-p-${paragraphs.length}`;
    chunks.forEach((chunkText, i) => {
      paragraphs.push({
        id: i === 0 ? baseId : `${baseId}_chunk_${i}`,
        element: el,
        text: chunkText,
        hash: '',
      });
    });
  } else {
    paragraphs.push({
      id: `ft-p-${paragraphs.length}`,
      element: el,
      text,
      hash: '',
    });
  }
}

function hasBlockChildren(el: HTMLElement): boolean {
  for (const child of el.children) {
    const tag = child.tagName;
    if (PARAGRAPH_TAGS.has(tag)) return true;
    if (tag === 'DIV' || tag === 'ARTICLE' || tag === 'SECTION' ||
        tag === 'UL' || tag === 'OL' || tag === 'TABLE' ||
        tag === 'NAV' || tag === 'HEADER' || tag === 'FOOTER' ||
        tag === 'ASIDE' || tag === 'MAIN' || tag === 'FORM') return true;
  }
  return false;
}

function hasAncestorInSet(el: HTMLElement, set: WeakSet<HTMLElement>): boolean {
  let parent = el.parentElement;
  while (parent && parent !== document.body) {
    if (set.has(parent)) return true;
    parent = parent.parentElement;
  }
  return false;
}

function splitIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[。！？.!?]\s*)/);

  let current = '';
  for (const sentence of sentences) {
    if (current.length + sentence.length > MAX_PARAGRAPH_LENGTH && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.length > 0 ? chunks : [text];
}
