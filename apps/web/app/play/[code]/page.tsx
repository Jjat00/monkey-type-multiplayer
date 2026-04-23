'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import type {
  ClientMessage,
  PlayerPublic,
  RaceConfig,
  RaceResult,
} from '@monkey-type/shared';
import { CopyButton } from '@/components/CopyButton';
import { HostControls } from '@/components/HostControls';
import { TypingArea } from '@/components/TypingArea';
import { isValidRoomCode } from '@/lib/room/code';
import {
  type PeerProgress,
  type UseRoomConnectionReturn,
  useRoomConnection,
} from '@/lib/room/useRoomConnection';
import { useSound } from '@/lib/sound/SoundProvider';
import {
  generateGuestNickname,
  getNickname,
  setNickname,
} from '@/lib/storage/nickname';
import {
  type ProgressSnapshot,
  useTypingEngine,
} from '@/lib/typing/useTypingEngine';

/**
 * Wrapper exists only to put `useSearchParams` inside a Suspense boundary —
 * required by Next.js 16 so the page can be statically prerendered without
 * bailing out to client-side rendering. The inner component holds all logic.
 */
export default function LobbyPageWrapper() {
  return (
    <Suspense fallback={null}>
      <LobbyPage />
    </Suspense>
  );
}

function LobbyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ code: string }>();
  const rawCode = params.code ?? '';
  const code = rawCode.toUpperCase();
  const asSpectator = searchParams?.get('spectate') === '1';

  const [nickname, setNick] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  // After hydration, fall back to a random guest nickname if none is stored.
  // No prompt — joining straight from a shared link should "just work".
  useEffect(() => {
    const stored = getNickname();
    const resolved = stored.length > 0 ? stored : generateGuestNickname();
    setNick(resolved);
    if (stored.length === 0) setNickname(resolved);
    setShareUrl(window.location.href);
    setHydrated(true);
  }, []);

  // Callback signature is `(reason: string) => void` but we don't surface
  // the reason yet — assignment-compatible since `() => void` widens to it.
  const onKicked = useCallback(() => {
    router.push('/play?notice=kicked');
  }, [router]);

  const conn = useRoomConnection({
    code,
    nickname,
    enabled: hydrated && nickname.length > 0,
    asSpectator,
    onKicked,
  });

  if (!isValidRoomCode(code)) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 font-mono text-text">
        <p className="text-error">invalid room code: {rawCode}</p>
        <button
          type="button"
          onClick={() => router.push('/play')}
          className="rounded bg-sub-alt px-4 py-2 hover:bg-main hover:text-bg"
        >
          go back
        </button>
      </main>
    );
  }

  const status = conn.room?.status ?? 'lobby';
  const role = conn.selfRole;

  return (
    <main className="flex flex-1 flex-col items-center justify-start gap-10 px-6 py-12 font-mono">
      <header className="flex flex-col items-center gap-3">
        <span className="text-sm uppercase tracking-widest text-sub">
          room{role === 'spectator' && ' • spectating'}
        </span>
        <h1 className="text-5xl tabular-nums tracking-widest text-main">{code}</h1>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <CopyButton value={code} label="copy code" />
          {shareUrl && <CopyButton value={shareUrl} label="copy link" />}
        </div>
        <ConnectionBadge status={conn.status} />
      </header>

      {conn.error && <p className="text-sm text-error">{conn.error}</p>}

      {status === 'lobby' && conn.room && (
        <div key="lobby" className="phase-in flex w-full flex-col items-center gap-10">
          {role === 'host' ? (
            <HostControls
              config={conn.room.config}
              onConfigChange={(next) => conn.send({ type: 'update_config', config: next })}
              players={conn.room.players}
              selfId={conn.selfId}
              hostPlayerId={conn.room.hostPlayerId}
              onStart={() => conn.send({ type: 'start' })}
              onKick={(playerId) => conn.send({ type: 'kick', targetPlayerId: playerId })}
            />
          ) : role === 'spectator' ? (
            <SpectatorLobbyView conn={conn} />
          ) : (
            <PlayerLobbyView conn={conn} shareUrl={shareUrl} />
          )}
        </div>
      )}

      {status === 'countdown' && (
        <div key="countdown" className="phase-in">
          <CountdownView seconds={conn.countdown} />
        </div>
      )}

      {status === 'racing' && conn.raceText !== null && conn.room && (
        <div key="racing" className="phase-in w-full max-w-4xl">
          {role === 'spectator' ? (
            <SpectatorRaceView
              text={conn.raceText}
              players={conn.room.players}
              peers={conn.peers}
              config={conn.room.config}
              raceStartedAt={conn.raceStartedAt}
            />
          ) : (
            <RaceView
              text={conn.raceText}
              players={conn.room.players}
              peers={conn.peers}
              selfId={conn.selfId}
              send={conn.send}
              config={conn.room.config}
              raceStartedAt={conn.raceStartedAt}
            />
          )}
        </div>
      )}

      {status === 'finished' && conn.results !== null && (
        <div key="finished" className="phase-in">
          <ResultsView
            results={conn.results}
            selfId={conn.selfId}
            isHost={role === 'host'}
            onNextRace={() => conn.send({ type: 'next_race' })}
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => router.push('/play')}
        className="text-sm text-sub hover:text-text"
      >
        ← leave room
      </button>
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Lobby variants
// ────────────────────────────────────────────────────────────────────────

function PlayerLobbyView({
  conn,
}: {
  conn: UseRoomConnectionReturn;
  /** shareUrl kept in the signature for call-site parity; copy button now lives in the header. */
  shareUrl: string;
}) {
  const players = conn.room?.players ?? [];
  const self = players.find((p) => p.id === conn.selfId);
  const config = conn.room?.config;
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      {config && <ConfigDisplay config={config} />}
      <PlayerList
        players={players}
        selfId={conn.selfId}
        hostPlayerId={conn.room?.hostPlayerId ?? null}
      />
      <ReadyToggle
        currentlyReady={self?.ready ?? false}
        disabled={conn.status !== 'open'}
        onToggle={(next) => conn.send({ type: 'ready', ready: next })}
      />
      <p className="text-xs text-sub">waiting for the host to start the race</p>
    </div>
  );
}

function SpectatorLobbyView({ conn }: { conn: UseRoomConnectionReturn }) {
  const players = conn.room?.players ?? [];
  const config = conn.room?.config;
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      {config && <ConfigDisplay config={config} />}
      <PlayerList
        players={players}
        selfId={null}
        hostPlayerId={conn.room?.hostPlayerId ?? null}
      />
      <p className="text-sm text-sub">
        you&apos;re spectating — the race will appear here when the host starts it
      </p>
    </div>
  );
}

