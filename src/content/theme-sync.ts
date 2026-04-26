/**
 * Content-script theme bridge:
 *  - Reads themeMode + accentHue from storage
 *  - Maintains a live `currentTheme` object that Shadow DOM creators can read
 *  - Applies a small set of `--ft-*` variables to <html> so content.css picks them up
 *  - Reacts to storage changes
 */
import { getPreferences } from '../shared/config/storage';
import { getThemeVars } from '../shared/config/theme-style';
import { isExtensionAlive } from './ext-guard';
import type { ThemeMode, AccentHue } from '../shared/types';

interface ContentTheme { mode: ThemeMode; accent: AccentHue; }

export const currentTheme: ContentTheme = { mode: 'light', accent: 'aurora' };
type Subscriber = (t: ContentTheme) => void;
const subscribers: Subscriber[] = [];

const HUE: Record<AccentHue, number> = { aurora: 248, sunset: 24, forest: 152 };

let styleEl: HTMLStyleElement | null = null;
function ensureStyleTag() {
  if (styleEl && styleEl.isConnected) return styleEl;
  styleEl = document.createElement('style');
  styleEl.id = 'ft-content-vars';
  document.documentElement.appendChild(styleEl);
  return styleEl;
}

function applyVarsToDocument() {
  const h = HUE[currentTheme.accent];
  const dark = currentTheme.mode === 'dark';
  const translated = dark ? `oklch(0.86 0.07 ${h})` : `oklch(0.38 0.12 ${h})`;
  const accent = `oklch(0.62 0.14 ${h})`;
  const pulse = dark ? `oklch(0.70 0.08 ${h})` : `oklch(0.68 0.04 ${h})`;
  // Tinted variants used by bubble styles — soft tint for backgrounds, edge for borders
  const accentSoft = dark ? `oklch(0.32 0.04 ${h} / 0.55)` : `oklch(0.95 0.04 ${h} / 0.55)`;
  const accentEdge = dark ? `oklch(0.55 0.10 ${h} / 0.40)` : `oklch(0.62 0.14 ${h} / 0.30)`;
  ensureStyleTag().textContent = `:root {
    --ft-accent: ${accent};
    --ft-accent-soft: ${accentSoft};
    --ft-accent-edge: ${accentEdge};
    --ft-accent-h: ${h};
    --ft-translated-fg: ${translated};
    --ft-muted-pulse: ${pulse};
  }`;
  document.documentElement.dataset.ftTheme = currentTheme.mode;
  document.documentElement.dataset.ftAccent = currentTheme.accent;
}

export function subscribeTheme(fn: Subscriber): () => void {
  subscribers.push(fn);
  return () => {
    const i = subscribers.indexOf(fn);
    if (i >= 0) subscribers.splice(i, 1);
  };
}

function notify() {
  for (const fn of subscribers) {
    try { fn(currentTheme); } catch { /* ignore */ }
  }
}

export async function initTheme() {
  try {
    const prefs = await getPreferences();
    currentTheme.mode = prefs.themeMode || 'light';
    currentTheme.accent = prefs.accentHue || 'aurora';
  } catch { /* ignore */ }
  applyVarsToDocument();

  if (!isExtensionAlive()) return;
  try {
    chrome.storage.onChanged.addListener((changes) => {
      let changed = false;
      if (changes.themeMode?.newValue) {
        currentTheme.mode = changes.themeMode.newValue as ThemeMode;
        changed = true;
      }
      if (changes.accentHue?.newValue) {
        currentTheme.accent = changes.accentHue.newValue as AccentHue;
        changed = true;
      }
      if (changed) {
        applyVarsToDocument();
        notify();
      }
    });
  } catch { /* extension reloaded mid-init */ }
}

/** Get a CSS block ready to splice into a Shadow DOM <style>. */
export function shadowThemeStyle(): string {
  return `:host { ${getThemeVars(currentTheme.mode, currentTheme.accent)} }`;
}
