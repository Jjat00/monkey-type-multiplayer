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

/**
 * Random "guest1234" style nickname for users who don't bother filling one in.
 * 4 digits is enough entropy for the tiny lobby population we expect.
 */
export function generateGuestNickname(): string {
  const n = Math.floor(Math.random() * 10_000).toString().padStart(4, '0');
  return `guest${n}`;
}

/**
 * Returns the user-typed nickname if non-empty, otherwise a fresh random
 * guest one. Centralized so both /play and /play/[code] share behavior.
 */
export function resolveNickname(input: string): string {
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : generateGuestNickname();
}