function ConfigDisplay({ config }: { config: RaceConfig }) {
  const count = config.mode === 'words' ? `${config.wordCount} words` : `${config.timeSeconds}s`;
  return (
    <p className="text-xs text-sub">
      mode: <span className="text-text">{count}</span>
      {config.punctuation && <> • <span className="text-text">@ punctuation</span></>}
    </p>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Countdown / Race / Spectator race / Results
// ────────────────────────────────────────────────────────────────────────

function CountdownView({ seconds }: { seconds: number | null }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16">
      <span className="text-sm uppercase tracking-widest text-sub">starting in</span>
      <span className="text-9xl font-bold tabular-nums text-main">
        {seconds === 0 ? 'go' : seconds ?? '—'}
      </span>
    </div>
  );
}

function RaceView({
  text, players, peers, selfId, send, config, raceStartedAt,
}: {
  text: string;
  players: PlayerPublic[];
  peers: Record<string, PeerProgress>;
  selfId: string | null;
  send: (msg: ClientMessage) => void;
  config: RaceConfig;
  raceStartedAt: number | null;
}) {
  const onProgress = useCallback((snap: ProgressSnapshot) => {
    send({
      type: 'progress',
      charIndex: snap.state.position,
      errors: snap.state.errors,
      wpm: snap.metrics.wpm,
    });
  }, [send]);

  const onFinish = useCallback((snap: ProgressSnapshot) => {
    const startedAtClient = snap.state.startedAt ?? performance.now();
    const finishedAtClient = snap.state.finishedAt ?? performance.now();
    send({
      type: 'finish',
      timeMs: Math.max(1, Math.floor(finishedAtClient - startedAtClient)),
      wpm: snap.metrics.wpm,
      accuracy: snap.metrics.accuracy,
    });
  }, [send]);

  const { playKey } = useSound();
  const { state, metrics, isActive, forceFinish } = useTypingEngine({
    text,
    onProgress,
    onFinish,
    onKeystroke: (correct) => playKey(!correct),
  });

  const isTimeMode = config.mode === 'time';
  const timeRemaining = useServerCountdown(isTimeMode, raceStartedAt, config.timeSeconds);

  // In multiplayer time mode the countdown is anchored to the SERVER's
  // raceStartedAt — not the first local keystroke — so every participant
  // finishes at the same wall-clock instant. When the countdown hits 0
  // we force the engine to finish locally, which sends the `finish` msg.
  useEffect(() => {
    if (!isTimeMode || raceStartedAt === null) return;
    const endAt = raceStartedAt + config.timeSeconds * 1000;
    const msLeft = endAt - Date.now();
    if (msLeft <= 0) {
      forceFinish();
      return;
    }
    const id = setTimeout(forceFinish, msLeft);
    return () => clearTimeout(id);
  }, [isTimeMode, raceStartedAt, config.timeSeconds, forceFinish]);

  return (
    <div className="flex w-full max-w-4xl flex-col items-center gap-8">
      <PeerProgressBars
        text={text}
        players={players}
        peers={peers}
        selfId={selfId}
        selfCharIndex={state.position}
        selfWpm={metrics.wpm}
        isTimeMode={isTimeMode}
      />
      <TypingArea
        state={state}
        metrics={metrics}
        isIdle={!isActive}
        timeRemaining={timeRemaining}
      />
    </div>
  );
}

function SpectatorRaceView({
  text, players, peers, config, raceStartedAt,
}: {
  text: string;
  players: PlayerPublic[];
  peers: Record<string, PeerProgress>;
  config: RaceConfig;
  raceStartedAt: number | null;
}) {
  const isTimeMode = config.mode === 'time';
  const timeRemaining = useServerCountdown(isTimeMode, raceStartedAt, config.timeSeconds);

  return (
    <div className="flex w-full max-w-4xl flex-col items-center gap-8">
      {timeRemaining !== null && (
        <div className="flex items-baseline gap-2 font-mono">
          <span className="text-4xl tabular-nums text-main">{timeRemaining}</span>
          <span className="text-sm text-sub">s left</span>
        </div>
      )}
      <PeerProgressBars
        text={text}
        players={players}
        peers={peers}
        selfId={null}
        selfCharIndex={0}
        selfWpm={0}
        isTimeMode={isTimeMode}
      />
      <p className="text-xs uppercase tracking-wider text-sub">watching live</p>
    </div>
  );
}

/**
 * Seconds-left countdown derived from the server's raceStartedAt. Ticks
 * every 200ms (smoother than 1s, still cheap). Returns null in words mode.
 */
function useServerCountdown(
  isTimeMode: boolean,
  raceStartedAt: number | null,
  timeSeconds: number,
): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!isTimeMode || raceStartedAt === null) {
      setRemaining(null);
      return;
    }
    const endAt = raceStartedAt + timeSeconds * 1000;
    const tick = (): void => {
      const secs = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setRemaining(secs);
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [isTimeMode, raceStartedAt, timeSeconds]);

  return remaining;
}

