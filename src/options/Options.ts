import {
  getProviders, saveProviders, getActiveSelection, setActiveSelection,
  getPreferences, savePreferences
} from '../shared/config/storage';
import { DEFAULT_PROMPTS } from '../shared/config/defaults';
import type { ProviderConfig, ModelItem, UserPreferences } from '../shared/types';

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
  private systemPromptInput: HTMLTextAreaElement;
  private userPromptInput: HTMLTextAreaElement;
  private multiplePromptInput: HTMLTextAreaElement;
  private saveBtn: HTMLButtonElement;
  private saveResult: HTMLSpanElement;

  private providers: ProviderConfig[] = [];
  private activeProviderId = '';
  private activeModelId = '';

  constructor() {
    this.providerListEl = document.getElementById('providerList')!;
    this.providerForm = document.getElementById('providerForm')!;

    this.targetLangSelect = document.getElementById('targetLang') as HTMLSelectElement;
    this.cacheExpiryInput = document.getElementById('cacheExpiry') as HTMLInputElement;
    this.maxConcurrencyInput = document.getElementById('maxConcurrency') as HTMLInputElement;
    this.concurrencyValueSpan = document.getElementById('concurrencyValue') as HTMLSpanElement;
    this.hoverKeySelect = document.getElementById('hoverKey') as HTMLSelectElement;
    this.fabSizeSelect = document.getElementById('fabSize') as HTMLSelectElement;
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

    this.loadAll();
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

    if (edit) {
      title.textContent = '编辑服务商';
      idEl.value = edit.id;
      nameEl.value = edit.name;
      endpointEl.value = edit.endpoint;
      keyEl.value = edit.apiKey;
    } else {
      title.textContent = '添加服务商';
      idEl.value = '';
      nameEl.value = '';
      endpointEl.value = '';
      keyEl.value = '';
    }
    (document.getElementById('testProviderResult') as HTMLSpanElement).textContent = '';
  }

  private hideProviderForm() {
    this.providerForm.style.display = 'none';
  }

  private async saveProvider() {
    const id = (document.getElementById('pfId') as HTMLInputElement).value;
    const name = (document.getElementById('pfName') as HTMLInputElement).value.trim();
    const endpoint = (document.getElementById('pfEndpoint') as HTMLInputElement).value.trim();
    const apiKey = (document.getElementById('pfApiKey') as HTMLInputElement).value.trim();

    if (!name || !endpoint || !apiKey) { alert('请填写所有字段'); return; }

    if (id) {
      // Update existing
      const p = this.providers.find(p => p.id === id);
      if (p) { p.name = name; p.endpoint = endpoint; p.apiKey = apiKey; }
    } else {
      // Add new
      const newProvider: ProviderConfig = {
        id: 'provider-' + Date.now(),
        name, endpoint, apiKey,
        models: [],
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
    if (this.providers.length <= 1) { alert('至少保留一个服务商'); return; }
    this.providers = this.providers.filter(p => p.id !== id);
    await saveProviders(this.providers);
    if (this.activeProviderId === id && this.providers.length > 0) {
      const first = this.providers[0];
      this.activeProviderId = first.id;
      this.activeModelId = first.models[0]?.id || '';
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
    p.models = p.models.filter(m => m.id !== modelId);
    await saveProviders(this.providers);
    // If deleted the active model, switch
    if (this.activeModelId === modelId) {
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
    const prefs: UserPreferences = {
      targetLanguage: this.targetLangSelect.value,
      cacheExpiry: Math.max(1, Math.min(8760, parseInt(this.cacheExpiryInput.value) || 168)),
      hoverMode: currentPrefs.hoverMode,
      maxConcurrency: Math.max(1, Math.min(10, parseInt(this.maxConcurrencyInput.value) || 3)),
      prompts: {
        systemPrompt: this.systemPromptInput.value.trim() || DEFAULT_PROMPTS.systemPrompt,
        userPrompt: this.userPromptInput.value.trim() || DEFAULT_PROMPTS.userPrompt,
        multiplePrompt: this.multiplePromptInput.value.trim() || DEFAULT_PROMPTS.multiplePrompt,
      },
      hoverKey: this.hoverKeySelect.value || 'Control',
      fabSize: (this.fabSizeSelect.value as 'small' | 'medium' | 'large') || 'medium',
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
