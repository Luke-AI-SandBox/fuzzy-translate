/**
 * Runtime guard for content scripts.
 *
 * When the extension is reloaded / updated while a content script is still
 * running on a page, any call to `chrome.*` APIs throws
 * "Extension context invalidated". This helper lets callers bail out cleanly
 * instead of letting the exception surface.
 */

export function isExtensionAlive(): boolean {
  try {
    return Boolean(chrome?.runtime?.id);
  } catch {
    return false;
  }
}

/** Swallow "Extension context invalidated" errors from chrome.* calls. */
export function safe<T>(fn: () => T, fallback?: T): T | undefined {
  if (!isExtensionAlive()) return fallback;
  try {
    return fn();
  } catch (e) {
    const msg = (e as Error)?.message || '';
    if (msg.includes('Extension context invalidated')) return fallback;
    throw e;
  }
}

/** Fire-and-forget chrome.runtime.sendMessage that survives context loss. */
export function safeSendMessage(message: unknown, cb?: (response: any) => void): void {
  if (!isExtensionAlive()) return;
  try {
    if (cb) chrome.runtime.sendMessage(message as any, cb);
    else chrome.runtime.sendMessage(message as any);
  } catch (e) {
    const msg = (e as Error)?.message || '';
    if (!msg.includes('Extension context invalidated')) throw e;
  }
}