function PeerProgressBars({
  text, players, peers, selfId, selfCharIndex, selfWpm, isTimeMode = false,
}: {
  text: string;
  players: PlayerPublic[];
  peers: Record<string, PeerProgress>;
  selfId: string | null;
  selfCharIndex: number;
  selfWpm: number;
  /**
   * In time mode the text is a 250-word buffer no one reaches, so a raw
   * `charIndex / text.length` produces tiny unreadable bars. Instead the
   * bars scale relative to the current leader — whoever typed most has a
   * full bar, everyone else is relative to them.
   */
  isTimeMode?: boolean;
}) {
  // Gather effective charIndex per player (self comes from live engine, others from peers/room).
  const charIndexOf = (p: PlayerPublic): number => {
    if (selfId !== null && p.id === selfId) return selfCharIndex;
    return peers[p.id]?.charIndex ?? p.charIndex;
  };

  const total = isTimeMode
    ? Math.max(1, ...players.map(charIndexOf))
    : Math.max(1, text.length);

  return (
    <ul className="flex w-full flex-col gap-2">
      {players.map((p) => {
        const isSelf = selfId !== null && p.id === selfId;
        const charIndex = charIndexOf(p);
        const wpm = isSelf
          ? selfWpm
          : (peers[p.id]?.wpm ?? p.wpm);
        const finished = p.finishedAt !== null;
        const pct = Math.min(100, (charIndex / total) * 100);
        return (
          <li key={p.id} className="flex items-center gap-3 text-xs">
            <span className={`w-28 truncate ${isSelf ? 'text-main' : 'text-text'}`}>
              {p.nickname}{isSelf && ' (you)'}
            </span>
            <div className="relative h-2 flex-1 overflow-hidden rounded bg-sub-alt">
              <div
                className={`h-full transition-[width] duration-100 ease-linear ${
                  finished ? 'bg-text' : isSelf ? 'bg-main' : 'bg-sub'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-14 text-right tabular-nums text-sub">
              {wpm > 0 ? `${wpm} wpm` : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ResultsView({
  results, selfId, isHost, onNextRace,
}: {
  results: RaceResult[];
  selfId: string | null;
  isHost: boolean;
  onNextRace: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-8">
      <h2 className="text-2xl text-text">results</h2>
      <ol className="flex w-96 flex-col gap-2">
        {results.map((r) => {
          const isSelf = r.playerId === selfId;
          return (
            <li
              key={r.playerId}
              className={`flex items-center justify-between rounded px-4 py-3 ${
                isSelf ? 'bg-main text-bg' : 'bg-sub-alt text-text'
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="text-2xl tabular-nums">{r.rank}</span>
                <span>{r.nickname}{isSelf && ' (you)'}</span>
                {!r.finished && <span className="text-xs uppercase text-error">dnf</span>}
              </span>
              <span className="flex items-baseline gap-3 text-sm tabular-nums">
                <span>{r.wpm} wpm</span>
                <span className={isSelf ? 'text-bg/70' : 'text-sub'}>
                  {r.accuracy.toFixed(1)}%
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      {isHost ? (
        <button
          type="button"
          onClick={onNextRace}
          className="rounded bg-main px-6 py-3 font-semibold text-bg hover:brightness-110"
        >
          next race
        </button>
      ) : (
        <p className="text-sm text-sub">waiting for the host to start the next race</p>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Shared bits
// ────────────────────────────────────────────────────────────────────────

function ConnectionBadge({ status }: { status: string }) {
  const label = ({
    idle: 'idle',
    connecting: 'connecting…',
    open: 'connected',
    closed: 'disconnected',
    error: 'connection error',
  } as const)[status as 'idle' | 'connecting' | 'open' | 'closed' | 'error'] ?? status;

  const color =
    status === 'open' ? 'text-text'
    : status === 'connecting' ? 'text-sub'
    : 'text-error';

  return <span className={`text-xs uppercase tracking-wider ${color}`}>{label}</span>;
}

function PlayerList({
  players, selfId, hostPlayerId,
}: {
  players: PlayerPublic[];
  selfId: string | null;
  hostPlayerId: string | null;
}) {
  if (players.length === 0) {
    return <p className="text-sub">no players yet</p>;
  }
  return (
    <ul className="flex w-full flex-col gap-2">
      {players.map((p) => {
        const isHost = p.id === hostPlayerId;
        return (
          <li
            key={p.id}
            className="flex items-center justify-between rounded bg-sub-alt px-4 py-3"
          >
            <span className="flex items-center gap-2">
              {isHost ? (
                <span title="host" aria-label="host">👑</span>
              ) : (
                <span className={`size-2 rounded-full ${p.ready ? 'bg-main' : 'bg-sub'}`} />
              )}
              <span className="text-text">{p.nickname}</span>
              {p.id === selfId && <span className="text-xs text-sub">(you)</span>}
            </span>
            {!isHost && (
              <span className={`text-xs uppercase tracking-wider ${p.ready ? 'text-main' : 'text-sub'}`}>
                {p.ready ? 'ready' : 'not ready'}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ReadyToggle({
  currentlyReady, disabled, onToggle,
}: {
  currentlyReady: boolean; disabled: boolean; onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onToggle(!currentlyReady)}
      className={`w-72 rounded px-6 py-3 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50
        ${currentlyReady
          ? 'bg-sub-alt text-text hover:bg-error hover:text-bg'
          : 'bg-main text-bg hover:brightness-110'}`}
    >
      {currentlyReady ? 'cancel ready' : 'ready'}
    </button>
  );
}

