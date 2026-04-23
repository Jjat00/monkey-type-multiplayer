'use client';

import type { RaceConfig } from '@monkey-type/shared';
import { useSettings } from '@/lib/settings/SettingsProvider';
import {
  TIME_SECONDS,
  WORD_COUNTS,
  type Mode,
  type Settings,
  type TimeSeconds,
  type WordCount,
} from '@/lib/settings/types';

export interface ConfigBarProps {
  /**
   * Optional controlled mode — when provided together with `onChange`,
   * the bar drives that value instead of the local settings store.
   * Used in multiplayer rooms where the host's config is server-authoritative.
   */
  value?: RaceConfig;
  onChange?: (next: RaceConfig) => void;
  /** Visually dim and ignore clicks (e.g. non-host viewing the host's config). */
  disabled?: boolean;
}

/**
 * Monkeytype-style horizontal config bar. By default reads/writes the local
 * Settings store (solo-practice). When `value` + `onChange` are passed, it
 * becomes a controlled component driving an external config (multiplayer
 * host).
 */
export function ConfigBar({ value, onChange, disabled = false }: ConfigBarProps = {}) {
  const { settings, update } = useSettings();
  const controlled = value !== undefined && onChange !== undefined;
  const config: RaceConfig = controlled ? value : settings;

  const apply = (partial: Partial<RaceConfig>): void => {
    if (disabled) return;
    if (controlled) onChange({ ...config, ...partial });
    // Safe cast: every call site below builds `partial` from the typed
    // WORD_COUNTS / TIME_SECONDS / Mode unions, so values are within
    // Settings's narrower domain. The wider RaceConfig signature is for
    // controlled mode where the host config comes from the server.
    else update(partial as Partial<Settings>);
  };

  const counts = config.mode === 'words' ? WORD_COUNTS : TIME_SECONDS;

  return (
    <div
      className={`mb-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-md bg-sub-alt px-4 py-2 font-mono text-xs ${
        disabled ? 'pointer-events-none opacity-60' : ''
      }`}
    >
      <ConfigButton
        active={config.punctuation}
        onClick={() => apply({ punctuation: !config.punctuation })}
        ariaLabel={`Punctuation ${config.punctuation ? 'on' : 'off'}`}
      >
        @ punctuation
      </ConfigButton>

      <Divider />

      <ConfigButton
        active={config.mode === 'words'}
        onClick={() => apply({ mode: 'words' })}
        ariaLabel="Words mode"
      >
        A words
      </ConfigButton>
      <ConfigButton
        active={config.mode === 'time'}
        onClick={() => apply({ mode: 'time' })}
        ariaLabel="Time mode"
      >
        ⏱ time
      </ConfigButton>

      <Divider />

      {counts.map((n) => {
        const active =
          config.mode === 'words' ? config.wordCount === n : config.timeSeconds === n;
        return (
          <ConfigButton
            key={n}
            active={active}
            onClick={() =>
              config.mode === 'words'
                ? apply({ wordCount: n as WordCount })
                : apply({ timeSeconds: n as TimeSeconds })
            }
            ariaLabel={`${config.mode === 'words' ? 'Word count' : 'Time seconds'}: ${n}`}
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

export type { Mode };
