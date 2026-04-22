'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import type { PlayerPublic } from '@monkey-type/shared';
import { isValidRoomCode } from '@/lib/room/code';
import { useRoomConnection } from '@/lib/room/useRoomConnection';
import {
  NICKNAME_MAX_LENGTH,
  getNickname,
  setNickname,
} from '@/lib/storage/nickname';

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

  const { status, room, selfId, send, error } = useRoomConnection({
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

  return (
    <main className="flex min-h-dvh flex-col items-center justify-start gap-10 px-6 py-16 font-mono">
      <header className="flex flex-col items-center gap-2">
        <span className="text-sm uppercase tracking-widest text-sub">room</span>
        <h1 className="text-5xl tabular-nums tracking-widest text-main">{code}</h1>
        <ConnectionBadge status={status} />
      </header>

      {error && <p className="text-sm text-error">{error}</p>}

      <PlayerList players={room?.players ?? []} selfId={selfId} />

      <ReadyToggle
        currentlyReady={getSelf(room?.players ?? [], selfId)?.ready ?? false}
        disabled={status !== 'open'}
        onToggle={(next) => send({ type: 'ready', ready: next })}
      />

      <p className="text-xs text-sub">
        share this URL: <span className="text-text">{shareUrl}</span>
      </p>

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

function getSelf(players: PlayerPublic[], selfId: string | null): PlayerPublic | undefined {
  if (!selfId) return undefined;
  return players.find((p) => p.id === selfId);
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

function PlayerList({ players, selfId }: { players: PlayerPublic[]; selfId: string | null }) {
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
