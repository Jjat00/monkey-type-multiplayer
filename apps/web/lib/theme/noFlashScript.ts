import { THEMES, DEFAULT_THEME } from './themes.ts';
import { THEME_STORAGE_KEY } from './storage.ts';

/**
 * Build the inline script that applies the saved theme BEFORE React hydrates,
 * eliminating the "flash of default theme" when a user has customized one.
 *
 * The script is self-contained (no module imports at runtime) and inlines a
 * JSON copy of the palettes — minimal overhead (~1KB) and runs synchronously
 * in the document head.
 */
export function buildNoFlashScript(): string {
  const themesJson = JSON.stringify(THEMES);
  return `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})||${JSON.stringify(DEFAULT_THEME)};var T=${themesJson};var p=T[t]||T[${JSON.stringify(DEFAULT_THEME)}];var r=document.documentElement;for(var k in p){r.style.setProperty('--color-'+k,p[k]);}r.dataset.theme=t;}catch(e){}})();`;
}
