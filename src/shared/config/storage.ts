import type { ApiConfig, ProviderConfig, ModelConfig, UserPreferences, PromptConfig } from '../types';
import { DEFAULT_API_CONFIG, DEFAULT_PREFERENCES, DEFAULT_PROMPTS } from './defaults';

// =============================================
// Provider + Model storage (chrome.storage.local)
// =============================================

/** Get all provider configs */
export async function getProviders(): Promise<ProviderConfig[]> {
  const result = await chrome.storage.local.get(['providers']);
  const providers = result.providers as ProviderConfig[] | undefined;
  if (providers && providers.length > 0) return providers;

  // --- Migration from old modelConfigs format ---
  const oldResult = await chrome.storage.local.get(['modelConfigs']);
  const oldConfigs = oldResult.modelConfigs as ModelConfig[] | undefined;
  if (oldConfigs && oldConfigs.length > 0) {
    // Group by endpoint+apiKey into providers
    const providerMap = new Map<string, ProviderConfig>();
    for (const m of oldConfigs) {
      const key = `${m.endpoint}||${m.apiKey}`;
      let provider = providerMap.get(key);
      if (!provider) {
        provider = {
          id: 'provider-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          name: m.name || extractProviderName(m.endpoint),
          endpoint: m.endpoint,
          apiKey: m.apiKey,
          models: [],
        };
        providerMap.set(key, provider);
      }
      provider.models.push({ id: m.id, name: m.model });
    }
    const migrated = Array.from(providerMap.values());
    await saveProviders(migrated);
    // Migrate active selection
    const oldActive = await chrome.storage.local.get(['activeModelId']);
    const oldActiveId = oldActive.activeModelId as string;
    if (oldActiveId) {
      const oldModel = oldConfigs.find(c => c.id === oldActiveId);
      if (oldModel) {
        const p = migrated.find(p => p.endpoint === oldModel.endpoint && p.apiKey === oldModel.apiKey);
        if (p) {
          await setActiveSelection(p.id, oldActiveId);
        }
      }
    }
    // Cleanup old keys
    await chrome.storage.local.remove(['modelConfigs', 'activeModelId', 'endpoint', 'apiKey', 'model']);
    return migrated;
  }

  // --- Migration from very old single-config format ---
  const oldest = await chrome.storage.local.get(['endpoint', 'apiKey', 'model']);
  if (oldest.endpoint || oldest.apiKey || oldest.model) {
    const modelId = 'model-' + Date.now();
    const provider: ProviderConfig = {
      id: 'provider-' + Date.now(),
      name: extractProviderName((oldest.endpoint as string) || ''),
      endpoint: (oldest.endpoint as string) || '',
      apiKey: (oldest.apiKey as string) || '',
      models: [{ id: modelId, name: (oldest.model as string) || '' }],
    };
    await saveProviders([provider]);
    await setActiveSelection(provider.id, modelId);
    await chrome.storage.local.remove(['endpoint', 'apiKey', 'model']);
    return [provider];
  }

  return [];
}

/** Save all provider configs */
export async function saveProviders(providers: ProviderConfig[]): Promise<void> {
  await chrome.storage.local.set({ providers });
}

/** Get active provider ID + model ID */
export async function getActiveSelection(): Promise<{ providerId: string; modelId: string }> {
  const result = await chrome.storage.local.get(['activeProviderId', 'activeModelId']);
  return {
    providerId: (result.activeProviderId as string) || '',
    modelId: (result.activeModelId as string) || '',
  };
}

/** Set active provider ID + model ID */
export async function setActiveSelection(providerId: string, modelId: string): Promise<void> {
  await chrome.storage.local.set({ activeProviderId: providerId, activeModelId: modelId });
}

/** Get the currently active ApiConfig (assembled from provider + model). All translation logic uses this. */
export async function getApiConfig(): Promise<ApiConfig> {
  const providers = await getProviders();
  const { providerId, modelId } = await getActiveSelection();

  const provider = providers.find(p => p.id === providerId) || providers[0];
  if (!provider) return { ...DEFAULT_API_CONFIG };

  const model = provider.models.find(m => m.id === modelId) || provider.models[0];
  return {
    endpoint: provider.endpoint,
    apiKey: provider.apiKey,
    model: model?.name || '',
  };
}

