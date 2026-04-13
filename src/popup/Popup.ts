import { sendToActiveTab } from '../shared/messaging';
import type { Message } from '../shared/messaging';

export class Popup {
  private translateBtn: HTMLButtonElement;
  private hoverToggle: HTMLButtonElement;
  private optionsBtn: HTMLButtonElement;
  private statusEl: HTMLElement;
  private apiWarning: HTMLElement;
  private progressBar: HTMLElement;
  private progressFill: HTMLElement;
  private isTranslating = false;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.translateBtn = document.getElementById('translateBtn') as HTMLButtonElement;
    this.hoverToggle = document.getElementById('hoverToggle') as HTMLButtonElement;
    this.optionsBtn = document.getElementById('optionsBtn') as HTMLButtonElement;
    this.statusEl = document.getElementById('status') as HTMLElement;
    this.apiWarning = document.getElementById('apiWarning') as HTMLElement;
    this.progressBar = document.getElementById('progressBar') as HTMLElement;
    this.progressFill = document.getElementById('progressFill') as HTMLElement;

    this.translateBtn.addEventListener('click', () => this.toggleTranslation());
    this.hoverToggle.addEventListener('click', () => this.toggleHoverMode());
    this.optionsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    const goSettings = document.getElementById('goSettings');
    if (goSettings) {
      goSettings.addEventListener('click', (e) => {
        e.preventDefault();
        chrome.runtime.openOptionsPage();
      });
    }

    this.init();
  }

  private async init() {
    await this.checkApiConfig();
    await this.updateHoverState();
    await this.updateStatus();
    this.refreshTimer = setInterval(() => this.updateStatus(), 2000);

    window.addEventListener('unload', () => {
      if (this.refreshTimer !== null) {
        clearInterval(this.refreshTimer);
      }
    });
  }

  private async checkApiConfig() {
    try {
      const result = await chrome.storage.local.get(['providers']);
      const providers = result.providers as any[] | undefined;
      const hasConfig = providers && providers.length > 0 &&
        providers.some((p: any) => p.endpoint && p.apiKey && p.models?.length > 0);
      this.apiWarning.style.display = hasConfig ? 'none' : 'block';
      this.translateBtn.disabled = !hasConfig;
    } catch {
      // Storage unavailable — leave warning hidden
    }
  }

  private async toggleTranslation() {
    this.isTranslating = !this.isTranslating;
    this.translateBtn.textContent = this.isTranslating ? '停止翻译' : '翻译此页';
    const msg: Message = { type: this.isTranslating ? 'TRANSLATE_PAGE' : 'CANCEL_TRANSLATION' };
    await sendToActiveTab(msg);
    await this.updateStatus();
  }

  private async updateHoverState() {
    try {
      const prefs = await chrome.storage.sync.get(['hoverMode']);
      const enabled = prefs.hoverMode ?? true; // default: on
      this.hoverToggle.textContent = enabled ? '悬浮翻译：开启' : '悬浮翻译：关闭';
    } catch {
      // ignore
    }
  }

  private async toggleHoverMode() {
    const response = await sendToActiveTab({ type: 'TOGGLE_HOVER_MODE' });
    if (response && typeof response.hoverEnabled === 'boolean') {
      this.hoverToggle.textContent = response.hoverEnabled ? '悬浮翻译：开启' : '悬浮翻译：关闭';
      // Persist the state
      await chrome.storage.sync.set({ hoverMode: response.hoverEnabled });
    }
  }

  private async updateStatus() {
    try {
      const response = await sendToActiveTab({ type: 'GET_PAGE_STATUS' });
      if (response) {
        const { translated, total, isTranslating } = response as {
          translated: number;
          total: number;
          isTranslating?: boolean;
        };

        this.statusEl.textContent = `已翻译: ${translated}/${total}`;

        if (total > 0) {
          this.progressBar.style.display = 'block';
          const pct = Math.round((translated / total) * 100);
          this.progressFill.style.width = `${pct}%`;
        } else {
          this.progressBar.style.display = 'none';
        }

        if (typeof isTranslating === 'boolean') {
          this.isTranslating = isTranslating;
        }

        if (translated > 0 && translated === total) {
          this.translateBtn.textContent = '已翻译';
        } else if (this.isTranslating) {
          this.translateBtn.textContent = '停止翻译';
        } else {
          this.translateBtn.textContent = '翻译此页';
        }
      }
    } catch {
      this.statusEl.textContent = '等待页面加载...';
    }
  }
}
