import { COMMON_WORDS } from './wordlist.ts';

export type Rng = () => number;

export interface GenerateOptions {
  rng?: Rng;
  source?: readonly string[];
  /** When true, capitalizes sentences and sprinkles `, . ! ?` between words. */
  punctuation?: boolean;
}

/**
 * Pick `count` random words from the wordlist.
 * Avoids picking the same word twice in a row (so the text doesn't read
 * "the the the …" — a small quality-of-life detail copied from Monkeytype).
 */
export function pickWords(
  count: number,
  rng: Rng = Math.random,
  source: readonly string[] = COMMON_WORDS,
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

/**
 * Returns a space-separated string ready to type.
 * `options.punctuation` adds capitalization and Monkeytype-style punctuation
 * (~10% commas, ~15% sentence-ends with `. ! ?`).
 */
export function generateText(
  wordCount: number,
  options: GenerateOptions = {},
): string {
  const { rng = Math.random, source = COMMON_WORDS, punctuation = false } = options;
  const words = pickWords(wordCount, rng, source);
  return punctuation ? addPunctuation(words, rng) : words.join(' ');
}

const SENTENCE_ENDERS = ['.', '!', '?'] as const;

/**
 * Transform lowercase words into a punctuated string. Distribution roughly
 * matches Monkeytype's defaults so the output reads natural enough to flow.
 */
function addPunctuation(words: string[], rng: Rng): string {
  const out: string[] = [];
  let capitalizeNext = true;

  for (let i = 0; i < words.length; i++) {
    let w = words[i]!;
    if (capitalizeNext && w.length > 0) {
      w = w[0]!.toUpperCase() + w.slice(1);
    }
    capitalizeNext = false;

    const isLast = i === words.length - 1;
    if (isLast) {
      w += '.';
    } else {
      const r = rng();
      if (r < 0.15) {
        // End of sentence — pick one of `. ! ?` and capitalize the next word.
        const ender =
          SENTENCE_ENDERS[Math.floor(rng() * SENTENCE_ENDERS.length)]!;
        w += ender;
        capitalizeNext = true;
      } else if (r < 0.25) {
        w += ',';
      }
    }
    out.push(w);
  }
  return out.join(' ');
}
