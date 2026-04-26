import { shadowThemeStyle } from '../theme-sync';

const POPUP_WIDTH = 340;
const POPUP_MAX_HEIGHT = 320;

let popupHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let currentCloseHandler: ((e: MouseEvent) => void) | null = null;
let currentEscHandler: ((e: KeyboardEvent) => void) | null = null;

interface PopupHandle {
  updateTranslation: (chunk: string) => void;
  setComplete: () => void;
  setError: (msg: string) => void;
  setCached: () => void;
  setModel: (name: string) => void;
}

export function showSelectionPopup(
  rect: DOMRect,
  originalText: string,
  onClose?: () => void
): PopupHandle {
  removeSelectionPopup();

  popupHost = document.createElement('div');
  popupHost.id = 'ft-selection-popup-host';
  popupHost.style.cssText = 'all:initial; position:absolute; z-index:2147483647;';

  const top = rect.bottom + window.scrollY + 8;
  let left = rect.left + window.scrollX;
  if (left + POPUP_WIDTH > window.innerWidth + window.scrollX) {
    left = window.innerWidth + window.scrollX - POPUP_WIDTH - 16;
  }
  let positionAbove = false;
  if (top + POPUP_MAX_HEIGHT > window.innerHeight + window.scrollY) {
    positionAbove = true;
  }

  popupHost.style.left = `${Math.max(8, left)}px`;
  popupHost.style.top = positionAbove
    ? `${rect.top + window.scrollY - POPUP_MAX_HEIGHT - 8}px`
    : `${top}px`;

  shadowRoot = popupHost.attachShadow({ mode: 'open' });
  shadowRoot.innerHTML = `
    <style>
      ${shadowThemeStyle()}
      :host { all: initial; }

      .ft-popup {
        width: ${POPUP_WIDTH}px;
        max-height: ${POPUP_MAX_HEIGHT}px;
        display: flex; flex-direction: column; overflow: hidden;
        background: var(--glass-bg);
        backdrop-filter: blur(24px) saturate(160%);
        -webkit-backdrop-filter: blur(24px) saturate(160%);
        border: 1px solid var(--glass-border);
        border-radius: 14px;
        box-shadow: 0 16px 40px -12px rgba(20,20,40,0.28), inset 0 1px 0 var(--glass-inner-hl);
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        color: var(--fg);
        animation: ft-pop 0.18s ease-out;
      }

      @keyframes ft-pop {
        from { opacity: 0; transform: translateY(-4px) scale(0.96); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }

      .ft-hdr {
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px; padding: 10px 12px 8px;
        border-bottom: 1px solid var(--glass-border);
      }
      .ft-hdr-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .ft-hdr-icon {
        width: 22px; height: 22px; border-radius: 6px;
        background: var(--accent-soft);
        color: var(--accent-fg);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .ft-hdr-icon svg { width: 12px; height: 12px; }
      .ft-hdr-label {
        font-size: 11px; font-weight: 500; letter-spacing: 0.3px;
        color: var(--muted);
      }
      .ft-pill {
        display: none;
        align-items: center;
        padding: 2px 8px; border-radius: 999px;
        font-size: 10px; font-weight: 500; letter-spacing: 0.2px;
        background: var(--accent-soft);
        color: var(--accent-fg);
      }
      .ft-pill.shown { display: inline-flex; }
      .ft-hdr-actions { display: flex; gap: 2px; }
      .ft-icon-btn {
        width: 24px; height: 24px; border-radius: 6px;
        background: transparent; border: none;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; padding: 0;
        color: var(--muted);
        transition: background 0.15s, color 0.15s;
      }
      .ft-icon-btn:hover {
        background: var(--surface-soft);
        color: var(--fg);
      }
      .ft-icon-btn.success { color: var(--success); }
      .ft-icon-btn svg { width: 13px; height: 13px; }

      .ft-body { padding: 10px 14px; overflow-y: auto; }
      .ft-original {
        font-family: "Iowan Old Style", "Hoefler Text", Georgia, serif;
        font-size: 13px; line-height: 1.55;
        color: var(--muted);
        margin-bottom: 8px;
        max-height: 72px; overflow: hidden;
        -webkit-mask-image: linear-gradient(to bottom, black 70%, transparent 100%);
        mask-image: linear-gradient(to bottom, black 70%, transparent 100%);
      }
      .ft-translation {
        font-family: "Iowan Old Style", "Hoefler Text", Georgia, serif;
        font-size: 15px; line-height: 1.6;
        color: var(--translated-fg);
        min-height: 20px;
      }

      .ft-spinner {
        display: inline-block;
        width: 14px; height: 14px;
        border: 2px solid var(--glass-border);
        border-top-color: var(--accent);
        border-radius: 50%;
        animation: ft-spin 0.6s linear infinite;
        vertical-align: middle;
      }
      @keyframes ft-spin { to { transform: rotate(360deg); } }

      .ft-error { color: var(--danger); font-size: 13px; }

      .ft-footer {
        padding: 7px 12px;
        border-top: 1px dashed var(--glass-border);
        display: flex; justify-content: space-between;
        font-size: 11px;
        color: var(--muted);
        font-family: ui-monospace, "SF Mono", Menlo, monospace;
      }
    </style>

    <div class="ft-popup">
      <div class="ft-hdr">
        <div class="ft-hdr-left">
          <div class="ft-hdr-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h10M8 4v2M5 6c0 5 3 8 7 8M13 6c-1 4-4 7-8 8"/>
              <path d="M13 21l4-10 4 10M14.5 17.5h5"/>
            </svg>
          </div>
          <span class="ft-hdr-label">EN → 中文</span>
          <span class="ft-pill" id="ft-pill-cached">cached</span>
        </div>
        <div class="ft-hdr-actions">
          <button class="ft-icon-btn" title="朗读原文" id="ft-speak">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 9h4l5-4v14l-5-4H4z"/>
              <path d="M17 8c1.5 1 2 2.5 2 4s-0.5 3-2 4"/>
            </svg>
          </button>
          <button class="ft-icon-btn" title="复制译文" id="ft-copy">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="11" height="11" rx="2"/>
              <path d="M5 15V5a2 2 0 012-2h10"/>
            </svg>
          </button>
          <button class="ft-icon-btn" title="固定弹窗" id="ft-pin">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 17v5M9 3h6l-1 6 3 3H7l3-3-1-6z"/>
            </svg>
          </button>
          <button class="ft-icon-btn" title="关闭" id="ft-close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 6l12 12M18 6L6 18"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="ft-body">
        <div class="ft-original"></div>
        <div class="ft-translation"><span class="ft-spinner"></span></div>
      </div>

      <div class="ft-footer">
        <span id="ft-model">Fuzzy Translate</span>
        <span id="ft-meta">·</span>
      </div>
    </div>
  `;

  const originalEl = shadowRoot.querySelector('.ft-original') as HTMLElement;
  originalEl.textContent = originalText.length > 120
    ? originalText.slice(0, 120) + '…'
    : originalText;

  const translationEl = shadowRoot.querySelector('.ft-translation') as HTMLElement;
  const closeBtn = shadowRoot.querySelector('#ft-close') as HTMLElement;
  const pinBtn = shadowRoot.querySelector('#ft-pin') as HTMLElement;
  const speakBtn = shadowRoot.querySelector('#ft-speak') as HTMLElement;
  const copyBtn = shadowRoot.querySelector('#ft-copy') as HTMLElement;
  const modelEl = shadowRoot.querySelector('#ft-model') as HTMLElement;
  const metaEl = shadowRoot.querySelector('#ft-meta') as HTMLElement;
  const cachedPill = shadowRoot.querySelector('#ft-pill-cached') as HTMLElement;
  const startTime = Date.now();
  let tokenCount = 0;
  let pinned = false;

  document.body.appendChild(popupHost);

  const closePopup = () => {
    removeSelectionPopup();
    onClose?.();
  };

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closePopup();
  });

  pinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    pinned = !pinned;
    pinBtn.classList.toggle('success', pinned);
    pinBtn.title = pinned ? '取消固定' : '固定弹窗';
  });

  speakBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(originalText);
      window.speechSynthesis.speak(utter);
    } catch { /* ignore */ }
  });

  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(translationEl.textContent || '');
      copyBtn.classList.add('success');
      setTimeout(() => copyBtn.classList.remove('success'), 1000);
    } catch { /* ignore */ }
  });

  currentCloseHandler = (e: MouseEvent) => {
    if (pinned) return;
    if (popupHost && !popupHost.contains(e.target as Node)) closePopup();
  };
  currentEscHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closePopup();
  };

  setTimeout(() => {
    document.addEventListener('mousedown', currentCloseHandler!);
    document.addEventListener('keydown', currentEscHandler!);
  }, 100);

  return {
    updateTranslation(chunk: string) {
      const spinner = translationEl.querySelector('.ft-spinner');
      if (spinner) spinner.remove();
      translationEl.appendChild(document.createTextNode(chunk));
      tokenCount += Math.max(1, Math.ceil(chunk.length / 3));
    },
    setComplete() {
      const elapsed = Date.now() - startTime;
      metaEl.textContent = tokenCount > 0 ? `${elapsed} ms · ${tokenCount} tok` : `${elapsed} ms`;
    },
    setError(msg: string) {
      translationEl.classList.add('ft-error');
      translationEl.textContent = `翻译失败: ${msg}`;
    },
    setCached() {
      cachedPill.classList.add('shown');
      const elapsed = Date.now() - startTime;
      metaEl.textContent = `${elapsed} ms`;
    },
    setModel(name: string) {
      modelEl.textContent = name || 'Fuzzy Translate';
    },
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
