import {
  getProviders, saveProviders, getActiveSelection, setActiveSelection,
  getPreferences, savePreferences
} from '../shared/config/storage';
import { DEFAULT_PROMPTS } from '../shared/config/defaults';
import { getThemeVars } from '../shared/config/theme-style';
import type { ProviderConfig, ModelItem, UserPreferences, ThemeMode, AccentHue, LanguagePair } from '../shared/types';

export class Options {
  private providerListEl: HTMLElement;
  private providerForm: HTMLElement;

  // Preferences
  private targetLangSelect: HTMLSelectElement;
  private cacheExpiryInput: HTMLInputElement;
  private maxConcurrencyInput: HTMLInputElement;
  private concurrencyValueSpan: HTMLSpanElement;
  private hoverKeySelect: HTMLSelectElement;
  private fabSizeSelect: HTMLSelectElement;
  private displayModeSelect: HTMLSelectElement;
  private systemPromptInput: HTMLTextAreaElement;
  private userPromptInput: HTMLTextAreaElement;
  private multiplePromptInput: HTMLTextAreaElement;
  private saveBtn: HTMLButtonElement;
  private saveResult: HTMLSpanElement;

  private providers: ProviderConfig[] = [];
  private activeProviderId = '';
  private activeModelId = '';

  // Theme state
  private themeMode: ThemeMode = 'light';
  private accentHue: AccentHue = 'aurora';

