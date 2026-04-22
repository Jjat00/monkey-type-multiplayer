'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  type EngineState,
  type Metrics,
  backspace,
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
  }, [paused, onProgress, onFinish, progressIntervalMs]);

  // Live tick for WPM updates while typing (so paused players see WPM drop).
  useEffect(() => {
    const state = stateRef.current;
    if (state.startedAt === null || isFinished(state)) return;
    const id = setInterval(forceRender, 200);
    return () => clearInterval(id);
  }, [stateRef.current.startedAt, stateRef.current.finishedAt]);

  const state = stateRef.current;
  const metrics = computeMetrics(state, performance.now());
  const isActive = performance.now() - lastKeyAtRef.current < 300;

  return { state, metrics, isActive, reset };
}
