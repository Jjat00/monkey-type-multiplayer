/**
 * Theme palettes. Each palette maps to the same set of CSS custom properties
 * (`--color-bg`, `--color-text`, etc.) defined in globals.css. Switching a
 * theme is just rewriting these values on the document root.
 *
 * To add a new theme: add an entry to THEMES with the same key set, and add
 * its name to ThemeName.
 */

export interface Palette {
  bg: string;
  text: string;
  sub: string;
  'sub-alt': string;
  main: string;
  error: string;
  'error-extra': string;
}

export const THEMES = {
  // Warm dark/light: original palette inspired by Monkeytype's "serika" theme
  // (their work is GPL-3.0; we don't ship their name or their assets).
  'warm-dark': {
    bg: '#323437',
    text: '#d1d0c5',
    sub: '#646669',
    'sub-alt': '#2c2e31',
    main: '#e2b714',
    error: '#ca4754',
    'error-extra': '#7e2a33',
  },
  'warm-light': {
    bg: '#e1e1e3',
    text: '#323437',
    sub: '#aaaaae',
    'sub-alt': '#d1d1d4',
    main: '#e2b714',
    error: '#da3333',
    'error-extra': '#791717',
  },
  nord: {
    bg: '#2e3440',
    text: '#d8dee9',
    sub: '#4c566a',
    'sub-alt': '#3b4252',
    main: '#88c0d0',
    error: '#bf616a',
    'error-extra': '#5c2a30',
  },
  dracula: {
    bg: '#282a36',
    text: '#f8f8f2',
    sub: '#6272a4',
    'sub-alt': '#44475a',
    main: '#bd93f9',
    error: '#ff5555',
    'error-extra': '#6e2828',
  },
  'gruvbox-dark': {
    bg: '#282828',
    text: '#ebdbb2',
    sub: '#928374',
    'sub-alt': '#3c3836',
    main: '#d79921',
    error: '#cc241d',
    'error-extra': '#5a1010',
  },
} as const satisfies Record<string, Palette>;

export type ThemeName = keyof typeof THEMES;

export const DEFAULT_THEME: ThemeName = 'dracula';

export const THEME_NAMES = Object.keys(THEMES) as ThemeName[];

/** Display label for the UI (lowercase to match Monkeytype's vibe). */
export function themeLabel(name: ThemeName): string {
  return name.replace(/-/g, ' ');
}
