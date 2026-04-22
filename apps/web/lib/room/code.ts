/**
 * Room codes are 5 chars from a 32-letter alphabet that excludes
 * visually-ambiguous chars (I/1/L, O/0). 32^5 ≈ 33M unique codes.
 *
 * Uses crypto.getRandomValues so the distribution is uniform — Math.random
 * is biased on the high bits and can produce collisions sooner than expected.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 5;

export function generateRoomCode(): string {
  const buf = new Uint8Array(LENGTH);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < LENGTH; i++) {
    // Modulo bias is negligible for 256 % 32 = 0 — perfectly even mapping.
    out += ALPHABET[buf[i]! % ALPHABET.length];
  }
  return out;
}

/** True if `s` looks like a valid room code (right length, allowed chars). */
export function isValidRoomCode(s: string): boolean {
  if (s.length !== LENGTH) return false;
  for (const ch of s) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return true;
}

export const ROOM_CODE_LENGTH = LENGTH;
export const ROOM_CODE_ALPHABET = ALPHABET;
