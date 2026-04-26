import type { ApiConfig, ProviderConfig, UserPreferences } from '../types';

export const DEFAULT_PROVIDER: ProviderConfig = {
  id: 'default',
  name: '',
  endpoint: '',
  apiKey: '',
  models: [],
};

export const DEFAULT_API_CONFIG: ApiConfig = {
  endpoint: '',
  apiKey: '',
  model: '',
};

export const DEFAULT_PROMPTS = {
  systemPrompt: 'You are a professional translator. Translate the following {sourceLang} text to {targetLang}. Output ONLY the translation, nothing else. Do not add any explanations, notes, or formatting.',
  userPrompt: '{text}',
  multiplePrompt: 'Translate each paragraph below from {sourceLang} to {targetLang}. Output ONLY the translations, keeping the same paragraph order. Separate each translated paragraph with exactly "---FT_SEP---" on its own line. Do not add explanations.\n\n{text}',
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  targetLanguage: 'zh-CN',
  cacheExpiry: 168,
  hoverMode: true,
  selectionMode: true,
  maxConcurrency: 3,
  prompts: { ...DEFAULT_PROMPTS },
  hoverKey: 'Control',
  fabSize: 'medium' as const,
  displayMode: 'bilingual' as const,
  siteRules: {},
  themeMode: 'light' as const,
  accentHue: 'aurora' as const,
  bubbleStyle: 'bare' as const,
  fontScale: 1.0,
  hoverDisplay: 'inline' as const,
  translationPosition: 'below' as const,
  languagePairs: [{ from: 'auto', to: 'zh-CN' }],
  activePairIndex: 0,
};
