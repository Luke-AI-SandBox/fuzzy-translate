import { sendToActiveTab } from '../shared/messaging';
import type { Message } from '../shared/messaging';
import { getThemeVars } from '../shared/config/theme-style';
import type { ThemeMode, AccentHue } from '../shared/types';

export class Popup {
  private translateBtn: HTMLElement;
  private translateLabel: HTMLElement;
  private translateHint: HTMLElement;
  private translateSwitch: HTMLElement;
  private hoverRow: HTMLElement;
  private hoverSwitch: HTMLElement;
  private hoverDesc: HTMLElement;
  private selectionRow: HTMLElement;
  private selectionSwitch: HTMLElement;
  private optionsBtn: HTMLElement;
  private themeToggle: HTMLElement;
  private themeIconLight: HTMLElement;
  private themeIconDark: HTMLElement;
  private statusEl: HTMLElement;
  private connDot: HTMLElement;
  private connText: HTMLElement;
  private apiWarning: HTMLElement;
  private progressBar: HTMLElement;
  private progressFill: HTMLElement;
  private targetLangLabel: HTMLElement;
  private siteHost: HTMLElement;
  private siteAlways: HTMLElement;
  private siteNever: HTMLElement;
  private themeVarsStyle: HTMLStyleElement;

  private isTranslating = false;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private currentHost = '';
  private themeMode: ThemeMode = 'light';
  private accentHue: AccentHue = 'aurora';

