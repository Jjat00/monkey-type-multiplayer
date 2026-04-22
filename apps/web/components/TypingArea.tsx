'use client';

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CharStatus, EngineState, Metrics } from '@/lib/typing/engine';

interface TypingAreaProps {
  state: EngineState;
  metrics: Metrics;
  /** When true, caret blinks (player idle); when false it stays solid (active). */
  isIdle: boolean;
}

/** How many lines the typing window shows at once before the text starts scrolling. */
const VISIBLE_LINES = 3;
/** Which 0-indexed line the caret tries to stay on (1 = second line, Monkeytype style). */
const ANCHOR_LINE = 1;

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
  const scrollerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const charRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // Measure line-height once after first render. Using state (not just a ref)
  // because the scroller's `height` style depends on it for the first paint.
  const [lineHeight, setLineHeight] = useState(48);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const computed = parseFloat(getComputedStyle(inner).lineHeight);
    if (Number.isFinite(computed) && computed > 0) {
      setLineHeight(computed);
    }
  }, []);

  // Translate the inner wrapper so the caret line ends up at ANCHOR_LINE.
  // Runs every render (no deps) — cheap measurements, no React state derived.
  useLayoutEffect(() => {
    const inner = innerRef.current;
    const target = charRefs.current[state.position] ?? charRefs.current[state.position - 1];
    if (!inner || !target) {
      if (inner) inner.style.transform = 'translateY(0)';
      return;
    }
    // offsetTop is relative to the closest positioned ancestor (inner here),
    // so dividing by lineHeight gives us the line index the char sits on.
    const caretLine = Math.round(target.offsetTop / lineHeight);
    const scroll = Math.max(0, (caretLine - ANCHOR_LINE) * lineHeight);
    inner.style.transform = `translateY(-${scroll}px)`;
  });

  return (
    <div className="w-full max-w-4xl">
      <Hud metrics={metrics} started={state.startedAt !== null} />

      <div
        ref={containerRef}
        className="typing-area relative font-mono text-3xl leading-relaxed select-none"
        tabIndex={0}
      >
        <div
          ref={scrollerRef}
          className="typing-scroller"
          style={{ height: `${lineHeight * VISIBLE_LINES}px` }}
        >
          <div ref={innerRef} className="typing-scroller-inner">
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
          </div>
        </div>

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
   *
   * Because targetEl lives inside the translated scroller-inner, its
   * bounding rect already accounts for the translation — the caret follows
   * the target visually as the text scrolls.
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
