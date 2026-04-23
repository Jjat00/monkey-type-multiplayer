import { DEFAULT_SOUND, SOUND_TYPES, type SoundType } from './types.ts';

export const SOUND_STORAGE_KEY = 'mtmp:sound';

export function isValidSound(value: string): value is SoundType {
  return (SOUND_TYPES as string[]).includes(value);
}

export function getStoredSound(): SoundType {
  if (typeof window === 'undefined') return DEFAULT_SOUND;
  try {
    const raw = localStorage.getItem(SOUND_STORAGE_KEY);
    if (raw && isValidSound(raw)) return raw;
  } catch {
    /* localStorage may throw in private mode */
  }
  return DEFAULT_SOUND;
}

export function setStoredSound(value: SoundType): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, value);
  } catch {
    /* ignore quota errors */
  }
}
