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
}

export interface ModelItem {
  id: string;        // Unique ID
  name: string;      // Model name, e.g. "deepseek-chat", "gpt-4o-mini"
}

export interface ProviderConfig {
  id: string;        // Unique ID
  name: string;      // Display name, e.g. "DeepSeek", "OpenAI", "Ollama"
  endpoint: string;  // API endpoint URL
  apiKey: string;    // API key (stored locally only)
  models: ModelItem[];
}

/** Flat API config assembled from active provider + model — consumed by translate logic */
export interface ApiConfig {
  endpoint: string;
  apiKey: string;
  model: string;
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

export interface UserPreferences {
  targetLanguage: string;
  cacheExpiry: number;
  hoverMode: boolean;
  maxConcurrency: number;
  prompts: PromptConfig;
  hoverKey: string; // Key to trigger hover translation, e.g. 'Control', 'Alt', 'Shift'
  fabSize: 'small' | 'medium' | 'large'; // Floating ball size
}

export interface UserSettings {
  api: ApiConfig;
  preferences: UserPreferences;
}
