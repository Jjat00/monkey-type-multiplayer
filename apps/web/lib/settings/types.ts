/**
 * User-facing settings for solo-practice. Each setting is a small finite
 * union — keeping the option set explicit makes the UI trivial (just iterate)
 * and the storage layer can validate aggressively against stale values.
 */

export type Mode = 'words' | 'time';

export const WORD_COUNTS = [10, 25, 50, 100] as const;
export type WordCount = (typeof WORD_COUNTS)[number];

export const TIME_SECONDS = [15, 30, 60] as const;
export type TimeSeconds = (typeof TIME_SECONDS)[number];

export interface Settings {
  mode: Mode;
  wordCount: WordCount;
  timeSeconds: TimeSeconds;
  punctuation: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'time',
  wordCount: 25,
  timeSeconds: 15,
  punctuation: false,
};

export function isWordCount(n: number): n is WordCount {
  return (WORD_COUNTS as readonly number[]).includes(n);
}

export function isTimeSeconds(n: number): n is TimeSeconds {
  return (TIME_SECONDS as readonly number[]).includes(n);
}
