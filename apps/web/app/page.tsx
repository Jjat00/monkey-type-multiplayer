'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { generateText } from '@monkey-type/shared/textgen';
import { ConfigBar } from '@/components/ConfigBar';
import { TypingArea } from '@/components/TypingArea';
import { useSettings } from '@/lib/settings/SettingsProvider';
import type { Settings } from '@/lib/settings/types';
import { useSound } from '@/lib/sound/SoundProvider';
import { useTypingEngine } from '@/lib/typing/useTypingEngine';

/**
 * For time mode the engine still needs a finite text — we generate enough
 * words that even a fast typist won't run out before the timer expires.
 * 250 words at 100wpm ≈ 150s of typing, comfortable headroom for the 60s max.
 */
const TIME_MODE_BUFFER_WORDS = 250;

export default function Home() {
  const { settings } = useSettings();

  /*
   * Generating the text on the client (in an effect) avoids a hydration
   * mismatch — Math.random() during SSR would produce one text on the
   * server and a different one on the client, causing React to bail out.
   * On the client-first render we show "loading" briefly, then the real text.
   */
  const [text, setText] = useState<string | null>(null);

  const newText = useCallback(() => {
    setText(makeText(settings));
  }, [settings]);

  // Regenerate when any relevant setting changes (mode, count, punctuation).
  useEffect(() => {
    newText();
  }, [newText]);

  // Tab restarts (Monkeytype convention); Esc also restarts as an
  // alternative that doesn't fight with browser focus rings on Tab.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab' || e.key === 'Escape') {
        e.preventDefault();
        newText();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newText]);

  if (text === null) {
    return (
      <main className="flex flex-1 items-center justify-center text-sub font-mono">
        loading…
      </main>
    );
  }

  return <Race text={text} settings={settings} onNewText={newText} />;
}

function makeText(settings: Settings): string {
  const wordCount =
    settings.mode === 'time' ? TIME_MODE_BUFFER_WORDS : settings.wordCount;
  return generateText(wordCount, { punctuation: settings.punctuation });
}

function Race({
  text, settings, onNewText,
}: {
  text: string;
  settings: Settings;
  onNewText: () => void;
}) {
  const { playKey } = useSound();
  const { state, metrics, isActive } = useTypingEngine({
    text,
    timeLimitSeconds: settings.mode === 'time' ? settings.timeSeconds : undefined,
    onKeystroke: (correct) => playKey(!correct),
  });

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-10 px-6 py-10">
      {state.finishedAt !== null ? (
        <Results
          wpm={metrics.wpm}
          rawWpm={metrics.rawWpm}
          accuracy={metrics.accuracy}
          onRestart={onNewText}
        />
      ) : (
        <>
          <ConfigBar />
          <TypingArea
            state={state}
            metrics={metrics}
            isIdle={!isActive}
            timeRemaining={
              settings.mode === 'time'
                ? computeTimeRemaining(state.startedAt, settings.timeSeconds)
                : null
            }
          />
        </>
      )}

      <div className="flex flex-col items-center gap-3 font-mono text-sm text-sub">
        <p>press <Kbd>tab</Kbd> or <Kbd>esc</Kbd> for a new text</p>
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

/**
 * Seconds left in the current race, or `limit` if not started yet, or 0 if
 * past. Returned as a whole-second number — the HUD only shows integers.
 */
function computeTimeRemaining(startedAt: number | null, limit: number): number {
  if (startedAt === null) return limit;
  const remaining = Math.max(0, limit - (performance.now() - startedAt) / 1000);
  return Math.ceil(remaining);
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
