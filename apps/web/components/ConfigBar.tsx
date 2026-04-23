'use client';

import { useSettings } from '@/lib/settings/SettingsProvider';
import {
  TIME_SECONDS,
  WORD_COUNTS,
  type Mode,
  type TimeSeconds,
  type WordCount,
} from '@/lib/settings/types';

/**
 * Monkeytype-style horizontal config bar shown above the typing area in
 * solo-practice. Sections are separated by faint dividers; active options
 * are highlighted with the theme's main color.
 */
export function ConfigBar() {
  const { settings, update } = useSettings();
  const counts = settings.mode === 'words' ? WORD_COUNTS : TIME_SECONDS;

  return (
    <div className="mb-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-md bg-sub-alt px-4 py-2 font-mono text-xs">
      <ConfigButton
        active={settings.punctuation}
        onClick={() => update({ punctuation: !settings.punctuation })}
        ariaLabel={`Punctuation ${settings.punctuation ? 'on' : 'off'}`}
      >
        @ punctuation
      </ConfigButton>

      <Divider />

      <ConfigButton
        active={settings.mode === 'words'}
        onClick={() => update({ mode: 'words' })}
        ariaLabel="Words mode"
      >
        A words
      </ConfigButton>
      <ConfigButton
        active={settings.mode === 'time'}
        onClick={() => update({ mode: 'time' })}
        ariaLabel="Time mode"
      >
        ⏱ time
      </ConfigButton>

      <Divider />

      {counts.map((n) => {
        const active =
          settings.mode === 'words'
            ? settings.wordCount === n
            : settings.timeSeconds === n;
        return (
          <ConfigButton
            key={n}
            active={active}
            onClick={() =>
              settings.mode === 'words'
                ? update({ wordCount: n as WordCount })
                : update({ timeSeconds: n as TimeSeconds })
            }
            ariaLabel={`${settings.mode === 'words' ? 'Word count' : 'Time seconds'}: ${n}`}
          >
            {n}
          </ConfigButton>
        );
      })}
    </div>
  );
}

function ConfigButton({
  active,
  onClick,
  ariaLabel,
  children,
}: {
  active: boolean;
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={`rounded px-2 py-1 transition-colors ${
        active ? 'text-main' : 'text-sub hover:text-text'
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="h-4 w-px bg-sub/40" aria-hidden="true" />;
}

// Re-exported for convenience so consumers can import both from one place.
export type { Mode };
