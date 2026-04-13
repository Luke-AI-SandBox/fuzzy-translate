import type { PortMessage } from '../../shared/messaging';

const POPUP_WIDTH = 360;
const POPUP_MAX_HEIGHT = 300;

let popupHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let currentCloseHandler: ((e: MouseEvent) => void) | null = null;
let currentEscHandler: ((e: KeyboardEvent) => void) | null = null;

export function showSelectionPopup(
  rect: DOMRect,
  originalText: string,
  onClose?: () => void
): { updateTranslation: (chunk: string) => void; setComplete: () => void; setError: (msg: string) => void } {
  removeSelectionPopup();

  // Create host element
  popupHost = document.createElement('div');
  popupHost.id = 'ft-selection-popup-host';
  popupHost.style.cssText = 'all:initial; position:absolute; z-index:2147483647;';

  // Position near selection
  const top = rect.bottom + window.scrollY + 8;
  let left = rect.left + window.scrollX;

  // Boundary check: right overflow
  if (left + POPUP_WIDTH > window.innerWidth + window.scrollX) {
    left = window.innerWidth + window.scrollX - POPUP_WIDTH - 16;
  }
  // Boundary check: bottom overflow — show above selection instead
  let positionAbove = false;
  if (top + POPUP_MAX_HEIGHT > window.innerHeight + window.scrollY) {
    positionAbove = true;
  }

  popupHost.style.left = `${Math.max(8, left)}px`;
  popupHost.style.top = positionAbove
    ? `${rect.top + window.scrollY - POPUP_MAX_HEIGHT - 8}px`
    : `${top}px`;

  // Create Shadow DOM
  shadowRoot = popupHost.attachShadow({ mode: 'open' });
  shadowRoot.innerHTML = `
    <style>
      :host { all: initial; }
      .ft-popup {
        width: ${POPUP_WIDTH}px;
        max-height: ${POPUP_MAX_HEIGHT}px;
        overflow-y: auto;
        background: white;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.12);
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        color: #333;
        padding: 12px;
      }
      .ft-popup-original {
        color: #666;
        font-size: 12px;
        margin-bottom: 8px;
        padding-bottom: 8px;
        border-bottom: 1px solid #f0f0f0;
        max-height: 60px;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ft-popup-translation {
        line-height: 1.6;
        min-height: 20px;
      }
      .ft-popup-spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid #ccc;
        border-top-color: #666;
        border-radius: 50%;
        animation: ft-popup-spin 0.6s linear infinite;
        vertical-align: middle;
      }
      .ft-popup-error {
        color: #ef4444;
        font-size: 13px;
      }
      @keyframes ft-popup-spin {
        to { transform: rotate(360deg); }
      }
    </style>
    <div class="ft-popup">
      <div class="ft-popup-original"></div>
      <div class="ft-popup-translation streaming"><span class="ft-popup-spinner"></span></div>
    </div>
  `;

  // Set original text (truncated)
  const originalEl = shadowRoot.querySelector('.ft-popup-original') as HTMLElement;
  originalEl.textContent = originalText.length > 100
    ? originalText.slice(0, 100) + '...'
    : originalText;

  const translationEl = shadowRoot.querySelector('.ft-popup-translation') as HTMLElement;

  document.body.appendChild(popupHost);

  // Close handlers
  const closePopup = () => {
    removeSelectionPopup();
    onClose?.();
  };

  currentCloseHandler = (e: MouseEvent) => {
    if (popupHost && !popupHost.contains(e.target as Node)) {
      closePopup();
    }
  };
  currentEscHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closePopup();
  };

  // Delay adding click handler to avoid immediate close from the mouseup that triggered selection
  setTimeout(() => {
    document.addEventListener('mousedown', currentCloseHandler!);
    document.addEventListener('keydown', currentEscHandler!);
  }, 100);

  return {
    updateTranslation(chunk: string) {
      const spinner = translationEl.querySelector('.ft-popup-spinner');
      if (spinner) spinner.remove();
      translationEl.appendChild(document.createTextNode(chunk));
    },
    setComplete() {
      translationEl.classList.remove('streaming');
    },
    setError(msg: string) {
      translationEl.classList.remove('streaming');
      translationEl.classList.add('ft-popup-error');
      translationEl.textContent = `翻译失败: ${msg}`;
    }
  };
}

export function removeSelectionPopup(): void {
  if (currentCloseHandler) {
    document.removeEventListener('mousedown', currentCloseHandler);
    currentCloseHandler = null;
  }
  if (currentEscHandler) {
    document.removeEventListener('keydown', currentEscHandler);
    currentEscHandler = null;
  }
  if (popupHost) {
    popupHost.remove();
    popupHost = null;
    shadowRoot = null;
  }
}

export function isPopupVisible(): boolean {
  return popupHost !== null;
}
