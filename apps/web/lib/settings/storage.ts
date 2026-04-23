import {
  DEFAULT_SETTINGS,
  isTimeSeconds,
  isWordCount,
  type Settings,
} from './types.ts';

export const SETTINGS_STORAGE_KEY = 'mtmp:settings';

/**
 * Read settings from localStorage. Validates each field — anything missing,
 * malformed or out-of-range falls back to the default for that field. Lets
 * us add new fields later without breaking users with older saved blobs.
 */
export function getStoredSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      mode: parsed.mode === 'time' ? 'time' : 'words',
      wordCount:
        typeof parsed.wordCount === 'number' && isWordCount(parsed.wordCount)
          ? parsed.wordCount
          : DEFAULT_SETTINGS.wordCount,
      timeSeconds:
        typeof parsed.timeSeconds === 'number' && isTimeSeconds(parsed.timeSeconds)
          ? parsed.timeSeconds
          : DEFAULT_SETTINGS.timeSeconds,
      punctuation: typeof parsed.punctuation === 'boolean' ? parsed.punctuation : false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function setStoredSettings(settings: Settings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota errors */
  }
}