  constructor() {
    this.providerListEl = document.getElementById('providerList')!;
    this.providerForm = document.getElementById('providerForm')!;

    this.targetLangSelect = document.getElementById('targetLang') as HTMLSelectElement;
    this.cacheExpiryInput = document.getElementById('cacheExpiry') as HTMLInputElement;
    this.maxConcurrencyInput = document.getElementById('maxConcurrency') as HTMLInputElement;
    this.concurrencyValueSpan = document.getElementById('concurrencyValue') as HTMLSpanElement;
    this.hoverKeySelect = document.getElementById('hoverKey') as HTMLSelectElement;
    this.fabSizeSelect = document.getElementById('fabSize') as HTMLSelectElement;
    this.displayModeSelect = document.getElementById('displayMode') as HTMLSelectElement;
    this.systemPromptInput = document.getElementById('systemPrompt') as HTMLTextAreaElement;
    this.userPromptInput = document.getElementById('userPrompt') as HTMLTextAreaElement;
    this.multiplePromptInput = document.getElementById('multiplePrompt') as HTMLTextAreaElement;
    this.saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
    this.saveResult = document.getElementById('saveResult') as HTMLSpanElement;

    // Bind events
    document.getElementById('addProviderBtn')!.addEventListener('click', () => this.showProviderForm());
    document.getElementById('cancelProviderBtn')!.addEventListener('click', () => this.hideProviderForm());
    document.getElementById('saveProviderBtn')!.addEventListener('click', () => this.saveProvider());
    document.getElementById('testProviderBtn')!.addEventListener('click', () => this.testProvider());
    this.maxConcurrencyInput.addEventListener('input', () => {
      this.concurrencyValueSpan.textContent = this.maxConcurrencyInput.value;
    });
    this.saveBtn.addEventListener('click', () => this.saveSettings());
    document.getElementById('resetPrompts')!.addEventListener('click', () => {
      this.systemPromptInput.value = DEFAULT_PROMPTS.systemPrompt;
      this.userPromptInput.value = DEFAULT_PROMPTS.userPrompt;
      this.multiplePromptInput.value = DEFAULT_PROMPTS.multiplePrompt;
    });

    // Preview cards for displayMode
    document.querySelectorAll('.preview-card').forEach(card => {
      card.addEventListener('click', () => {
        const val = card.getAttribute('data-display') as 'bilingual' | 'replace';
        this.displayModeSelect.value = val;
        this.syncDisplayPreview();
      });
    });

    // Sync Kbd chip with hoverKey select
    this.hoverKeySelect.addEventListener('change', () => this.syncHoverKbd());

    // Theme toggle + accent swatches
    document.getElementById('themeToggle')?.addEventListener('click', () => this.toggleThemeMode());
    document.querySelectorAll('.side-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        const a = sw.getAttribute('data-accent') as AccentHue;
        this.setAccent(a);
      });
    });

    // Hover display preview cards
    document.querySelectorAll('[data-hoverdisp]').forEach(card => {
      card.addEventListener('click', () => this.setHoverDisplay(card.getAttribute('data-hoverdisp') as any));
    });

    // Translation position chips
    document.querySelectorAll('[data-position]').forEach(chip => {
      chip.addEventListener('click', () => this.setTranslationPosition(chip.getAttribute('data-position') as 'below' | 'above'));
    });

    // Provider preset chips
    document.querySelectorAll('.preset-chip').forEach(chip => {
      chip.addEventListener('click', () => this.applyProviderPreset(chip.getAttribute('data-preset') || ''));
    });

    // Bubble style + font scale
    document.querySelectorAll('.bubble-card').forEach(card => {
      card.addEventListener('click', () => this.setBubbleStyle(card.getAttribute('data-bubble') as any));
    });
    const fontInput = document.getElementById('fontScale') as HTMLInputElement | null;
    if (fontInput) {
      fontInput.addEventListener('input', () => this.setFontScale(parseFloat(fontInput.value)));
    }

    // Cache tab
    document.querySelectorAll('#expiryChips .chip-choice').forEach(chip => {
      chip.addEventListener('click', () => this.setCacheExpiry(parseInt(chip.getAttribute('data-hours') || '168')));
    });
    document.getElementById('cacheRefreshBtn')?.addEventListener('click', () => this.loadCacheStats());
    document.getElementById('cacheClearAllBtn')?.addEventListener('click', () => this.clearAllCache());

    // Sites tab
    document.getElementById('siteAddAlways')?.addEventListener('click', () => this.addSiteRule('always'));
    document.getElementById('siteAddNever')?.addEventListener('click', () => this.addSiteRule('never'));

    // Languages tab
    document.getElementById('langPairAddBtn')?.addEventListener('click', () => this.addLanguagePair());

    // Triggers tab — hover / selection toggles
    const hoverSw = document.getElementById('hoverModeSwitch');
    const selSw = document.getElementById('selectionModeSwitch');
    if (hoverSw) {
      hoverSw.addEventListener('click', () => this.toggleTriggerMode('hoverMode'));
      hoverSw.addEventListener('keydown', (e: any) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.toggleTriggerMode('hoverMode'); }
      });
    }
    if (selSw) {
      selSw.addEventListener('click', () => this.toggleTriggerMode('selectionMode'));
      selSw.addEventListener('keydown', (e: any) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.toggleTriggerMode('selectionMode'); }
      });
    }

    this.initTabRouter();

    this.loadAll();
  }

  /** Click-based tab router: only the matching section is visible at a time. */
  private initTabRouter() {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('main > section[id^="sec-"]'));
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.nav a'));

    const isValidId = (id: string) => sections.some(s => s.id === id);

    /** Switch active tab. `pushHistory` controls whether we add to history (for clicks). */
    const activate = (targetId: string, pushHistory = true) => {
      sections.forEach(s => s.classList.toggle('active', s.id === targetId));
      links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + targetId));
      const newHash = '#' + targetId;
      if (location.hash !== newHash) {
        if (pushHistory && history.pushState) history.pushState(null, '', newHash);
        else if (history.replaceState) history.replaceState(null, '', newHash);
      }
      const main = document.querySelector('main');
      if (main) main.scrollTop = 0;
      window.scrollTo({ top: 0 });
    };

    links.forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const href = a.getAttribute('href') || '';
        if (href.startsWith('#')) activate(href.slice(1), true);
      });
    });

    // Browser back/forward → keep tab in sync with the URL hash without pushing again
    window.addEventListener('popstate', () => {
      const id = (location.hash || '').replace('#', '');
      if (isValidId(id)) activate(id, false);
    });
    // Direct hash mutation (e.g. user edits the URL)
    window.addEventListener('hashchange', () => {
      const id = (location.hash || '').replace('#', '');
      if (isValidId(id)) activate(id, false);
    });

    const initial = (location.hash || '').replace('#', '');
    const valid = isValidId(initial) ? initial : (sections[0]?.id || '');
    if (valid) activate(valid, false); // initial mount: don't push to history
  }

  private async loadAll() {
    const [providers, selection, prefs] = await Promise.all([
      getProviders(), getActiveSelection(), getPreferences()
    ]);
    this.providers = providers;
    this.activeProviderId = selection.providerId;
    this.activeModelId = selection.modelId;
    this.renderProviders();

    this.targetLangSelect.value = prefs.targetLanguage;
    this.cacheExpiryInput.value = String(prefs.cacheExpiry);
    this.maxConcurrencyInput.value = String(prefs.maxConcurrency);
    this.concurrencyValueSpan.textContent = String(prefs.maxConcurrency);
    this.hoverKeySelect.value = prefs.hoverKey;
    this.fabSizeSelect.value = prefs.fabSize;
    // Theme state
    this.themeMode = prefs.themeMode || 'light';
    this.accentHue = prefs.accentHue || 'aurora';
    this.applyTheme();
    this.syncDisplayPreview();
    this.syncHoverKbd();
    this.syncExpiryChips();
    this.syncBubbleCards(prefs.bubbleStyle || 'bare');
    this.syncFontScale(prefs.fontScale || 1.0);
    this.syncHoverDisplay(prefs.hoverDisplay || 'inline');
    this.syncPositionChips(prefs.translationPosition || 'below');
    this.renderSiteRules(prefs.siteRules || {});
    this.renderLanguagePairs(prefs.languagePairs || [], prefs.activePairIndex || 0);
    this.syncTriggerSwitches(prefs.hoverMode !== false, prefs.selectionMode !== false);
    this.loadCacheStats();
    this.displayModeSelect.value = prefs.displayMode;
    this.systemPromptInput.value = prefs.prompts.systemPrompt;
    this.userPromptInput.value = prefs.prompts.userPrompt;
    this.multiplePromptInput.value = prefs.prompts.multiplePrompt;
  }

  // =============================================
  // Provider list rendering
  // =============================================

  private renderProviders() {
    this.providerListEl.innerHTML = '';
    if (this.providers.length === 0) {
      this.providerListEl.innerHTML = '<div style="color:#888;font-size:13px;padding:8px 0">暂无服务商配置，请点击下方添加</div>';
      return;
    }

    for (const p of this.providers) {
      const isActiveProvider = p.id === this.activeProviderId;
      const card = document.createElement('div');
      card.className = 'provider-card' + (isActiveProvider ? ' active' : '');

      // --- Header ---
      const header = document.createElement('div');
      header.className = 'provider-header';
      header.innerHTML = `
        <span class="provider-name">${esc(p.name)}</span>
        <span class="provider-endpoint">${esc(shortenUrl(p.endpoint))}</span>
        ${isActiveProvider ? '<span class="provider-badge">当前</span>' : ''}
        <span class="provider-actions">
          <button class="edit-btn small">编辑</button>
          <button class="del-btn small danger">删除</button>
        </span>
      `;
      header.querySelector('.edit-btn')!.addEventListener('click', (e) => { e.stopPropagation(); this.showProviderForm(p); });
      header.querySelector('.del-btn')!.addEventListener('click', (e) => { e.stopPropagation(); this.deleteProvider(p.id); });
      card.appendChild(header);

      // --- Body: model chips ---
      const body = document.createElement('div');
      body.className = 'provider-body';

      const modelList = document.createElement('div');
      modelList.className = 'model-list';

      for (const m of p.models) {
        const isActive = isActiveProvider && m.id === this.activeModelId;
        const chip = document.createElement('span');
        chip.className = 'model-chip' + (isActive ? ' active' : '');
        chip.innerHTML = `${esc(m.name)}<span class="del" title="删除模型">×</span>`;
        chip.addEventListener('click', (e) => {
          if ((e.target as HTMLElement).classList.contains('del')) return;
          this.selectModel(p.id, m.id);
        });
        chip.querySelector('.del')!.addEventListener('click', (e) => {
          e.stopPropagation();
          this.deleteModel(p.id, m.id);
        });
        modelList.appendChild(chip);
      }

      // Inline add model
      const addWrap = document.createElement('span');
      addWrap.className = 'add-model-inline';
      addWrap.innerHTML = `<input type="text" placeholder="模型名称" class="new-model-input"><button class="small">＋</button>`;
      const addInput = addWrap.querySelector('input') as HTMLInputElement;
      const addBtn = addWrap.querySelector('button')!;
      const doAdd = () => {
        const name = addInput.value.trim();
        if (name) { this.addModel(p.id, name); addInput.value = ''; }
      };
      addBtn.addEventListener('click', doAdd);
      addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
      modelList.appendChild(addWrap);

      body.appendChild(modelList);
      card.appendChild(body);
      this.providerListEl.appendChild(card);
    }
  }

  // =============================================
  // Provider CRUD
  // =============================================

  private showProviderForm(edit?: ProviderConfig) {
    this.providerForm.style.display = 'block';
    const title = document.getElementById('pfTitle')!;
    const idEl = document.getElementById('pfId') as HTMLInputElement;
    const nameEl = document.getElementById('pfName') as HTMLInputElement;
    const endpointEl = document.getElementById('pfEndpoint') as HTMLInputElement;
    const keyEl = document.getElementById('pfApiKey') as HTMLInputElement;
    const tempEl = document.getElementById('pfTemperature') as HTMLInputElement;

    if (edit) {
      title.textContent = '编辑服务商';
      idEl.value = edit.id;
      nameEl.value = edit.name;
      endpointEl.value = edit.endpoint;
      keyEl.value = edit.apiKey;
      tempEl.value = typeof edit.temperature === 'number' ? String(edit.temperature) : '';
    } else {
      title.textContent = '添加服务商';
      idEl.value = '';
      nameEl.value = '';
      endpointEl.value = '';
      keyEl.value = '';
      tempEl.value = '';
    }
    (document.getElementById('testProviderResult') as HTMLSpanElement).textContent = '';
    // Reset preset active state
    document.querySelectorAll('.preset-chip').forEach(c => c.classList.remove('active'));
  }

  private hideProviderForm() {
    this.providerForm.style.display = 'none';
  }

  /** Fill Provider form with sensible defaults for a known service. */
  private applyProviderPreset(preset: string) {
    const nameEl = document.getElementById('pfName') as HTMLInputElement;
    const endpointEl = document.getElementById('pfEndpoint') as HTMLInputElement;
    const tempEl = document.getElementById('pfTemperature') as HTMLInputElement;
    const presets: Record<string, { name: string; endpoint: string; temp?: string }> = {
      openai:   { name: 'OpenAI',       endpoint: 'https://api.openai.com/v1', temp: '0.2' },
      deepseek: { name: 'DeepSeek',     endpoint: 'https://api.deepseek.com/v1', temp: '0.2' },
      ollama:   { name: 'Ollama',       endpoint: 'http://localhost:11434/v1', temp: '0.2' },
      custom:   { name: '',             endpoint: '' },
    };
    const cfg = presets[preset];
    if (!cfg) return;
    if (!nameEl.value || nameEl.value !== cfg.name) nameEl.value = cfg.name;
    endpointEl.value = cfg.endpoint;
    if (cfg.temp && !tempEl.value) tempEl.value = cfg.temp;
    document.querySelectorAll('.preset-chip').forEach(c => {
      c.classList.toggle('active', c.getAttribute('data-preset') === preset);
    });
  }

  private async saveProvider() {
    const id = (document.getElementById('pfId') as HTMLInputElement).value;
    const name = (document.getElementById('pfName') as HTMLInputElement).value.trim();
    const endpoint = (document.getElementById('pfEndpoint') as HTMLInputElement).value.trim();
    const apiKey = (document.getElementById('pfApiKey') as HTMLInputElement).value.trim();
    const tempRaw = (document.getElementById('pfTemperature') as HTMLInputElement).value.trim();
    const temperature = tempRaw === '' ? undefined
      : Math.max(0, Math.min(2, parseFloat(tempRaw) || 0));

    if (!name || !endpoint || !apiKey) { alert('请填写所有字段'); return; }

    if (id) {
      // Update existing
      const p = this.providers.find(p => p.id === id);
      if (p) { p.name = name; p.endpoint = endpoint; p.apiKey = apiKey; p.temperature = temperature; }
    } else {
      // Add new
      const newProvider: ProviderConfig = {
        id: 'provider-' + Date.now(),
        name, endpoint, apiKey,
        models: [],
        temperature,
      };
      this.providers.push(newProvider);
      // If first provider, auto-activate
      if (this.providers.length === 1) {
        this.activeProviderId = newProvider.id;
        await setActiveSelection(newProvider.id, '');
      }
    }

    await saveProviders(this.providers);
    this.hideProviderForm();
    this.renderProviders();
  }

  private async deleteProvider(id: string) {
    const p = this.providers.find(x => x.id === id);
    if (!p) return;
    if (!confirm(`确定删除服务商「${p.name || '未命名'}」？此操作不可撤销。`)) return;

    const wasActive = this.activeProviderId === id;
    this.providers = this.providers.filter(x => x.id !== id);
    await saveProviders(this.providers);

    if (wasActive) {
      // Reassign to first remaining provider's first model, or clear entirely
      const next = this.providers[0];
      this.activeProviderId = next?.id || '';
      this.activeModelId = next?.models?.[0]?.id || '';
      await setActiveSelection(this.activeProviderId, this.activeModelId);
    }
    this.renderProviders();
  }

  private async testProvider() {
    const endpoint = (document.getElementById('pfEndpoint') as HTMLInputElement).value.trim();
    const apiKey = (document.getElementById('pfApiKey') as HTMLInputElement).value.trim();
    const resultEl = document.getElementById('testProviderResult') as HTMLSpanElement;
    const btn = document.getElementById('testProviderBtn') as HTMLButtonElement;

    if (!endpoint || !apiKey) { resultEl.textContent = '请填写 Endpoint 和 Key'; resultEl.className = 'error'; return; }

    btn.disabled = true;
    resultEl.textContent = '测试中...';
    resultEl.className = '';

    try {
      let url = endpoint.replace(/\/+$/, '');
      if (!url.endsWith('/models')) url += '/models';

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      if (res.ok) {
        resultEl.textContent = '✓ 连接成功';
        resultEl.className = 'success';
      } else {
        resultEl.textContent = `✗ ${res.status}: ${res.statusText}`;
        resultEl.className = 'error';
      }
    } catch (err) {
      resultEl.textContent = `✗ ${(err as Error).message}`;
      resultEl.className = 'error';
    } finally {
      btn.disabled = false;
    }
  }

  // =============================================
  // Model CRUD (within a provider)
  // =============================================

  private async addModel(providerId: string, modelName: string) {
    const p = this.providers.find(p => p.id === providerId);
    if (!p) return;
    const newModel: ModelItem = { id: 'model-' + Date.now(), name: modelName };
    p.models.push(newModel);
    await saveProviders(this.providers);
    // If no active model yet, auto-select this one
    if (!this.activeModelId || this.activeProviderId !== providerId) {
      this.activeProviderId = providerId;
      this.activeModelId = newModel.id;
      await setActiveSelection(providerId, newModel.id);
    }
    this.renderProviders();
  }

  private async deleteModel(providerId: string, modelId: string) {
    const p = this.providers.find(p => p.id === providerId);
    if (!p) return;
    const m = p.models.find(x => x.id === modelId);
    if (!m) return;
    if (!confirm(`确定删除模型「${m.name || '未命名'}」？`)) return;

    p.models = p.models.filter(x => x.id !== modelId);
    await saveProviders(this.providers);
    // If the deleted model was the active one (within the active provider),
    // fall back to the first remaining model on the same provider, or clear.
    if (this.activeProviderId === providerId && this.activeModelId === modelId) {
      this.activeModelId = p.models[0]?.id || '';
      await setActiveSelection(this.activeProviderId, this.activeModelId);
    }
    this.renderProviders();
  }

  private async selectModel(providerId: string, modelId: string) {
    this.activeProviderId = providerId;
    this.activeModelId = modelId;
    await setActiveSelection(providerId, modelId);
    this.renderProviders();
  }

  // =============================================
  // Preferences
  // =============================================

  private async saveSettings() {
    const currentPrefs = await getPreferences();

    // If the user changed the Display-tab target language dropdown, propagate it
    // to the currently active language pair so both views stay consistent.
    let languagePairs = currentPrefs.languagePairs;
    let activePairIndex = currentPrefs.activePairIndex;
    const dropdownTarget = this.targetLangSelect.value;
    if (Array.isArray(languagePairs) && languagePairs.length > 0) {
      const idx = Math.min(Math.max(0, activePairIndex), languagePairs.length - 1);
      if (languagePairs[idx].to !== dropdownTarget) {
        languagePairs = languagePairs.map((p, i) => i === idx ? { ...p, to: dropdownTarget } : p);
      }
    }

    const prefs: UserPreferences = {
      targetLanguage: dropdownTarget,
      cacheExpiry: Math.max(1, Math.min(8760, parseInt(this.cacheExpiryInput.value) || 168)),
      hoverMode: currentPrefs.hoverMode,
      selectionMode: currentPrefs.selectionMode,
      siteRules: currentPrefs.siteRules,
      themeMode: currentPrefs.themeMode,
      accentHue: currentPrefs.accentHue,
      bubbleStyle: currentPrefs.bubbleStyle,
      fontScale: currentPrefs.fontScale,
      hoverDisplay: currentPrefs.hoverDisplay,
      translationPosition: currentPrefs.translationPosition,
      languagePairs,
      activePairIndex,
      maxConcurrency: Math.max(1, Math.min(10, parseInt(this.maxConcurrencyInput.value) || 3)),
      prompts: {
        systemPrompt: this.systemPromptInput.value.trim() || DEFAULT_PROMPTS.systemPrompt,
        userPrompt: this.userPromptInput.value.trim() || DEFAULT_PROMPTS.userPrompt,
        multiplePrompt: this.multiplePromptInput.value.trim() || DEFAULT_PROMPTS.multiplePrompt,
      },
      hoverKey: this.hoverKeySelect.value || 'Control',
      fabSize: (this.fabSizeSelect.value as 'small' | 'medium' | 'large') || 'medium',
      displayMode: (this.displayModeSelect.value as 'bilingual' | 'replace') || 'bilingual',
    };

    try {
      await savePreferences(prefs);
      this.saveResult.textContent = '✓ 设置已保存';
      this.saveResult.className = 'success';
      setTimeout(() => { this.saveResult.textContent = ''; }, 3000);
    } catch (err) {
      this.saveResult.textContent = `✗ ${(err as Error).message}`;
      this.saveResult.className = 'error';
    }
  }

  /** Highlight the preview card matching displayMode select value */
  private syncDisplayPreview() {
    const val = this.displayModeSelect.value;
    document.querySelectorAll('.preview-card').forEach(card => {
      const match = card.getAttribute('data-display') === val;
      card.classList.toggle('active', match);
      const check = card.querySelector('.pv-check') as HTMLElement | null;
      if (check) check.style.display = match ? 'block' : 'none';
    });
  }

  /** Update Kbd chip text to match hoverKey select */
  private syncHoverKbd() {
    const kbd = document.getElementById('kbd-hover');
    if (!kbd) return;
    const val = this.hoverKeySelect.value;
    const label = val === 'Control' ? 'Ctrl' : val === 'Meta' ? '⌘' : val;
    kbd.textContent = label;
  }

  /** Apply theme CSS vars to document root + swatch active + toggle icon */
  private applyTheme() {
    const styleEl = document.getElementById('ft-theme-vars');
    if (styleEl) styleEl.textContent = `:root { ${getThemeVars(this.themeMode, this.accentHue)} }`;
    document.documentElement.dataset.ftTheme = this.themeMode;
    document.documentElement.dataset.ftAccent = this.accentHue;

    // Swap toggle icon
    const isDark = this.themeMode === 'dark';
    const iL = document.getElementById('themeIconLight');
    const iD = document.getElementById('themeIconDark');
    if (iL) iL.style.display = isDark ? 'block' : 'none';
    if (iD) iD.style.display = isDark ? 'none' : 'block';

    // Swatch active state
    document.querySelectorAll('.side-swatch').forEach(sw => {
      sw.classList.toggle('active', sw.getAttribute('data-accent') === this.accentHue);
    });
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

  // ==================== Cache tab ====================

  private async loadCacheStats() {
    chrome.runtime.sendMessage({ type: 'GET_CACHE_STATS' }, (response: any) => {
      if (!response?.stats) return;
      const { totalCount, totalBytes, bySite } = response.stats as { totalCount: number; totalBytes: number; bySite: { hostname: string; count: number; bytes: number; lastAccessed: number }[] };
      const sizeEl = document.getElementById('cache-size');
      const countEl = document.getElementById('cache-count');
      const sitesEl = document.getElementById('cache-sites');
      const hostCountEl = document.getElementById('cache-host-count');
      if (sizeEl) sizeEl.textContent = formatBytes(totalBytes);
      if (countEl) countEl.textContent = String(totalCount);
      if (sitesEl) sitesEl.textContent = String(bySite.length);
      if (hostCountEl) hostCountEl.textContent = bySite.length ? `${bySite.length} 个站点` : '';

      const table = document.getElementById('cacheSiteTable');
      if (!table) return;
      if (bySite.length === 0) {
        table.innerHTML = '<div class="empty-state">暂无缓存数据</div>';
        return;
      }
      table.innerHTML = '';
      for (const site of bySite) {
        const row = document.createElement('div');
        row.className = 'data-row';
        row.style.gridTemplateColumns = '1.4fr 0.8fr 0.8fr 1fr 36px';
        row.innerHTML = `
          <div class="data-host"><div class="data-host-dot"></div><span>${esc(site.hostname)}</span></div>
          <div class="data-muted">${formatBytes(site.bytes)}</div>
          <div class="data-muted">${site.count} 段</div>
          <div class="data-muted">${formatRelative(site.lastAccessed)}</div>
          <div class="data-actions"><button class="data-trash" title="清除此站点缓存">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>
            </svg>
          </button></div>
        `;
        row.querySelector('.data-trash')?.addEventListener('click', () => this.clearHostCache(site.hostname));
        table.appendChild(row);
      }
    });
  }

  private async setCacheExpiry(hours: number) {
    this.cacheExpiryInput.value = String(hours);
    await chrome.storage.sync.set({ cacheExpiry: hours });
    this.syncExpiryChips();
  }

  private syncExpiryChips() {
    const current = parseInt(this.cacheExpiryInput.value) || 168;
    document.querySelectorAll('#expiryChips .chip-choice').forEach(chip => {
      chip.classList.toggle('active', parseInt(chip.getAttribute('data-hours') || '0') === current);
    });
  }

  private async clearAllCache() {
    if (!confirm('确定要清空所有翻译缓存吗？此操作不可撤销。')) return;
    chrome.runtime.sendMessage({ type: 'CLEAR_ALL_CACHE' }, () => this.loadCacheStats());
  }

  private async clearHostCache(host: string) {
    chrome.runtime.sendMessage({ type: 'CLEAR_HOST_CACHE', host }, () => this.loadCacheStats());
  }

  // ==================== Sites tab ====================

  private async renderSiteRules(rules: Record<string, 'always' | 'never'>) {
    const table = document.getElementById('siteTable');
    if (!table) return;
    const entries = Object.entries(rules);
    if (entries.length === 0) {
      table.innerHTML = '<div class="empty-state">暂无规则，在下方添加</div>';
      return;
    }
    table.innerHTML = '';
    for (const [host, rule] of entries) {
      const row = document.createElement('div');
      row.className = 'data-row';
      row.style.gridTemplateColumns = '1.4fr auto 36px';
      row.innerHTML = `
        <div class="data-host"><div class="data-host-dot"></div><span>${esc(host)}</span></div>
        <span class="rule-pill ${rule === 'always' ? 'active-always' : 'active-never'}">${rule === 'always' ? '总是翻译' : '永不翻译'}</span>
        <div class="data-actions"><button class="data-trash" title="删除规则">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 6l12 12M18 6L6 18"/>
          </svg>
        </button></div>
      `;
      row.querySelector('.rule-pill')?.addEventListener('click', () => this.toggleSiteRule(host));
      row.querySelector('.data-trash')?.addEventListener('click', () => this.removeSiteRule(host));
      table.appendChild(row);
    }
  }

  private async addSiteRule(rule: 'always' | 'never') {
    const input = document.getElementById('siteAddInput') as HTMLInputElement;
    const host = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!host) return;
    const result = await chrome.storage.sync.get(['siteRules']);
    const rules = (result.siteRules as Record<string, 'always' | 'never'>) || {};
    rules[host] = rule;
    await chrome.storage.sync.set({ siteRules: rules });
    input.value = '';
    this.renderSiteRules(rules);
  }

  private async toggleSiteRule(host: string) {
    const result = await chrome.storage.sync.get(['siteRules']);
    const rules = (result.siteRules as Record<string, 'always' | 'never'>) || {};
    rules[host] = rules[host] === 'always' ? 'never' : 'always';
    await chrome.storage.sync.set({ siteRules: rules });
    this.renderSiteRules(rules);
  }

  // ==================== Bubble style + Font scale ====================

  private async setBubbleStyle(style: 'frosted' | 'rounded' | 'solid' | 'bare') {
    await chrome.storage.sync.set({ bubbleStyle: style });
    this.syncBubbleCards(style);
  }

  private syncBubbleCards(style: string) {
    document.querySelectorAll('.bubble-card').forEach(card => {
      card.classList.toggle('active', card.getAttribute('data-bubble') === style);
    });
  }

  private async setFontScale(scale: number) {
    await chrome.storage.sync.set({ fontScale: scale });
    this.syncFontScale(scale);
  }

  private async setHoverDisplay(mode: 'inline' | 'popover') {
    const hidden = document.getElementById('hoverDisplay') as HTMLSelectElement | null;
    if (hidden) hidden.value = mode;
    await chrome.storage.sync.set({ hoverDisplay: mode });
    this.syncHoverDisplay(mode);
  }

  private syncHoverDisplay(mode: string) {
    document.querySelectorAll('[data-hoverdisp]').forEach(card => {
      const match = card.getAttribute('data-hoverdisp') === mode;
      card.classList.toggle('active', match);
      const check = card.querySelector('.hd-check') as HTMLElement | null;
      if (check) check.style.display = match ? 'block' : 'none';
    });
  }

  private async setTranslationPosition(pos: 'below' | 'above') {
    await chrome.storage.sync.set({ translationPosition: pos });
    this.syncPositionChips(pos);
  }

  private syncPositionChips(pos: string) {
    document.querySelectorAll('[data-position]').forEach(chip => {
      chip.classList.toggle('active', chip.getAttribute('data-position') === pos);
    });
  }

  private syncFontScale(scale: number) {
    const input = document.getElementById('fontScale') as HTMLInputElement | null;
    const label = document.getElementById('fontScaleValue');
    const preview = document.getElementById('typePreview');
    if (input) input.value = String(scale);
    if (label) label.textContent = `${Math.round(scale * 100)}%`;
    if (preview) preview.style.fontSize = `${16 * scale}px`;
  }

  private async removeSiteRule(host: string) {
    const result = await chrome.storage.sync.get(['siteRules']);
    const rules = (result.siteRules as Record<string, 'always' | 'never'>) || {};
    delete rules[host];
    await chrome.storage.sync.set({ siteRules: rules });
    this.renderSiteRules(rules);
  }

  // ==================== Trigger toggles (hoverMode / selectionMode) ====================

  private syncTriggerSwitches(hoverOn: boolean, selOn: boolean) {
    const hoverSw = document.getElementById('hoverModeSwitch');
    const selSw = document.getElementById('selectionModeSwitch');
    const hoverCard = document.getElementById('trg-hover');
    const selCard = document.getElementById('trg-selection');
    if (hoverSw) {
      hoverSw.classList.toggle('on', hoverOn);
      hoverSw.setAttribute('aria-checked', String(hoverOn));
    }
    if (selSw) {
      selSw.classList.toggle('on', selOn);
      selSw.setAttribute('aria-checked', String(selOn));
    }
    hoverCard?.classList.toggle('on', hoverOn);
    selCard?.classList.toggle('on', selOn);
  }

  private async toggleTriggerMode(field: 'hoverMode' | 'selectionMode') {
    const prefs = await getPreferences();
    const newPrefs: UserPreferences = { ...prefs, [field]: !prefs[field] };
    await savePreferences(newPrefs);
    this.syncTriggerSwitches(newPrefs.hoverMode !== false, newPrefs.selectionMode !== false);
  }

  // ==================== Language pairs ====================

  private renderLanguagePairs(pairs: LanguagePair[], activeIdx: number) {
    const table = document.getElementById('langPairTable');
    if (!table) return;
    // Keep the Display-tab target dropdown in lock-step with the active pair's `to`
    const safeIdx = Math.min(Math.max(0, activeIdx), pairs.length - 1);
    const activePair = pairs[safeIdx];
    if (activePair && this.targetLangSelect.value !== activePair.to) {
      this.targetLangSelect.value = activePair.to;
    }
    if (!pairs || pairs.length === 0) {
      table.innerHTML = '<div class="empty-state">暂无语言对，请在下方添加</div>';
      return;
    }
    table.innerHTML = '';
    pairs.forEach((pair, idx) => {
      const isActive = idx === activeIdx;
      const row = document.createElement('div');
      row.className = 'data-row';
      row.style.gridTemplateColumns = '1fr auto auto 36px';
      row.style.cursor = 'pointer';
      if (isActive) row.classList.add('active');
      row.innerHTML = `
        <div class="data-host">
          <div class="data-host-dot" style="background: ${isActive ? 'var(--accent)' : 'var(--muted)'}"></div>
          <span><b>${esc(langLabel(pair.from))}</b> → <b>${esc(langLabel(pair.to))}</b></span>
        </div>
        <span class="rule-pill ${isActive ? 'active-always' : ''}">${isActive ? '当前' : '点击启用'}</span>
        <div></div>
        <div class="data-actions"><button class="data-trash" title="删除语言对">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 6l12 12M18 6L6 18"/>
          </svg>
        </button></div>
      `;
      // Click row to activate; click trash to remove
      row.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.data-trash')) return;
        this.activateLanguagePair(idx);
      });
      row.querySelector('.data-trash')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeLanguagePair(idx);
      });
      table.appendChild(row);
    });
  }

  private async addLanguagePair() {
    const fromSel = document.getElementById('langAddFrom') as HTMLSelectElement | null;
    const toSel = document.getElementById('langAddTo') as HTMLSelectElement | null;
    if (!fromSel || !toSel) return;
    const from = fromSel.value;
    const to = toSel.value;
    if (from === to) {
      alert('原文与译文不能相同');
      return;
    }
    const prefs = await getPreferences();
    const list = Array.isArray(prefs.languagePairs) ? [...prefs.languagePairs] : [];
    // Avoid duplicates
    if (list.some(p => p.from === from && p.to === to)) {
      alert('该语言对已存在');
      return;
    }
    list.push({ from, to });
    const newPrefs: UserPreferences = {
      ...prefs,
      languagePairs: list,
      activePairIndex: list.length - 1, // newly added becomes active
    };
    await savePreferences(newPrefs);
    this.renderLanguagePairs(list, newPrefs.activePairIndex);
  }

  private async activateLanguagePair(idx: number) {
    const prefs = await getPreferences();
    if (!prefs.languagePairs?.[idx]) return;
    const newPrefs: UserPreferences = { ...prefs, activePairIndex: idx };
    await savePreferences(newPrefs);
    this.renderLanguagePairs(prefs.languagePairs, idx);
  }

  private async removeLanguagePair(idx: number) {
    const prefs = await getPreferences();
    const list = Array.isArray(prefs.languagePairs) ? [...prefs.languagePairs] : [];
    if (list.length <= 1) {
      alert('至少保留一个语言对');
      return;
    }
    const removed = list[idx];
    if (!confirm(`确定删除「${langLabel(removed.from)} → ${langLabel(removed.to)}」？`)) return;
    list.splice(idx, 1);
    const newActive = prefs.activePairIndex >= list.length
      ? list.length - 1
      : (prefs.activePairIndex > idx ? prefs.activePairIndex - 1 : prefs.activePairIndex);
    const newPrefs: UserPreferences = {
      ...prefs,
      languagePairs: list,
      activePairIndex: Math.max(0, newActive),
    };
    await savePreferences(newPrefs);
    this.renderLanguagePairs(list, newPrefs.activePairIndex);
  }
}

// ==================== Small formatting helpers ====================

const LANG_NAMES: Record<string, string> = {
  'auto': '自动检测',
  'zh-CN': '简体中文',
  'zh-TW': '繁体中文',
  'en': 'English',
  'ja': '日本語',
  'ko': '한국어',
  'fr': 'Français',
  'de': 'Deutsch',
  'es': 'Español',
  'ru': 'Русский',
};

function langLabel(code: string): string {
  return LANG_NAMES[code] || code;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatRelative(ts: number): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} 天前`;
  return new Date(ts).toLocaleDateString();
}

// Helpers
function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function shortenUrl(url: string): string {
  try { return new URL(url).host; } catch { return url.slice(0, 30); }
}
