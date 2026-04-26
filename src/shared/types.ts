export type TranslationMode = 'full-page' | 'selection' | 'hover';
export type TranslationStatus = 'streaming' | 'complete' | 'error';

export interface ParagraphInfo {
  id: string;
  element: HTMLElement;
  text: string;
  hash: string;
}

export interface SerializableParagraphInfo {
  id: string;
  text: string;
  hash: string;
}

export interface CacheEntry {
  hash: string;
  targetLang: string;
  model: string;
  translation: string;
  createdAt: number;
  expiresAt: number;
  hostname?: string; // Origin host — enables per-site cache stats
}

export interface CacheSiteStat {
  hostname: string;
  count: number;
  bytes: number;
  lastAccessed: number;
}
export interface CacheStats {
  totalCount: number;
  totalBytes: number;
  bySite: CacheSiteStat[];
}

export interface ModelItem {
  id: string;        // Unique ID
  name: string;      // Model name, e.g. "deepseek-chat", "gpt-4o-mini"
}

export interface ProviderConfig {
  id: string;
  name: string;           // Display name, e.g. "DeepSeek", "OpenAI", "Ollama"
  endpoint: string;       // API endpoint URL
  apiKey: string;         // API key (stored locally only)
  models: ModelItem[];
  temperature?: number;   // 0–2 — passed to /chat/completions requests
}

/** Flat API config assembled from active provider + model — consumed by translate logic */
export interface ApiConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  temperature?: number;
}

/** @deprecated Kept for migration from old flat format */
export interface ModelConfig {
  id: string;
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
}

export interface PromptConfig {
  systemPrompt: string;   // System prompt template. Variables: {sourceLang}, {targetLang}
  userPrompt: string;     // User prompt template. Variables: {text}, {sourceLang}, {targetLang}
  multiplePrompt: string; // Prompt for batch/multiple paragraph translation. Variables: {text}, {sourceLang}, {targetLang}
}

export type ThemeMode = 'light' | 'dark';
export type AccentHue = 'aurora' | 'sunset' | 'forest';
export type BubbleStyle = 'frosted' | 'rounded' | 'solid' | 'bare';

export interface UserPreferences {
  targetLanguage: string;
  cacheExpiry: number;
  hoverMode: boolean;
  selectionMode: boolean; // Whether selection translation icon is enabled
  maxConcurrency: number;
  prompts: PromptConfig;
  hoverKey: string;
  fabSize: 'small' | 'medium' | 'large';
  displayMode: DisplayMode;
  siteRules: Record<string, 'always' | 'never'>; // Per-hostname: auto-translate or skip entirely
  themeMode: ThemeMode;      // light or dark
  accentHue: AccentHue;      // Aurora / Sunset / Forest
  bubbleStyle: BubbleStyle;  // Inline translation bubble look
  fontScale: number;         // 0.8 – 1.3
  hoverDisplay: HoverDisplayMode; // 'inline' (inject below paragraph) or 'popover' (glass card)
  translationPosition: TranslationPosition; // Only applies when displayMode === 'bilingual'
  languagePairs: LanguagePair[]; // User-saved from→to combinations
  activePairIndex: number;       // Index into languagePairs (-1 means use legacy targetLanguage only)
}

export type HoverDisplayMode = 'inline' | 'popover';
export type TranslationPosition = 'below' | 'above';

/** A user-saved language pair. `from` may be 'auto' for auto-detect. */
export interface LanguagePair {
  from: string;  // 'auto' or language code (en, ja, zh-CN, ...)
  to: string;    // language code
}

export type DisplayMode = 'bilingual' | 'replace';

export interface UserSettings {
  api: ApiConfig;
  preferences: UserPreferences;
}