/** Extract a readable provider name from endpoint URL */
function extractProviderName(endpoint: string): string {
  try {
    const host = new URL(endpoint).host;
    if (host.includes('openai')) return 'OpenAI';
    if (host.includes('deepseek')) return 'DeepSeek';
    if (host.includes('moonshot')) return 'Moonshot';
    if (host.includes('siliconflow')) return 'SiliconFlow';
    if (host.includes('localhost') || host.includes('127.0.0.1')) return 'Ollama (Local)';
    return host;
  } catch {
    return '未命名';
  }
}

// =============================================
// Backward-compatible exports (used by old code paths)
// =============================================

/** @deprecated Use saveProviders instead */
export async function saveApiConfig(config: ApiConfig): Promise<void> {
  const providers = await getProviders();
  const { providerId, modelId } = await getActiveSelection();
  const pIdx = providers.findIndex(p => p.id === providerId);
  if (pIdx >= 0) {
    providers[pIdx].endpoint = config.endpoint;
    providers[pIdx].apiKey = config.apiKey;
    const mIdx = providers[pIdx].models.findIndex(m => m.id === modelId);
    if (mIdx >= 0) providers[pIdx].models[mIdx].name = config.model;
    await saveProviders(providers);
  }
}

/** @deprecated kept for migration path */
export async function getModelConfigs(): Promise<ModelConfig[]> {
  const providers = await getProviders();
  const result: ModelConfig[] = [];
  for (const p of providers) {
    for (const m of p.models) {
      result.push({ id: m.id, name: m.name, endpoint: p.endpoint, apiKey: p.apiKey, model: m.name });
    }
  }
  return result;
}
export async function saveModelConfigs(_configs: ModelConfig[]): Promise<void> { /* no-op */ }
export async function getActiveModelId(): Promise<string> {
  const { modelId } = await getActiveSelection();
  return modelId;
}
export async function setActiveModelId(id: string): Promise<void> {
  const { providerId } = await getActiveSelection();
  await setActiveSelection(providerId, id);
}

// =============================================
// User preferences (chrome.storage.sync)
// =============================================

export async function getPreferences(): Promise<UserPreferences> {
  const result = await chrome.storage.sync.get(['targetLanguage', 'cacheExpiry', 'hoverMode', 'maxConcurrency', 'prompts', 'hoverKey', 'fabSize']);
  const savedPrompts = result.prompts as Partial<PromptConfig> | undefined;
  return {
    targetLanguage: (result.targetLanguage as string) || DEFAULT_PREFERENCES.targetLanguage,
    cacheExpiry: (result.cacheExpiry as number) ?? DEFAULT_PREFERENCES.cacheExpiry,
    hoverMode: (result.hoverMode as boolean) ?? DEFAULT_PREFERENCES.hoverMode,
    maxConcurrency: (result.maxConcurrency as number) ?? DEFAULT_PREFERENCES.maxConcurrency,
    prompts: {
      systemPrompt: savedPrompts?.systemPrompt || DEFAULT_PROMPTS.systemPrompt,
      userPrompt: savedPrompts?.userPrompt || DEFAULT_PROMPTS.userPrompt,
      multiplePrompt: savedPrompts?.multiplePrompt || DEFAULT_PROMPTS.multiplePrompt,
    },
    hoverKey: (result.hoverKey as string) || DEFAULT_PREFERENCES.hoverKey,
    fabSize: (result.fabSize as 'small' | 'medium' | 'large') || DEFAULT_PREFERENCES.fabSize,
  };
}

export async function savePreferences(prefs: UserPreferences): Promise<void> {
  await chrome.storage.sync.set({
    targetLanguage: prefs.targetLanguage,
    cacheExpiry: prefs.cacheExpiry,
    hoverMode: prefs.hoverMode,
    maxConcurrency: prefs.maxConcurrency,
    prompts: prefs.prompts,
    hoverKey: prefs.hoverKey,
    fabSize: prefs.fabSize,
  });
}
