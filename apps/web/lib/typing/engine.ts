/*
 * Pure typing-race state machine. No React, no DOM, no side effects.
 * Every operation returns a new state object — easy to test, easy to
 * snapshot-compare in React, and reusable on the server for anti-cheat
 * validation later.
 */

export type CharStatus = 'correct' | 'incorrect';

export interface EngineState {
  /** The target text the player must type. Immutable for the lifetime of a race. */
  readonly text: string;
  /** What the player actually typed at each position. null = not yet typed. */
  readonly typed: ReadonlyArray<string | null>;
  /** Correctness per position. null = not yet typed. */
  readonly status: ReadonlyArray<CharStatus | null>;
  /** Position the next keystroke will write to. Equals text.length when finished. */
  readonly position: number;
  /** Cumulative count of incorrect keystrokes — never decreases, even on backspace. */
  readonly errors: number;
  /** Cumulative count of all keystrokes (correct + incorrect). */
  readonly keystrokes: number;
  /** Timestamp (ms) of the first keystroke. null until the player starts. */
  readonly startedAt: number | null;
  /** Timestamp (ms) when position reached text.length. null while in-progress. */
  readonly finishedAt: number | null;
}

export interface Metrics {
  /** Words per minute counting only correctly-typed characters. */
  readonly wpm: number;
  /** Words per minute counting every keystroke regardless of correctness. */
  readonly rawWpm: number;
  /** Percent of keystrokes that were correct (0–100). */
  readonly accuracy: number;
  /** Number of correctly-typed positions (= text.length when 100% accurate finish). */
  readonly correctChars: number;
}

export function init(text: string): EngineState {
  const len = text.length;
  return {
    text,
    typed: Array.from({ length: len }, () => null),
    status: Array.from({ length: len }, () => null),
    position: 0,
    errors: 0,
    keystrokes: 0,
    startedAt: null,
    finishedAt: null,
  };
}

/**
 * Process a single character typed by the player.
 * - Ignores keystrokes after the race ends.
 * - Starts the timer on the first valid keystroke.
 * - Wrong characters are written and the cursor still advances (Monkeytype default).
 */
export function typeChar(state: EngineState, char: string, now: number): EngineState {
  if (state.finishedAt !== null) return state;
  if (state.position >= state.text.length) return state;
  if (char.length !== 1) return state;

  const expected = state.text[state.position];
  const isCorrect = char === expected;

  const typed = state.typed.slice();
  const status = state.status.slice();
  typed[state.position] = char;
  status[state.position] = isCorrect ? 'correct' : 'incorrect';

  const nextPosition = state.position + 1;
  const startedAt = state.startedAt ?? now;
  const finishedAt = nextPosition >= state.text.length ? now : null;

  return {
    ...state,
    typed,
    status,
    position: nextPosition,
    errors: state.errors + (isCorrect ? 0 : 1),
    keystrokes: state.keystrokes + 1,
    startedAt,
    finishedAt,
  };
}

/**
 * Mark the race as finished without consuming the whole text. Used by the
 * time-mode timer when the limit elapses — the typed slots up to that point
 * still count for the WPM/accuracy metrics.
 */
export function finish(state: EngineState, now: number): EngineState {
  if (state.finishedAt !== null) return state;
  return { ...state, finishedAt: now };
}

/** Move the cursor back one position and clear that slot. No-op at position 0. */
export function backspace(state: EngineState): EngineState {
  if (state.finishedAt !== null) return state;
  if (state.position === 0) return state;

  const typed = state.typed.slice();
  const status = state.status.slice();
  const prev = state.position - 1;
  typed[prev] = null;
  status[prev] = null;

  return { ...state, typed, status, position: prev };
}

/** Compute live metrics. Returns zeros until the player has started. */
export function metrics(state: EngineState, now: number): Metrics {
  if (state.startedAt === null) {
    return { wpm: 0, rawWpm: 0, accuracy: 0, correctChars: 0 };
  }
  const endTime = state.finishedAt ?? now;
  const elapsedMs = Math.max(1, endTime - state.startedAt);
  const minutes = elapsedMs / 60_000;

  let correctChars = 0;
  for (const s of state.status) if (s === 'correct') correctChars++;

  const rawWpm = state.keystrokes / 5 / minutes;
  const wpm = correctChars / 5 / minutes;
  const accuracy = state.keystrokes === 0
    ? 0
    : ((state.keystrokes - state.errors) / state.keystrokes) * 100;

  return {
    wpm: Math.round(wpm),
    rawWpm: Math.round(rawWpm),
    accuracy: Math.round(accuracy * 10) / 10,
    correctChars,
  };
}

export function isFinished(state: EngineState): boolean {
  return state.finishedAt !== null;
}
