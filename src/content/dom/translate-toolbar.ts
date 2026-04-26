/**
 * Floating bottom-center translate toolbar (Lucent glass).
 * Shows progress + action buttons while full-page translation is active.
 */
import { shadowThemeStyle } from '../theme-sync';

let toolbarHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let progressFill: HTMLElement | null = null;
let statusLabel: HTMLElement | null = null;

interface ToolbarCallbacks {
  onRetry?: () => void;
  onSettings?: () => void;
  onStop?: () => void;
}

export function showTranslateToolbar(callbacks: ToolbarCallbacks = {}): void {
  if (toolbarHost) return; // Already shown

  toolbarHost = document.createElement('div');
  toolbarHost.id = 'ft-translate-toolbar-host';
  toolbarHost.style.cssText = 'all:initial; position:fixed; bottom:22px; left:50%; transform:translateX(-50%); z-index:2147483646;';

  shadowRoot = toolbarHost.attachShadow({ mode: 'open' });
  shadowRoot.innerHTML = `
    <style>
      ${shadowThemeStyle()}
      :host { all: initial; }
      .tb {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 10px 14px;
        background: var(--glass-bg);
        backdrop-filter: blur(24px) saturate(160%);
        -webkit-backdrop-filter: blur(24px) saturate(160%);
        border: 1px solid var(--glass-border);
        border-radius: 14px;
        box-shadow: 0 16px 40px -12px rgba(20,20,40,0.28), inset 0 1px 0 var(--glass-inner-hl);
        color: var(--fg);
        font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        animation: tb-in 0.22s ease-out;
      }
      @keyframes tb-in {
        from { opacity: 0; transform: translateY(6px) scale(0.98); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }

      .brand-icon {
        width: 28px; height: 28px; border-radius: 8px;
        background: var(--accent-grad);
        color: #fff;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 3px 10px -3px var(--accent);
        flex-shrink: 0;
      }
      .brand-icon svg { width: 14px; height: 14px; }

      .col { display: flex; flex-direction: column; min-width: 190px; }
      .col-label { font-size: 12px; font-weight: 500; color: var(--fg); }

      .progress {
        margin-top: 5px; height: 3px; border-radius: 2px;
        background: var(--rule); overflow: hidden;
      }
      .progress-fill {
        height: 100%; width: 0%;
        background: var(--accent-grad);
        transition: width 0.4s;
      }

      .divider { width: 1px; height: 24px; background: var(--glass-border); margin: 0 2px; }

      .btn {
        display: flex; align-items: center; gap: 5px;
        padding: 5px 9px; border-radius: 7px;
        background: transparent; border: none; cursor: pointer;
        color: var(--muted); font-size: 11.5px; font-weight: 500;
        font-family: inherit;
        transition: background 0.15s, color 0.15s;
      }
      .btn:hover { background: var(--surface-soft); color: var(--fg); }
      .btn svg { width: 13px; height: 13px; }
    </style>

    <div class="tb">
      <div class="brand-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h10M8 4v2M5 6c0 5 3 8 7 8M13 6c-1 4-4 7-8 8"/>
          <path d="M13 21l4-10 4 10M14.5 17.5h5"/>
        </svg>
      </div>

      <div class="col">
        <div class="col-label" id="status-label">正在翻译此页…</div>
        <div class="progress"><div class="progress-fill" id="progress-fill"></div></div>
      </div>

      <div class="divider"></div>

      <button class="btn" id="btn-retry" title="重新翻译">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 12a8 8 0 0114-5l2 2M20 4v4h-4M20 12a8 8 0 01-14 5l-2-2M4 20v-4h4"/>
        </svg>
        重试
      </button>
      <button class="btn" id="btn-settings" title="设置">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>
        </svg>
        设置
      </button>
      <button class="btn" id="btn-stop" title="停止翻译">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 6l12 12M18 6L6 18"/>
        </svg>
        停止
      </button>
    </div>
  `;

  document.body.appendChild(toolbarHost);

  progressFill = shadowRoot.querySelector('#progress-fill');
  statusLabel = shadowRoot.querySelector('#status-label');

  shadowRoot.querySelector('#btn-retry')?.addEventListener('click', () => callbacks.onRetry?.());
  shadowRoot.querySelector('#btn-settings')?.addEventListener('click', () => callbacks.onSettings?.());
  shadowRoot.querySelector('#btn-stop')?.addEventListener('click', () => callbacks.onStop?.());
}

export function updateToolbarProgress(translated: number, total: number): void {
  if (!progressFill || !statusLabel) return;
  const pct = total > 0 ? Math.min(100, Math.round((translated / total) * 100)) : 0;
  progressFill.style.width = `${pct}%`;
  if (translated >= total && total > 0) {
    statusLabel.textContent = `翻译完成 · ${translated} / ${total} 段`;
  } else {
    statusLabel.textContent = `正在翻译 · ${translated} / ${total} 段`;
  }
}

export function hideTranslateToolbar(): void {
  if (toolbarHost) {
    toolbarHost.remove();
    toolbarHost = null;
    shadowRoot = null;
    progressFill = null;
    statusLabel = null;
  }
}

export function isToolbarVisible(): boolean {
  return toolbarHost !== null;
}
