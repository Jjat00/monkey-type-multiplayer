import { DEFAULT_THEME, THEMES, type ThemeName } from './themes.ts';

export const THEME_STORAGE_KEY = 'mtmp:theme';

/** Validates that a string is a known theme name (defends against stale localStorage values). */
export function isValidTheme(value: string): value is ThemeName {
  return value in THEMES;
}

/** Read the saved theme from localStorage. Returns the default if unset, invalid, or running on the server. */
export function getStoredTheme(): ThemeName {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw && isValidTheme(raw)) return raw;
  } catch {
    /* localStorage may throw in private mode — fall through to default */
  }
  return DEFAULT_THEME;
}

export function setStoredTheme(name: ThemeName): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, name);
  } catch {
    /* ignore quota errors */
  }
}

/**
 * Apply a theme palette to the document root by overwriting CSS custom properties.
 * Tailwind's `@theme inline` declarations in globals.css reference these via var(),
 * so all utility classes update in place without re-rendering React.
 */
export function applyTheme(name: ThemeName): void {
  if (typeof document === 'undefined') return;
  const palette = THEMES[name];
  const root = document.documentElement;
  for (const [key, value] of Object.entries(palette)) {
    root.style.setProperty(`--color-${key}`, value);
  }
  root.dataset.theme = name;
}
