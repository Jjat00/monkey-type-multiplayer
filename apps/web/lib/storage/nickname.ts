const KEY = 'mtmp:nickname';
const MAX_LENGTH = 20;

/** Read the saved nickname from localStorage. Returns '' if unset or running on the server. */
export function getNickname(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (localStorage.getItem(KEY) ?? '').slice(0, MAX_LENGTH);
  } catch {
    return '';
  }
}

export function setNickname(value: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, value.trim().slice(0, MAX_LENGTH));
  } catch {
    // localStorage may throw in private mode or when full — silently ignore.
  }
}

export const NICKNAME_MAX_LENGTH = MAX_LENGTH;
