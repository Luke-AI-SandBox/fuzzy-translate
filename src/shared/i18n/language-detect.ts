/**
 * Detect the source language of the current page.
 * Priority: <html lang="..."> > navigator.language > text sampling
 * Returns BCP 47 language tag (e.g., "en", "zh-CN")
 */
export function detectSourceLanguage(): string {
  // 1. Check <html lang> attribute
  const htmlLang = document.documentElement.lang;
  if (htmlLang) {
    return normalizeLanguageTag(htmlLang);
  }

  // 2. Fallback to navigator.language
  if (navigator.language) {
    return normalizeLanguageTag(navigator.language);
  }

  // 3. Fallback to text sampling
  return detectFromTextSample();
}

function normalizeLanguageTag(tag: string): string {
  // Normalize to standard BCP 47 format
  const parts = tag.trim().split(/[-_]/);
  if (parts.length === 1) return parts[0].toLowerCase();
  return `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
}

/** Detect the likely language of a given text string */
export function detectTextLanguage(text: string): string {
  return detectFromText(text);
}

function detectFromTextSample(): string {
  return detectFromText((document.body?.textContent || '').slice(0, 500));
}

function detectFromText(text: string): string {
  const chineseCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const japaneseCount = (text.match(/[\u3040-\u30ff]/g) || []).length;
  const koreanCount = (text.match(/[\uac00-\ud7af]/g) || []).length;
  const cyrillicCount = (text.match(/[\u0400-\u04ff]/g) || []).length;

  const total = text.length || 1;
  if (japaneseCount / total > 0.1) return 'ja';
  if (koreanCount / total > 0.1) return 'ko';
  if (chineseCount / total > 0.1) return 'zh-CN';
  if (cyrillicCount / total > 0.1) return 'ru';

  return 'en';
}

/** Check if text is already in the target language */
export function isTargetLanguage(text: string, targetLang: string): boolean {
  const detected = detectFromText(text);
  // Compare primary language subtag (e.g. "zh" matches "zh-CN" and "zh-TW")
  const detectedPrimary = detected.split('-')[0];
  const targetPrimary = targetLang.split('-')[0];
  return detectedPrimary === targetPrimary;
}
