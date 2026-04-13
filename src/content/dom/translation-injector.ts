import type { ParagraphInfo, TranslationStatus } from '../../shared/types';

const CHUNK_CONTAINER_ATTR = 'data-ft-chunk-group';

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
  translationDiv.className = 'ft-translation';
  translationDiv.setAttribute('data-ft-id', paragraph.id);
  translationDiv.setAttribute('data-ft-status', status);

  if (isChunk) {
    translationDiv.setAttribute(CHUNK_CONTAINER_ATTR, baseId);
  }

  // Copy key styles from original element for consistency
  copyStyles(paragraph.element, translationDiv);

  // Insert spinner element for streaming state
  if (status === 'streaming') {
    const spinner = document.createElement('span');
    spinner.className = 'ft-spinner';
    translationDiv.appendChild(spinner);
  }

  // Mark the original element
  paragraph.element.setAttribute('data-ft-original', baseId);

  // Insert INSIDE the original element at the end — this works correctly in
  // table cells, flex items, grid items where afterend would be placed beside, not below.
  paragraph.element.appendChild(translationDiv);

  return translationDiv;
}

/** Update translation text (streaming append) */
export function updateTranslation(element: HTMLElement, chunk: string): void {
  // Remove spinner on first content
  const spinner = element.querySelector('.ft-spinner');
  if (spinner) spinner.remove();
  // Append text
  element.appendChild(document.createTextNode(chunk));
}

/** Set translation status and update visual style */
export function setTranslationStatus(element: HTMLElement, status: TranslationStatus): void {
  element.setAttribute('data-ft-status', status);

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
  document.querySelectorAll('.ft-translation').forEach(el => el.remove());
  document.querySelectorAll('[data-ft-original]').forEach(el => {
    el.removeAttribute('data-ft-original');
  });
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
