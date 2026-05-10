/**
 * Hover translation popover (Lucent glass).
 * Shows a translucent 420px card anchored near the hovered paragraph.
 * Header: hover icon + label + streaming pill + pin/close buttons.
 * Body: faded original (masked) + accent translation.
 * Footer: "按住 {key} 保持打开" + token count.
 */
import { shadowThemeStyle } from '../theme-sync';

const POPOVER_WIDTH = 420;

interface PopoverHandle {
  updateTranslation: (chunk: string) => void;
  setComplete: () => void;
  setError: (msg: string) => void;
  setCached: () => void;
  close: () => void;
}

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let pinned = false;
let escHandler: ((e: KeyboardEvent) => void) | null = null;
let outsideHandler: ((e: MouseEvent) => void) | null = null;

export function showHoverPopover(
  rect: DOMRect,
  originalText: string,
  holdKeyLabel: string,
  onClose?: () => void,
): PopoverHandle {
  removeHoverPopover();

  host = document.createElement('div');
  host.id = 'ft-hover-popover-host';
  host.style.cssText = 'all:initial; position:absolute; z-index:2147483645;';

  // Anchor below the element by default; flip if it would overflow bottom
  const top = rect.bottom + window.scrollY + 8;
  let left = rect.left + window.scrollX;
  if (left + POPOVER_WIDTH > window.innerWidth + window.scrollX - 16) {
    left = window.innerWidth + window.scrollX - POPOVER_WIDTH - 16;
  }
  let top2 = top;
  if (top + 260 > window.innerHeight + window.scrollY) {
    top2 = rect.top + window.scrollY - 260;
  }
  host.style.left = `${Math.max(8, left)}px`;
  host.style.top = `${Math.max(8, top2)}px`;

  shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      ${shadowThemeStyle()}
      :host { all: initial; }
      .pv {
        width: ${POPOVER_WIDTH}px;
        background: #ffffff;
        border: 1px solid rgba(0,0,0,0.12);
        border-radius: 14px;
        box-shadow: 0 8px 24px -8px rgba(0,0,0,0.12), 0 2px 6px -2px rgba(0,0,0,0.06);
        color: #1a1a2e;
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        overflow: hidden;
        animation: pv-in 0.18s ease-out;
      }
      :host-context([data-ft-theme="dark"]) .pv {
        background: #1e1e2e;
        border-color: rgba(255,255,255,0.12);
        color: #e0e0f0;
      }
      @keyframes pv-in {
        from { opacity: 0; transform: translateY(4px) scale(0.98); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .hdr {
        display: flex; align-items: center; justify-content: space-between;
        gap: 8px; padding: 10px 12px;
        border-bottom: 1px solid var(--glass-border);
      }
      .hdr-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .hdr-icon {
        width: 22px; height: 22px; border-radius: 6px;
        background: var(--accent-soft); color: var(--accent-fg);
        display: flex; align-items: center; justify-content: center;
      }
      .hdr-icon svg { width: 12px; height: 12px; }
      .hdr-label { font-size: 11px; font-weight: 500; color: var(--muted); }
      .pill-streaming {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 2px 8px; border-radius: 999px;
        font-size: 10px; font-weight: 500;
        background: var(--accent-soft); color: var(--accent-fg);
      }
      .pill-streaming.hidden { display: none; }
      .blink-dot {
        display: inline-block; width: 5px; height: 5px; border-radius: 50%;
        background: var(--accent-fg);
        animation: pv-blink 1s infinite;
      }
      @keyframes pv-blink { 50% { opacity: 0.25; } }
      .pill-cached {
        display: none;
        align-items: center;
        padding: 2px 8px; border-radius: 999px;
        font-size: 10px; font-weight: 500;
        background: var(--accent-soft); color: var(--accent-fg);
      }
      .pill-cached.shown { display: inline-flex; }

      .hdr-actions { display: flex; gap: 2px; }
      .ibtn {
        width: 24px; height: 24px; border-radius: 6px;
        background: transparent; border: none; cursor: pointer; padding: 0;
        display: flex; align-items: center; justify-content: center;
        color: var(--muted);
        transition: background 0.15s, color 0.15s;
      }
      .ibtn:hover { background: var(--surface-soft); color: var(--fg); }
      .ibtn.active { color: var(--accent-fg); }
      .ibtn svg { width: 13px; height: 13px; }

      .body { padding: 12px 16px; }
      .orig {
        font-family: "Iowan Old Style", "Hoefler Text", Georgia, serif;
        font-size: 13px; color: var(--muted); line-height: 1.55;
        margin-bottom: 10px;
        max-height: 80px; overflow: hidden;
      }
      .tr {
        font-family: "Iowan Old Style", "Hoefler Text", Georgia, serif;
        font-size: 15px; color: var(--translated-fg); line-height: 1.6;
        min-height: 20px;
      }
      .tr.streaming::after {
        content: '▍';
        display: inline-block; margin-left: 2px;
        color: var(--accent-fg); opacity: 0.5;
        animation: pv-cursor 1s ease-in-out infinite;
      }
      @keyframes pv-cursor { 50% { opacity: 0.1; } }

      .ft-spinner {
        display: inline-block; width: 14px; height: 14px;
        border: 2px solid var(--glass-border); border-top-color: var(--accent);
        border-radius: 50%; animation: ft-spin 0.6s linear infinite;
        vertical-align: middle;
      }
      @keyframes ft-spin { to { transform: rotate(360deg); } }

      .error { color: var(--danger); font-size: 13px; }

      .footer {
        padding: 8px 12px;
        border-top: 1px solid var(--glass-border);
        font-size: 11px; color: var(--muted);
        display: flex; justify-content: space-between; align-items: center;
      }
      .footer span { display: inline-flex; align-items: center; }
      .kbd {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 18px; height: 18px; padding: 0 5px; margin: 0 3px;
        border-radius: 4px;
        font-size: 10px; font-weight: 500; font-family: ui-monospace, Menlo, monospace;
        background: var(--glass-bg-solid);
        border: 1px solid var(--glass-border);
        color: var(--fg);
      }
      .tok { font-family: ui-monospace, Menlo, monospace; }
    </style>

    <div class="pv">
      <div class="hdr">
        <div class="hdr-left">
          <div class="hdr-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 4l7 16 2-7 7-2z"/>
            </svg>
          </div>
          <span class="hdr-label">悬浮翻译</span>
          <span class="pill-streaming" id="pill-streaming"><span class="blink-dot"></span>翻译中</span>
          <span class="pill-cached" id="pill-cached">cached</span>
        </div>
        <div class="hdr-actions">
          <button class="ibtn" title="固定" id="btn-pin">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 17v5M9 3h6l-1 6 3 3H7l3-3-1-6z"/>
            </svg>
          </button>
          <button class="ibtn" title="关闭" id="btn-close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 6l12 12M18 6L6 18"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="body">
        <div class="orig"></div>
        <div class="tr streaming"><span class="ft-spinner"></span></div>
      </div>
      <div class="footer">
        <span>按住 <span class="kbd" id="kbd-key">${holdKeyLabel}</span> 保持打开</span>
        <span class="tok" id="meta">·</span>
      </div>
    </div>
  `;

  const origEl = shadow.querySelector('.orig') as HTMLElement;
  const trEl = shadow.querySelector('.tr') as HTMLElement;
  const pillStreaming = shadow.querySelector('#pill-streaming') as HTMLElement;
  const pillCached = shadow.querySelector('#pill-cached') as HTMLElement;
  const pinBtn = shadow.querySelector('#btn-pin') as HTMLElement;
  const closeBtn = shadow.querySelector('#btn-close') as HTMLElement;
  const metaEl = shadow.querySelector('#meta') as HTMLElement;
  const startTime = Date.now();
  let tokenCount = 0;

  origEl.textContent = originalText.length > 200 ? originalText.slice(0, 200) + '…' : originalText;

  document.body.appendChild(host);

  const close = () => {
    removeHoverPopover();
    onClose?.();
  };

  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); close(); });
  pinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    pinned = !pinned;
    pinBtn.classList.toggle('active', pinned);
  });

  escHandler = (e) => { if (e.key === 'Escape') close(); };
  outsideHandler = (e) => {
    if (pinned) return;
    if (host && !host.contains(e.target as Node)) close();
  };
  setTimeout(() => {
    document.addEventListener('keydown', escHandler!);
    document.addEventListener('mousedown', outsideHandler!);
  }, 120);

  return {
    updateTranslation(chunk: string) {
      // Remove spinner on first chunk
      const spinner = trEl.querySelector('.ft-spinner');
      if (spinner) spinner.remove();
      trEl.appendChild(document.createTextNode(chunk));
      tokenCount += Math.max(1, Math.ceil(chunk.length / 3));
    },
    setComplete() {
      trEl.classList.remove('streaming');
      pillStreaming.classList.add('hidden');
      // Ensure spinner is gone
      const spinner = trEl.querySelector('.ft-spinner');
      if (spinner) spinner.remove();
      const elapsed = Date.now() - startTime;
      metaEl.textContent = `${elapsed} ms · ${tokenCount} tok`;
    },
    setError(msg) {
      trEl.classList.remove('streaming');
      pillStreaming.classList.add('hidden');
      trEl.classList.add('error');
      trEl.innerHTML = '';
      trEl.textContent = `翻译失败: ${msg}`;
    },
    setCached() {
      trEl.classList.remove('streaming');
      pillStreaming.classList.add('hidden');
      pillCached.classList.add('shown');
      // Ensure spinner is gone
      const spinner = trEl.querySelector('.ft-spinner');
      if (spinner) spinner.remove();
      const elapsed = Date.now() - startTime;
      metaEl.textContent = `${elapsed} ms`;
    },
    close,
  };
}

export function removeHoverPopover() {
  if (escHandler) { document.removeEventListener('keydown', escHandler); escHandler = null; }
  if (outsideHandler) { document.removeEventListener('mousedown', outsideHandler); outsideHandler = null; }
  if (host) { host.remove(); host = null; shadow = null; }
  pinned = false;
}

export function isHoverPopoverVisible() { return host !== null; }
