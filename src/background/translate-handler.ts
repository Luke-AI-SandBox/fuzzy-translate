import type { SerializableParagraphInfo, CacheEntry } from '../shared/types';
import type { PortMessage } from '../shared/messaging';
import { getApiConfig, getPreferences } from '../shared/config/storage';
import { translateText } from '../shared/api/client';
import { computeHash, buildCacheKey } from './cache/hash';
import { cacheGet, cacheSet, cacheClear } from './cache/cache-manager';

/** Strip <think>...</think> tags and their content from text */
function stripThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

interface TranslateRequestData extends SerializableParagraphInfo {
  sourceLang?: string;
  targetLang?: string;
  cacheOnly?: boolean;
  isBatch?: boolean;
  batchIds?: string[];
}

/** Handle a single paragraph translation request via Port. */
/** Extract hostname from Port sender. Used to tag cache entries per-site. */
function hostFromPort(port: chrome.runtime.Port): string | undefined {
  const url = port.sender?.tab?.url || port.sender?.url;
  if (!url) return undefined;
  try { return new URL(url).hostname; } catch { return undefined; }
}

export async function handleTranslatePort(port: chrome.runtime.Port): Promise<void> {
  const hostname = hostFromPort(port);
  let keepaliveInterval: ReturnType<typeof setInterval> | null = null;

  const cleanup = () => {
    if (keepaliveInterval) {
      clearInterval(keepaliveInterval);
      keepaliveInterval = null;
    }
  };

  port.onDisconnect.addListener(cleanup);

  port.onMessage.addListener(async (msg: PortMessage) => {
    if (msg.type !== 'translate_request' || !msg.data) return;

    const request = msg.data as TranslateRequestData;

    try {
      const [config, prefs] = await Promise.all([getApiConfig(), getPreferences()]);

      if (!config.endpoint || !config.apiKey || !config.model) {
        try { port.postMessage({ type: 'translate_error', data: 'API 未配置，请先在设置页面配置 API' } as PortMessage); } catch { /* port closed */ }
        return;
      }

      const targetLang = request.targetLang || prefs.targetLanguage;
      const sourceLang = request.sourceLang || 'auto';

      // --- Cache-only mode: just check cache and return ---
      if (request.cacheOnly) {
        const hash = request.hash || await computeHash(request.text);
        const cacheKey = buildCacheKey(hash, targetLang, config.model);
        const cached = await cacheGet(cacheKey);
        if (cached) {
          port.postMessage({
            type: 'translate_cached',
            data: { id: request.id, translation: stripThinkTags(cached.translation) },
          } as PortMessage);
        } else {
          // Signal not cached — content script will handle
          port.postMessage({
            type: 'translate_error',
            data: { id: request.id, error: 'not_cached' },
          } as PortMessage);
        }
        return;
      }

      // --- Batch mode: multiple paragraphs in one API call ---
      if (request.isBatch) {
        await handleBatchTranslation(port, request, config, prefs, sourceLang, targetLang, hostname);
        return;
      }

      // --- Single paragraph translation ---
      const hash = request.hash || await computeHash(request.text);
      const cacheKey = buildCacheKey(hash, targetLang, config.model);

      // Check cache
      const cached = await cacheGet(cacheKey);
      if (cached) {
        port.postMessage({
          type: 'translate_cached',
          data: { id: request.id, translation: stripThinkTags(cached.translation) },
        } as PortMessage);
        return;
      }

      // Start keepalive
      keepaliveInterval = setInterval(() => {
        try { port.postMessage({ type: 'keepalive' } as PortMessage); }
        catch { cleanup(); }
      }, 25000);

      let fullTranslation = '';
      for await (const chunk of translateText(request.text, sourceLang, targetLang, config, undefined, prefs.prompts)) {
        fullTranslation += chunk;
        try {
          port.postMessage({ type: 'translate_chunk', data: { id: request.id, chunk } } as PortMessage);
        } catch { cleanup(); return; }
      }

      // Cache the clean result
      const cleanedTranslation = stripThinkTags(fullTranslation);
      await cacheSet(cacheKey, {
        hash,
        targetLang,
        model: config.model,
        translation: cleanedTranslation,
        createdAt: Date.now(),
        expiresAt: prefs.cacheExpiry > 0 ? Date.now() + prefs.cacheExpiry * 3600 * 1000 : 0,
        hostname,
      });

      try { port.postMessage({ type: 'translate_done', data: { id: request.id, translation: cleanedTranslation } } as PortMessage); } catch { /* port closed */ }

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      try {
        port.postMessage({ type: 'translate_error', data: { id: request.id, error: message } } as PortMessage);
      } catch { /* Port disconnected */ }
    } finally {
      cleanup();
    }
  });
}

