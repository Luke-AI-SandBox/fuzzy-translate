/**
 * Compute SHA-256 hash of text using Web Crypto API.
 * Returns hex string.
 */
export async function computeHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Build cache key from hash, target language, and model name.
 */
export function buildCacheKey(hash: string, targetLang: string, model: string): string {
  return `${hash}_${targetLang}_${model}`;
}
