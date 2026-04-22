'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import type { CharStatus, EngineState, Metrics } from '@/lib/typing/engine';

interface TypingAreaProps {
  state: EngineState;
  metrics: Metrics;
  /** When true, caret blinks (player idle); when false it stays solid (active). */
  isIdle: boolean;
}

/**
 * Group the text into word and space tokens so we can make each word an
 * inline-block (won't wrap mid-word) while spaces remain natural wrap points.
 * Each token carries the ABSOLUTE character positions so the caret stays in
 * sync with engine state.
 */
type Token =
  | { kind: 'word'; chars: { char: string; pos: number }[] }
  | { kind: 'space'; pos: number };

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let buf: { char: string; pos: number }[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === ' ') {
      if (buf.length) { out.push({ kind: 'word', chars: buf }); buf = []; }
      out.push({ kind: 'space', pos: i });
    } else {
      buf.push({ char: c, pos: i });
    }
  }
  if (buf.length) out.push({ kind: 'word', chars: buf });
  return out;
}

function charClass(status: CharStatus | null): string {
  if (status === 'correct') return 'text-text';
  if (status === 'incorrect') return 'text-error';
  return 'text-sub';
}

export function TypingArea({ state, metrics, isIdle }: TypingAreaProps) {
  const tokens = useMemo(() => tokenize(state.text), [state.text]);
  const containerRef = useRef<HTMLDivElement>(null);
  const charRefs = useRef<(HTMLSpanElement | null)[]>([]);

  return (
    <div className="w-full max-w-4xl">
      <Hud metrics={metrics} started={state.startedAt !== null} />

      <div
        ref={containerRef}
        className="typing-area relative font-mono text-3xl leading-relaxed select-none"
        tabIndex={0}
      >
        {tokens.map((tok, i) =>
          tok.kind === 'word' ? (
            <span key={`w-${i}`} className="inline-block whitespace-nowrap">
              {tok.chars.map(({ char, pos }) => (
                <span
                  key={pos}
                  ref={(el) => { charRefs.current[pos] = el; }}
                  className={charClass(state.status[pos] ?? null)}
                >
                  {char}
                </span>
              ))}
            </span>
          ) : (
            <span
              key={`s-${tok.pos}`}
              ref={(el) => { charRefs.current[tok.pos] = el; }}
              className={charClass(state.status[tok.pos] ?? null)}
            >
              {' '}
            </span>
          ),
        )}

        <Caret
          containerRef={containerRef}
          targetEl={charRefs.current[state.position] ?? null}
          isIdle={isIdle}
          isFinished={state.finishedAt !== null}
        />
      </div>
    </div>
  );
}

interface CaretProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  targetEl: HTMLSpanElement | null;
  isIdle: boolean;
  isFinished: boolean;
}

function Caret({ containerRef, targetEl, isIdle, isFinished }: CaretProps) {
  const caretRef = useRef<HTMLSpanElement>(null);

  /*
   * Caret position is a DOM concern, not React state. We measure on every
   * render and write directly to style — no setState, no re-render trigger,
   * so this effect is safe without a deps array (cheap getBoundingClientRect
   * calls that never feed back into React's update cycle).
   */
  useLayoutEffect(() => {
    const caret = caretRef.current;
    const container = containerRef.current;
    if (!caret || !container || !targetEl) return;
    const t = targetEl.getBoundingClientRect();
    const c = container.getBoundingClientRect();
    caret.style.transform = `translate(${t.left - c.left}px, ${t.top - c.top}px)`;
    caret.style.height = `${t.height}px`;
  });

  if (isFinished) return null;

  return (
    <span
      ref={caretRef}
      aria-hidden="true"
      className={`caret ${isIdle ? 'caret--idle' : ''}`}
    />
  );
}

function Hud({ metrics, started }: { metrics: Metrics; started: boolean }) {
  return (
    <div className="mb-6 flex items-baseline gap-6 font-mono text-sub">
      <span className="text-2xl text-main tabular-nums">
        {started ? metrics.wpm : '—'}
        <span className="ml-1 text-base text-sub">wpm</span>
      </span>
      <span className="text-base tabular-nums">
        {started ? `${metrics.accuracy.toFixed(1)}%` : '—'}
        <span className="ml-1 text-sub">acc</span>
      </span>
    </div>
  );
}