/** Handle batch translation: multiple paragraphs in one API call using Multiple Prompt */
async function handleBatchTranslation(
  port: chrome.runtime.Port,
  request: TranslateRequestData,
  config: { endpoint: string; apiKey: string; model: string; temperature?: number },
  prefs: Awaited<ReturnType<typeof getPreferences>>,
  sourceLang: string,
  targetLang: string,
  hostname?: string,
): Promise<void> {
  let keepaliveInterval: ReturnType<typeof setInterval> | null = null;
  const cleanup = () => {
    if (keepaliveInterval) { clearInterval(keepaliveInterval); keepaliveInterval = null; }
  };

  try {
    // Build the combined text — paragraphs are already joined with separator by content script
    // Use Multiple Prompt template
    const multiplePrompt = prefs.prompts.multiplePrompt
      .replace(/\{sourceLang\}/g, sourceLang)
      .replace(/\{targetLang\}/g, targetLang)
      .replace(/\{text\}/g, request.text);

    const systemPrompt = prefs.prompts.systemPrompt
      .replace(/\{sourceLang\}/g, sourceLang)
      .replace(/\{targetLang\}/g, targetLang)
      .replace(/\{text\}/g, '');

    // Start keepalive
    keepaliveInterval = setInterval(() => {
      try { port.postMessage({ type: 'keepalive' } as PortMessage); }
      catch { cleanup(); }
    }, 25000);

    // Use raw fetch for batch (not the single-paragraph translateText which has its own prompt logic)
    let url = config.endpoint.replace(/\/+$/, '');
    if (!url.endsWith('/chat/completions')) url += '/chat/completions';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: multiplePrompt },
        ],
        stream: true,
        ...(typeof config.temperature === 'number' ? { temperature: config.temperature } : {}),
        thinking: { type: 'disabled' },
        enable_thinking: false,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(`API error ${response.status}: ${errBody}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is not readable');

    const decoder = new TextDecoder();
    let buffer = '';
    let fullResult = '';
    let insideThinkTag = false;
    let pendingText = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const json = JSON.parse(trimmed.slice(6));
            if ((json.type === 'content_block_start' || json.type === 'content_block_delta') &&
                (json.content_block || json.delta)?.type === 'thinking') continue;
            const delta = json.choices?.[0]?.delta;
            if (!delta) continue;
            if (delta.reasoning_content) continue;
            if (delta.role === 'reasoning') continue;
            const content = delta.content;
            if (!content) continue;

            // Filter <think> tags
            pendingText += content;
            while (pendingText.length > 0) {
              if (insideThinkTag) {
                const closeIdx = pendingText.indexOf('</think>');
                if (closeIdx === -1) { pendingText = ''; break; }
                pendingText = pendingText.slice(closeIdx + 8);
                insideThinkTag = false;
              } else {
                const openIdx = pendingText.indexOf('<think>');
                if (openIdx === -1) {
                  fullResult += pendingText;
                  try {
                    port.postMessage({ type: 'translate_chunk', data: { id: request.id, chunk: pendingText } } as PortMessage);
                  } catch { cleanup(); return; }
                  pendingText = '';
                } else if (openIdx > 0) {
                  const clean = pendingText.slice(0, openIdx);
                  fullResult += clean;
                  try {
                    port.postMessage({ type: 'translate_chunk', data: { id: request.id, chunk: clean } } as PortMessage);
                  } catch { cleanup(); return; }
                  pendingText = pendingText.slice(openIdx + 7);
                  insideThinkTag = true;
                } else {
                  pendingText = pendingText.slice(7);
                  insideThinkTag = true;
                }
              }
            }
          } catch { /* skip malformed JSON */ }
        }
      }
      if (pendingText && !insideThinkTag) {
        fullResult += pendingText;
      }
    } finally {
      reader.releaseLock();
    }

    const cleanedResult = stripThinkTags(fullResult);

    // Cache each individual paragraph from the batch result
    const separator = /\n?---FT_SEP---\n?/;
    const originalTexts = request.text.split(separator);
    const translations = cleanedResult.split(separator);

    for (let i = 0; i < originalTexts.length; i++) {
      const text = originalTexts[i]?.trim();
      const translation = translations[i]?.trim();
      if (text && translation) {
        const hash = await computeHash(text);
        const cacheKey = buildCacheKey(hash, targetLang, config.model);
        await cacheSet(cacheKey, {
          hash,
          targetLang,
          model: config.model,
          translation,
          createdAt: Date.now(),
          expiresAt: prefs.cacheExpiry > 0 ? Date.now() + prefs.cacheExpiry * 3600 * 1000 : 0,
          hostname,
        });
      }
    }

    try { port.postMessage({ type: 'translate_done', data: { id: request.id, translation: cleanedResult } } as PortMessage); } catch { /* port closed */ }

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    try {
      port.postMessage({ type: 'translate_error', data: { id: request.id, error: message } } as PortMessage);
    } catch { /* Port disconnected */ }
  } finally {
    cleanup();
  }
}
