import type { ThemeMode, AccentHue } from '../types';

/** Base hue for each accent theme (matches the Lucent design palette) */
const HUE_PRIMARY: Record<AccentHue, number> = { aurora: 248, sunset: 24, forest: 152 };
/** Second hue used for the accent gradient (primary + 60°) */
const HUE_GRAD_END: Record<AccentHue, number> = { aurora: 308, sunset: 84, forest: 212 };

/**
 * Produce the CSS variable block for a given theme + accent.
 * Works inside Shadow DOM (:host { ... }) or regular CSS (:root { ... }).
 * Consumers wrap with their own selector.
 */
export function getThemeVars(mode: ThemeMode = 'light', accent: AccentHue = 'aurora'): string {
  const h = HUE_PRIMARY[accent];
  const h2 = HUE_GRAD_END[accent];
  const dark = mode === 'dark';

  return `
    --accent: oklch(0.62 0.14 ${h});
    --accent-rule: oklch(0.62 0.14 ${h} / 0.45);
    --accent-soft: ${dark ? `oklch(0.42 0.09 ${h} / 0.35)` : `oklch(0.88 0.06 ${h} / 0.55)`};
    --accent-fg: ${dark ? `oklch(0.84 0.10 ${h})` : `oklch(0.42 0.14 ${h})`};
    --accent-grad: linear-gradient(135deg, oklch(0.62 0.14 ${h}), oklch(0.78 0.14 ${h2}));
    --translated-fg: ${dark ? `oklch(0.86 0.07 ${h})` : `oklch(0.22 0.01 ${h})`};

    --bg: ${dark ? 'oklch(0.18 0.01 260)' : 'oklch(0.985 0.003 80)'};
    --fg: ${dark ? 'oklch(0.92 0.01 260)' : 'oklch(0.22 0.01 260)'};
    --muted: ${dark ? 'oklch(0.65 0.01 260)' : 'oklch(0.48 0.01 260)'};
    --rule: ${dark ? 'oklch(0.30 0.01 260)' : 'oklch(0.88 0.005 260)'};

    --glass-bg: ${dark ? 'oklch(0.24 0.015 260 / 0.85)' : 'oklch(1 0 0 / 0.92)'};
    --glass-bg-solid: ${dark ? 'oklch(0.28 0.02 260 / 0.95)' : 'oklch(1 0 0 / 0.98)'};
    --glass-border: ${dark ? 'oklch(0.45 0.02 260 / 0.35)' : 'oklch(0.30 0.01 260 / 0.12)'};
    --glass-inner-hl: ${dark ? 'oklch(1 0 0 / 0.06)' : 'oklch(1 0 0 / 0.70)'};

    --surface-soft: ${dark ? 'oklch(0.30 0.01 260 / 0.6)' : 'oklch(0.96 0.005 260 / 0.7)'};

    --danger: oklch(0.55 0.18 25);
    --success: oklch(0.65 0.18 150);

    --wallpaper-grad: ${dark
      ? `linear-gradient(140deg, oklch(0.18 0.03 260) 0%, oklch(0.22 0.04 ${h2}) 60%, oklch(0.15 0.02 ${h}) 100%)`
      : `linear-gradient(140deg, oklch(0.96 0.02 80) 0%, oklch(0.94 0.03 40) 45%, oklch(0.93 0.04 ${h}) 100%)`};
    --orb-1: radial-gradient(circle, oklch(0.78 0.18 ${h}) 0%, transparent 70%);
    --orb-2: radial-gradient(circle, oklch(0.72 0.15 ${h2}) 0%, transparent 70%);
  `;
}

/** Apply theme data attributes to the root HTML element (for popup/options pages) */
export function applyThemeToDocument(mode: ThemeMode, accent: AccentHue): void {
  document.documentElement.dataset.ftTheme = mode;
  document.documentElement.dataset.ftAccent = accent;
}
