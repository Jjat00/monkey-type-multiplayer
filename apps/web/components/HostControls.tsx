'use client';

import type { PlayerPublic, RaceConfig } from '@monkey-type/shared';
import { ConfigBar } from '@/components/ConfigBar';

interface HostControlsProps {
  config: RaceConfig;
  onConfigChange: (next: RaceConfig) => void;
  players: PlayerPublic[];
  selfId: string | null;
  hostPlayerId: string | null;
  onStart: () => void;
  onKick: (playerId: string) => void;
}

/**
 * Admin-only lobby UI. Shows the editable config, the player roster with
 * kick buttons, a readiness indicator, and the start button.
 *
 * The host doesn't toggle "ready" themselves — they trigger `start`
 * directly. The readiness indicator counts non-host players only.
 */
export function HostControls({
  config,
  onConfigChange,
  players,
  selfId,
  hostPlayerId,
  onStart,
  onKick,
}: HostControlsProps) {
  const others = players.filter((p) => p.id !== hostPlayerId);
  const readyCount = others.filter((p) => p.ready).length;
  const totalOthers = others.length;
  const allReady = totalOthers === 0 || readyCount === totalOthers;

  return (
    <div className="flex w-full max-w-xl flex-col items-stretch gap-6">
      <section className="flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wider text-sub">race config</span>
        <ConfigBar value={config} onChange={onConfigChange} />
      </section>

      <section className="flex flex-col gap-2">
        <header className="flex items-center justify-between text-xs uppercase tracking-wider text-sub">
          <span>players</span>
          <span>
            {totalOthers === 0
              ? 'waiting for someone to join'
              : `${readyCount}/${totalOthers} ready`}
          </span>
        </header>
        <ul className="flex flex-col gap-2">
          {players.map((p) => {
            const isHost = p.id === hostPlayerId;
            const isSelf = p.id === selfId;
            return (
              <li
                key={p.id}
                className="flex items-center justify-between rounded bg-sub-alt px-4 py-2"
              >
                <span className="flex items-center gap-2">
                  {isHost ? (
                    <span title="host" aria-label="host">👑</span>
                  ) : (
                    <span
                      className={`size-2 rounded-full ${p.ready ? 'bg-main' : 'bg-sub'}`}
                      aria-label={p.ready ? 'ready' : 'not ready'}
                    />
                  )}
                  <span className="text-text">{p.nickname}</span>
                  {isSelf && <span className="text-xs text-sub">(you)</span>}
                </span>
                {!isHost && (
                  <button
                    type="button"
                    onClick={() => onKick(p.id)}
                    className="text-xs text-sub transition-colors hover:text-error"
                    aria-label={`Kick ${p.nickname}`}
                  >
                    kick
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <button
        type="button"
        onClick={onStart}
        disabled={players.length === 0}
        className={`rounded px-6 py-3 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          allReady
            ? 'bg-main text-bg hover:brightness-110'
            : 'bg-sub-alt text-text hover:bg-main hover:text-bg'
        }`}
      >
        {allReady ? 'start race' : `start anyway (${readyCount}/${totalOthers} ready)`}
      </button>
    </div>
  );
}
