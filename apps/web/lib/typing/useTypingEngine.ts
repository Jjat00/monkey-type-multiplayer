'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  type EngineState,
  type Metrics,
  backspace,
  finish,
  init,
  isFinished,
  metrics as computeMetrics,
  typeChar,
} from './engine.ts';

interface UseTypingEngineOptions {
  /** The target text to race against. Changing it resets the engine. */
  text: string;
  /** Called whenever the player advances. Throttled by `progressIntervalMs`. */
  onProgress?: (snapshot: ProgressSnapshot) => void;
  /** Called once when the player completes the text. */
  onFinish?: (snapshot: ProgressSnapshot) => void;
  /** Throttle window for onProgress, default 150ms. */
  progressIntervalMs?: number;
  /** When true, the engine ignores keystrokes (e.g. countdown phase). */
  paused?: boolean;
  /**
   * If set, the race ends after this many seconds from the first keystroke.
   * Used by the time mode in solo-practice. The text should be long enough
   * that the typist won't run out of words before the timer expires.
   */
  timeLimitSeconds?: number;
  /**
   * Fired on every accepted printable keystroke (NOT on backspace).
   * `correct` reflects whether the typed character matched the expected one.
   * Used by the sound module to play feedback.
   */
  onKeystroke?: (correct: boolean) => void;
}

export interface ProgressSnapshot {
  state: EngineState;
  metrics: Metrics;
}

interface HookReturn {
  state: EngineState;
  metrics: Metrics;
  /** Whether the player has typed something in the last ~300ms. */
  isActive: boolean;
  /** Reset the engine with a new text (or the same text again). */
  reset: (text?: string) => void;
}

export function useTypingEngine({
  text,
  onProgress,
  onFinish,
  progressIntervalMs = 150,
  paused = false,
  timeLimitSeconds,
  onKeystroke,
}: UseTypingEngineOptions): HookReturn {
  /*
   * The engine state lives in a ref because we want to mutate it from a global
   * keydown listener WITHOUT going through React's setState batching — keystrokes
   * are fast enough that batched updates can drop characters under load.
   * We use a useReducer just as a "force re-render" trigger when the state changes.
   */
  const stateRef = useRef<EngineState>(init(text));
  const lastEmittedAtRef = useRef<number>(0);
  const finishedFiredRef = useRef<boolean>(false);
  const lastKeyAtRef = useRef<number>(0);
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  const reset = useCallback((nextText?: string): void => {
    stateRef.current = init(nextText ?? text);
    lastEmittedAtRef.current = 0;
    finishedFiredRef.current = false;
    lastKeyAtRef.current = 0;
    forceRender();
  }, [text]);

  // Reset when the text prop changes.
  useEffect(() => {
    reset(text);
  }, [text, reset]);

  // Global keyboard listener.
  useEffect(() => {
    if (paused) return;

    const handleKey = (event: KeyboardEvent): void => {
      // Skip browser shortcuts.
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const now = performance.now();
      const prev = stateRef.current;
      let next: EngineState | null = null;

      if (event.key === 'Backspace') {
        next = backspace(prev);
        event.preventDefault();
      } else if (event.key.length === 1) {
        next = typeChar(prev, event.key, now);
        event.preventDefault();
      }

      if (!next || next === prev) return;

      // Fire keystroke callback BEFORE forceRender so audio latency stays
      // minimal. Only fires on printable keys (not backspace) — wasCorrect
      // is read from the slot we just wrote.
      if (onKeystroke && next.position > prev.position) {
        const status = next.status[prev.position];
        onKeystroke(status === 'correct');
      }

      stateRef.current = next;
      lastKeyAtRef.current = now;
      forceRender();

      // Throttled onProgress emission.
      if (
        onProgress &&
        now - lastEmittedAtRef.current >= progressIntervalMs &&
        !isFinished(next)
      ) {
        lastEmittedAtRef.current = now;
        onProgress({ state: next, metrics: computeMetrics(next, now) });
      }

      // Final snapshot exactly once.
      if (isFinished(next) && !finishedFiredRef.current) {
        finishedFiredRef.current = true;
        const snapshot = { state: next, metrics: computeMetrics(next, now) };
        onProgress?.(snapshot);
        onFinish?.(snapshot);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [paused, onProgress, onFinish, onKeystroke, progressIntervalMs]);

  // Live tick for WPM updates while typing (so paused players see WPM drop).
  useEffect(() => {
    const state = stateRef.current;
    if (state.startedAt === null || isFinished(state)) return;
    const id = setInterval(forceRender, 200);
    return () => clearInterval(id);
  }, [stateRef.current.startedAt, stateRef.current.finishedAt]);

  // Time mode: end the race after timeLimitSeconds from the first keystroke.
  // Re-runs whenever startedAt or the limit changes — startedAt is read from
  // the ref because the engine state lives there; this is intentional.
  useEffect(() => {
    if (!timeLimitSeconds) return;
    const startedAt = stateRef.current.startedAt;
    if (startedAt === null) return;
    if (stateRef.current.finishedAt !== null) return;

    const fire = (): void => {
      if (stateRef.current.finishedAt !== null) return;
      const now = performance.now();
      stateRef.current = finish(stateRef.current, now);
      finishedFiredRef.current = true;
      forceRender();
      const snapshot = { state: stateRef.current, metrics: computeMetrics(stateRef.current, now) };
      onFinish?.(snapshot);
    };

    const remaining = timeLimitSeconds * 1000 - (performance.now() - startedAt);
    if (remaining <= 0) {
      fire();
      return;
    }
    const id = setTimeout(fire, remaining);
    return () => clearTimeout(id);
  }, [timeLimitSeconds, stateRef.current.startedAt, onFinish]);

  const state = stateRef.current;
  const metrics = computeMetrics(state, performance.now());
  const isActive = performance.now() - lastKeyAtRef.current < 300;

  return { state, metrics, isActive, reset };
}
