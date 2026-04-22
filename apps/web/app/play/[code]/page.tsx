'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type {
  ClientMessage,
  PlayerPublic,
  RaceResult,
} from '@monkey-type/shared';
import { TypingArea } from '@/components/TypingArea';
import { isValidRoomCode } from '@/lib/room/code';
import {
  type PeerProgress,
  type UseRoomConnectionReturn,
  useRoomConnection,
} from '@/lib/room/useRoomConnection';
import {
  NICKNAME_MAX_LENGTH,
  getNickname,
  setNickname,
} from '@/lib/storage/nickname';
import {
  type ProgressSnapshot,
  useTypingEngine,
} from '@/lib/typing/useTypingEngine';

export default function LobbyPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const rawCode = params.code ?? '';
  const code = rawCode.toUpperCase();

  const [nickname, setNick] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => {
    setNick(getNickname());
    setShareUrl(window.location.href);
    setHydrated(true);
  }, []);

  const conn = useRoomConnection({
    code,
    nickname,
    enabled: hydrated && nickname.length > 0,
  });

  if (!isValidRoomCode(code)) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 font-mono text-text">
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

  if (hydrated && nickname.length === 0) {
    return <NicknamePrompt onSubmit={(n) => { setNickname(n); setNick(n); }} />;
  }

  const status = conn.room?.status ?? 'lobby';

  return (
    <main className="flex min-h-dvh flex-col items-center justify-start gap-10 px-6 py-12 font-mono">
      <header className="flex flex-col items-center gap-2">
        <span className="text-sm uppercase tracking-widest text-sub">room</span>
        <h1 className="text-5xl tabular-nums tracking-widest text-main">{code}</h1>
        <ConnectionBadge status={conn.status} />
      </header>

      {conn.error && <p className="text-sm text-error">{conn.error}</p>}

      {status === 'lobby' && (
        <LobbyView conn={conn} shareUrl={shareUrl} />
      )}

      {status === 'countdown' && <CountdownView seconds={conn.countdown} />}

      {status === 'racing' && conn.raceText !== null && (
        <RaceView
          text={conn.raceText}
          players={conn.room?.players ?? []}
          peers={conn.peers}
          selfId={conn.selfId}
          send={conn.send}
        />
      )}

      {status === 'finished' && conn.results !== null && (
        <ResultsView
          results={conn.results}
          selfId={conn.selfId}
          onRematch={() => conn.send({ type: 'rematch' })}
        />
      )}

      <button
        type="button"
        onClick={() => router.push('/')}
        className="text-sm text-sub hover:text-text"
      >
        ← leave room
      </button>
    </main>
  );
}

function LobbyView({
  conn, shareUrl,
}: {
  conn: UseRoomConnectionReturn;
  shareUrl: string;
}) {
  const players = conn.room?.players ?? [];
  const self = players.find((p) => p.id === conn.selfId);
  return (
    <>
      <PlayerList players={players} selfId={conn.selfId} />
      <ReadyToggle
        currentlyReady={self?.ready ?? false}
        disabled={conn.status !== 'open'}
        onToggle={(next) => conn.send({ type: 'ready', ready: next })}
      />
      <p className="text-xs text-sub">
        share this URL: <span className="text-text">{shareUrl}</span>
      </p>
    </>
  );
}

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
  text, players, peers, selfId, send,
}: {
  text: string;
  players: PlayerPublic[];
  peers: Record<string, PeerProgress>;
  selfId: string | null;
  send: (msg: ClientMessage) => void;
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

  const { state, metrics, isActive } = useTypingEngine({
    text,
    onProgress,
    onFinish,
  });

  return (
    <div className="flex w-full max-w-4xl flex-col items-center gap-8">
      <PeerProgressBars
        text={text}
        players={players}
        peers={peers}
        selfId={selfId}
        selfCharIndex={state.position}
        selfWpm={metrics.wpm}
      />
      <TypingArea state={state} metrics={metrics} isIdle={!isActive} />
    </div>
  );
}

function PeerProgressBars({
  text, players, peers, selfId, selfCharIndex, selfWpm,
}: {
  text: string;
  players: PlayerPublic[];
  peers: Record<string, PeerProgress>;
  selfId: string | null;
  selfCharIndex: number;
  selfWpm: number;
}) {
  const total = Math.max(1, text.length);
  return (
    <ul className="flex w-full flex-col gap-2">
      {players.map((p) => {
        const isSelf = p.id === selfId;
        const charIndex = isSelf
          ? selfCharIndex
          : (peers[p.id]?.charIndex ?? p.charIndex);
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
  results, selfId, onRematch,
}: {
  results: RaceResult[];
  selfId: string | null;
  onRematch: () => void;
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
      <button
        type="button"
        onClick={onRematch}
        className="rounded bg-main px-6 py-3 font-semibold text-bg hover:brightness-110"
      >
        next race
      </button>
    </div>
  );
}

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
  players, selfId,
}: {
  players: PlayerPublic[];
  selfId: string | null;
}) {
  if (players.length === 0) {
    return <p className="text-sub">no players yet</p>;
  }
  return (
    <ul className="flex w-80 flex-col gap-2">
      {players.map((p) => (
        <li
          key={p.id}
          className="flex items-center justify-between rounded bg-sub-alt px-4 py-3"
        >
          <span className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${p.ready ? 'bg-main' : 'bg-sub'}`} />
            <span className="text-text">{p.nickname}</span>
            {p.id === selfId && <span className="text-xs text-sub">(you)</span>}
          </span>
          <span className={`text-xs uppercase tracking-wider ${p.ready ? 'text-main' : 'text-sub'}`}>
            {p.ready ? 'ready' : 'not ready'}
          </span>
        </li>
      ))}
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
      className={`w-72 rounded px-6 py-3 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed
        ${currentlyReady
          ? 'bg-sub-alt text-text hover:bg-error hover:text-bg'
          : 'bg-main text-bg hover:brightness-110'}`}
    >
      {currentlyReady ? 'cancel ready' : 'ready'}
    </button>
  );
}

function NicknamePrompt({ onSubmit }: { onSubmit: (nickname: string) => void }) {
  const [value, setValue] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 font-mono">
      <h2 className="text-xl text-text">join the room</h2>
      <form onSubmit={submit} className="flex w-72 flex-col gap-3">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={NICKNAME_MAX_LENGTH}
          placeholder="your nickname"
          className="rounded bg-sub-alt px-3 py-2 text-text outline-none focus:ring-2 focus:ring-main"
        />
        <button
          type="submit"
          className="rounded bg-main py-2 font-semibold text-bg hover:brightness-110"
        >
          join
        </button>
      </form>
    </main>
  );
}
