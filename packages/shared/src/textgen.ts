import { ENGLISH_200 } from './wordlist.ts';

export type Rng = () => number;

/**
 * Pick `count` random words from the wordlist.
 * Avoids picking the same word twice in a row (so the text doesn't read
 * "the the the …" — a small quality-of-life detail copied from Monkeytype).
 */
export function pickWords(
  count: number,
  rng: Rng = Math.random,
  source: readonly string[] = ENGLISH_200,
): string[] {
  if (source.length === 0) throw new Error('wordlist is empty');
  const out: string[] = [];
  let lastIdx = -1;
  for (let i = 0; i < count; i++) {
    let idx = Math.floor(rng() * source.length);
    if (idx === lastIdx && source.length > 1) {
      idx = (idx + 1) % source.length;
    }
    out.push(source[idx]!);
    lastIdx = idx;
  }
  return out;
}

/** Convenience: returns a single space-separated string ready to type. */
export function generateText(
  wordCount: number,
  rng: Rng = Math.random,
  source: readonly string[] = ENGLISH_200,
): string {
  return pickWords(wordCount, rng, source).join(' ');
}