  constructor() {
    this.translateBtn = document.getElementById('translateBtn')!;
    this.translateLabel = document.getElementById('translateLabel')!;
    this.translateHint = document.getElementById('translateHint')!;
    this.translateSwitch = document.getElementById('translateSwitch')!;
    this.hoverRow = document.getElementById('hoverRow')!;
    this.hoverSwitch = document.getElementById('hoverSwitch')!;
    this.hoverDesc = document.getElementById('hoverDesc')!;
    this.selectionRow = document.getElementById('selectionRow')!;
    this.selectionSwitch = document.getElementById('selectionSwitch')!;
    this.optionsBtn = document.getElementById('optionsBtn')!;
    this.themeToggle = document.getElementById('themeToggle')!;
    this.themeIconLight = document.getElementById('themeIconLight')!;
    this.themeIconDark = document.getElementById('themeIconDark')!;
    this.statusEl = document.getElementById('status')!;
    this.connDot = document.getElementById('connDot')!;
    this.connText = document.getElementById('connText')!;
    this.apiWarning = document.getElementById('apiWarning')!;
    this.progressBar = document.getElementById('progressBar')!;
    this.progressFill = document.getElementById('progressFill')!;
    this.targetLangLabel = document.getElementById('targetLangLabel')!;
    this.siteHost = document.getElementById('siteHost')!;
    this.siteAlways = document.getElementById('siteAlways')!;
    this.siteNever = document.getElementById('siteNever')!;
    this.themeVarsStyle = document.getElementById('ft-theme-vars') as HTMLStyleElement;

    this.translateBtn.addEventListener('click', () => this.toggleTranslation());
    this.hoverRow.addEventListener('click', () => this.toggleHoverMode());
    this.selectionRow.addEventListener('click', () => this.toggleSelectionMode());
    this.optionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
    this.themeToggle.addEventListener('click', () => this.toggleThemeMode());
    this.siteAlways.addEventListener('click', () => this.setSiteRule('always'));
    this.siteNever.addEventListener('click', () => this.setSiteRule('never'));
    document.getElementById('goSettings')?.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });

    // Accent swatches
    document.querySelectorAll('.swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        const accent = sw.getAttribute('data-accent') as AccentHue;
        this.setAccent(accent);
      });
    });

    this.init();
  }

  private async init() {
    await this.loadCurrentHost();
    await this.loadTheme();
    await this.checkApiConfig();
    await this.updatePrefs();
    await this.updateStatus();
    this.refreshTimer = setInterval(() => this.updateStatus(), 2000);
    window.addEventListener('unload', () => {
      if (this.refreshTimer !== null) clearInterval(this.refreshTimer);
    });
  }

  private async loadTheme() {
    const prefs = await chrome.storage.sync.get(['themeMode', 'accentHue']);
    this.themeMode = (prefs.themeMode as ThemeMode) || 'light';
    this.accentHue = (prefs.accentHue as AccentHue) || 'aurora';
    this.applyTheme();
  }

  private applyTheme() {
    // Inject CSS variables into the <style id="ft-theme-vars">
    this.themeVarsStyle.textContent = `:root { ${getThemeVars(this.themeMode, this.accentHue)} }`;
    // Swap theme toggle icons
    const isDark = this.themeMode === 'dark';
    this.themeIconLight.style.display = isDark ? 'block' : 'none';
    this.themeIconDark.style.display = isDark ? 'none' : 'block';
    // Update accent swatch active state
    document.querySelectorAll('.swatch').forEach(sw => {
      sw.classList.toggle('active', sw.getAttribute('data-accent') === this.accentHue);
    });
    // Also apply data attrs on root so other CSS could key off them
    document.documentElement.dataset.ftTheme = this.themeMode;
    document.documentElement.dataset.ftAccent = this.accentHue;
  }

  private async toggleThemeMode() {
    this.themeMode = this.themeMode === 'dark' ? 'light' : 'dark';
    this.applyTheme();
    await chrome.storage.sync.set({ themeMode: this.themeMode });
  }

  private async setAccent(accent: AccentHue) {
    this.accentHue = accent;
    this.applyTheme();
    await chrome.storage.sync.set({ accentHue: accent });
  }

  private async loadCurrentHost() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        const u = new URL(tab.url);
        this.currentHost = u.hostname;
        this.siteHost.textContent = u.hostname;
      } else {
        this.siteHost.textContent = '当前站点';
      }
    } catch {
      this.siteHost.textContent = '当前站点';
    }
  }

  private async checkApiConfig() {
    try {
      const result = await chrome.storage.local.get(['providers']);
      const providers = result.providers as any[] | undefined;
      const hasConfig = providers && providers.length > 0 &&
        providers.some((p: any) => p.endpoint && p.apiKey && p.models?.length > 0);

      if (hasConfig) {
        this.apiWarning.style.display = 'none';
        this.translateBtn.removeAttribute('disabled');
        this.connDot.classList.remove('warn');
        const active = providers!.find((p: any) => p.models?.length > 0);
        const modelName = active?.models?.[0]?.name || '已连接';
        this.connText.textContent = modelName;
      } else {
        this.apiWarning.style.display = 'flex';
        this.translateBtn.setAttribute('disabled', 'true');
        this.connDot.classList.add('warn');
        this.connText.textContent = '未配置';
      }
    } catch { /* ignore */ }
  }

  private async updatePrefs() {
    try {
      const prefs = await chrome.storage.sync.get([
        'targetLanguage', 'hoverMode', 'hoverKey', 'selectionMode', 'siteRules',
        'languagePairs', 'activePairIndex',
      ]);

      const names: Record<string, string> = {
        'auto': '自动检测',
        'zh-CN': '中文（简体）', 'zh-TW': '中文（繁体）', 'en': 'English',
        'ja': '日本語', 'ko': '한국어', 'fr': 'Français',
        'de': 'Deutsch', 'es': 'Español', 'ru': 'Русский',
      };

      // Resolve the active language pair (with legacy fallback)
      const list = Array.isArray(prefs.languagePairs) ? (prefs.languagePairs as { from: string; to: string }[]) : [];
      const activeIdx = typeof prefs.activePairIndex === 'number' ? prefs.activePairIndex : 0;
      const fallbackTo = (prefs.targetLanguage as string) || 'zh-CN';
      const pair = list.length > 0
        ? list[Math.min(Math.max(0, activeIdx), list.length - 1)]
        : { from: 'auto', to: fallbackTo };

      const fromLabel = names[pair.from] || pair.from;
      const toLabel = names[pair.to] || pair.to;
      this.targetLangLabel.textContent = toLabel;
      this.translateHint.textContent = `${fromLabel} → ${toLabel}`;
      const sourceEl = document.getElementById('sourceLangLabel');
      if (sourceEl) sourceEl.textContent = fromLabel;

      const hoverOn = (prefs.hoverMode as boolean) ?? true;
      const key = (prefs.hoverKey as string) || 'Control';
      const keyLabel = key === 'Control' ? 'Ctrl' : key === 'Meta' ? '⌘' : key;
      this.hoverDesc.textContent = `按住 ${keyLabel} 并悬停段落`;
      this.setSwitch(this.hoverSwitch, hoverOn);
      this.hoverRow.classList.toggle('on', hoverOn);

      const selOn = (prefs.selectionMode as boolean) ?? true;
      this.setSwitch(this.selectionSwitch, selOn);
      this.selectionRow.classList.toggle('on', selOn);

      const rules = (prefs.siteRules as Record<string, 'always' | 'never'>) || {};
      const rule = rules[this.currentHost];
      this.siteAlways.classList.toggle('active', rule === 'always');
      this.siteNever.classList.toggle('active', rule === 'never');
    } catch { /* ignore */ }
  }

  private setSwitch(el: HTMLElement, on: boolean) {
    el.classList.toggle('on', on);
  }

  private async toggleTranslation() {
    if (this.translateBtn.hasAttribute('disabled')) return;
    this.isTranslating = !this.isTranslating;
    this.applyTranslateUI();
    const msg: Message = { type: this.isTranslating ? 'TRANSLATE_PAGE' : 'CANCEL_TRANSLATION' };
    await sendToActiveTab(msg);
    await this.updateStatus();
  }

  private async toggleHoverMode() {
    const response = await sendToActiveTab({ type: 'TOGGLE_HOVER_MODE' });
    if (response && typeof response.hoverEnabled === 'boolean') {
      this.setSwitch(this.hoverSwitch, response.hoverEnabled);
      this.hoverRow.classList.toggle('on', response.hoverEnabled);
      await chrome.storage.sync.set({ hoverMode: response.hoverEnabled });
    }
  }

  private async toggleSelectionMode() {
    const prefs = await chrome.storage.sync.get(['selectionMode']);
    const newVal = !((prefs.selectionMode as boolean) ?? true);
    await chrome.storage.sync.set({ selectionMode: newVal });
    this.setSwitch(this.selectionSwitch, newVal);
    this.selectionRow.classList.toggle('on', newVal);
  }

  private async setSiteRule(rule: 'always' | 'never') {
    if (!this.currentHost) return;
    const result = await chrome.storage.sync.get(['siteRules']);
    const rules = (result.siteRules as Record<string, 'always' | 'never'>) || {};
    if (rules[this.currentHost] === rule) {
      delete rules[this.currentHost];
    } else {
      rules[this.currentHost] = rule;
    }
    await chrome.storage.sync.set({ siteRules: rules });
    const current = rules[this.currentHost];
    this.siteAlways.classList.toggle('active', current === 'always');
    this.siteNever.classList.toggle('active', current === 'never');
  }

  private applyTranslateUI() {
    this.setSwitch(this.translateSwitch, this.isTranslating);
    this.translateBtn.classList.toggle('active', this.isTranslating);
    this.translateLabel.textContent = this.isTranslating ? '正在翻译此页' : '翻译此页';
  }

  private async updateStatus() {
    try {
      const response = await sendToActiveTab({ type: 'GET_PAGE_STATUS' });
      if (!response) { this.statusEl.textContent = '等待页面加载'; return; }
      const { translated, total, mode } = response as { translated: number; total: number; mode?: string };
      const active = mode === 'full-page';
      this.isTranslating = active;
      this.applyTranslateUI();

      if (total > 0) {
        this.progressBar.style.display = 'block';
        const pct = Math.round((translated / total) * 100);
        this.progressFill.style.width = `${pct}%`;
        this.statusEl.textContent = active ? `${translated} / ${total} 段` : `已翻译 ${translated} 段`;
      } else {
        this.progressBar.style.display = 'none';
        this.statusEl.textContent = '就绪';
      }
    } catch {
      this.statusEl.textContent = '等待页面加载';
    }
  }
}
