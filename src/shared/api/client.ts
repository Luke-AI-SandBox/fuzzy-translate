import type { ApiConfig, PromptConfig } from '../types';
import type { ChatCompletionChunk } from './types';

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status === 401 || response.status === 403) {
        return response;
      }
      if ([429, 500, 502, 503].includes(response.status) && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      return response; // Non-retryable error
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      lastError = err as Error;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError || new Error('Fetch failed after retries');
}

/**
 * Translate text using OpenAI-compatible Chat Completions API with streaming.
 * Yields translated text chunks as they arrive.
 */
/** Replace {sourceLang}, {targetLang}, {text} placeholders in prompt template */
function fillPromptTemplate(template: string, vars: { sourceLang: string; targetLang: string; text?: string }): string {
  return template
    .replace(/\{sourceLang\}/g, vars.sourceLang)
    .replace(/\{targetLang\}/g, vars.targetLang)
    .replace(/\{text\}/g, vars.text || '');
}

export async function* translateText(
  text: string,
  sourceLang: string,
  targetLang: string,
  config: ApiConfig,
  signal?: AbortSignal,
  prompts?: PromptConfig
): AsyncGenerator<string> {
  let url = config.endpoint.replace(/\/+$/, '');
  if (!url.endsWith('/chat/completions')) {
    url += '/chat/completions';
  }

  const vars = { sourceLang, targetLang, text };
  const systemPrompt = prompts
    ? fillPromptTemplate(prompts.systemPrompt, vars)
    : `Translate the following ${sourceLang} text to ${targetLang}. Output ONLY the translation, nothing else. Do not add any explanations, notes, or formatting.`;
  const userContent = prompts
    ? fillPromptTemplate(prompts.userPrompt, vars)
    : text;

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      stream: true,
      ...(typeof config.temperature === 'number' ? { temperature: config.temperature } : {}),
      // Disable thinking/reasoning for all providers that support it
      thinking: { type: 'disabled' },           // Anthropic Claude
      enable_thinking: false,                    // DeepSeek
    }),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`API error ${response.status}: ${errorBody}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response body is not readable');

  const decoder = new TextDecoder();
  let buffer = '';
  // Track <think>...</think> tags embedded in content (DeepSeek-R1 etc.)
  let insideThinkTag = false;
  let pendingText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));

          // --- Filter 1: Anthropic thinking content blocks ---
          if (json.type === 'content_block_start' || json.type === 'content_block_delta') {
            const block = json.content_block || json.delta;
            if (block?.type === 'thinking') continue;
          }

          const delta = json.choices?.[0]?.delta;
          if (!delta) continue;

          // --- Filter 2: DeepSeek reasoning_content field ---
          if (delta.reasoning_content) continue;

          // --- Filter 3: OpenAI o-series reasoning role ---
          if (delta.role === 'reasoning') continue;

          const content = delta.content;
          if (!content) continue;

          // --- Filter 4: <think>...</think> tags in content stream ---
          // Some models (DeepSeek-R1 via OpenAI-compat) embed thinking
          // directly in the content field wrapped in <think> tags.
          pendingText += content;

          while (pendingText.length > 0) {
            if (insideThinkTag) {
              const closeIdx = pendingText.indexOf('</think>');
              if (closeIdx === -1) {
                // Still inside think block, discard all pending
                pendingText = '';
                break;
              }
              // Skip everything up to and including </think>
              pendingText = pendingText.slice(closeIdx + 8);
              insideThinkTag = false;
            } else {
              const openIdx = pendingText.indexOf('<think>');
              if (openIdx === -1) {
                // No think tag — yield all pending text
                yield pendingText;
                pendingText = '';
              } else if (openIdx > 0) {
                // Yield text before <think>
                yield pendingText.slice(0, openIdx);
                pendingText = pendingText.slice(openIdx + 7);
                insideThinkTag = true;
              } else {
                // Starts with <think>
                pendingText = pendingText.slice(7);
                insideThinkTag = true;
              }
            }
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    // Yield any remaining non-thinking text
    if (pendingText && !insideThinkTag) {
      yield pendingText;
    }
  } finally {
    reader.releaseLock();
  }
}
