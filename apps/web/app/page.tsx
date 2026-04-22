'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { generateText } from '@monkey-type/shared/textgen';
import { TypingArea } from '@/components/TypingArea';
import { useTypingEngine } from '@/lib/typing/useTypingEngine';

const WORDS_PER_RACE = 25;

export default function Home() {
  /*
   * Generating the text on the client (in an effect) avoids a hydration
   * mismatch — Math.random() during SSR would produce one text on the
   * server and a different one on the client, causing React to bail out.
   * On the client-first render we show "loading" briefly, then the real text.
   */
  const [text, setText] = useState<string | null>(null);

  const newText = useCallback(() => {
    setText(generateText(WORDS_PER_RACE));
  }, []);

  useEffect(() => {
    newText();
  }, [newText]);

  // Tab key globally restarts (Monkeytype convention).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        newText();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newText]);

  if (text === null) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-sub font-mono">
        loading…
      </main>
    );
  }

  return <Race text={text} onNewText={newText} />;
}

function Race({ text, onNewText }: { text: string; onNewText: () => void }) {
  const { state, metrics, isActive } = useTypingEngine({ text });

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-12 px-6 py-10">
      {state.finishedAt !== null ? (
        <Results
          wpm={metrics.wpm}
          rawWpm={metrics.rawWpm}
          accuracy={metrics.accuracy}
          onRestart={onNewText}
        />
      ) : (
        <TypingArea state={state} metrics={metrics} isIdle={!isActive} />
      )}

      <div className="flex flex-col items-center gap-3 font-mono text-sm text-sub">
        <p>press <Kbd>tab</Kbd> for a new text</p>
        <Link
          href="/play"
          className="text-sub underline-offset-4 hover:text-main hover:underline"
        >
          play with friends →
        </Link>
      </div>
    </main>
  );
}

function Results({
  wpm, rawWpm, accuracy, onRestart,
}: {
  wpm: number; rawWpm: number; accuracy: number; onRestart: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-8 font-mono">
      <div className="flex items-baseline gap-10">
        <Stat label="wpm" value={wpm} highlight />
        <Stat label="raw" value={rawWpm} />
        <Stat label="acc" value={`${accuracy.toFixed(1)}%`} />
      </div>
      <button
        type="button"
        onClick={onRestart}
        className="rounded bg-sub-alt px-6 py-2 text-text transition-colors hover:bg-main hover:text-bg"
      >
        next text
      </button>
    </div>
  );
}

function Stat({
  label, value, highlight = false,
}: {
  label: string; value: string | number; highlight?: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <span
        className={`tabular-nums ${highlight ? 'text-5xl text-main' : 'text-3xl text-text'}`}
      >
        {value}
      </span>
      <span className="text-sm text-sub">{label}</span>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded bg-sub-alt px-2 py-0.5 text-text">{children}</kbd>
  );
}
