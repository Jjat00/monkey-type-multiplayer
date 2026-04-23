'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import type { RoomMeta } from '@monkey-type/shared';
import {
  ROOM_CODE_LENGTH,
  generateRoomCode,
  isValidRoomCode,
} from '@/lib/room/code';
import { useRoomList } from '@/lib/room/useRoomList';
import {
  NICKNAME_MAX_LENGTH,
  getNickname,
  resolveNickname,
  setNickname,
} from '@/lib/storage/nickname';

/**
 * Wrapper exists only to put `useSearchParams` inside a Suspense boundary —
 * required by Next.js 16 so the page can be statically prerendered without
 * bailing out to client-side rendering. The inner component holds all logic.
 */
export default function PlayLandingPage() {
  return (
    <Suspense fallback={null}>
      <PlayLanding />
    </Suspense>
  );
}

function PlayLanding() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const noticeParam = searchParams?.get('notice') ?? null;

  const [nickname, setNick] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { rooms, loading, error: roomsError, refetch } = useRoomList();

  useEffect(() => {
    setNick(getNickname());
  }, []);

  // One-shot toast for kicked / room-closed notices coming back from /play/[code].
  useEffect(() => {
    if (noticeParam === 'kicked') setNotice('you were removed from the room');
    else if (noticeParam === 'closed') setNotice('that room is no longer active');
    if (noticeParam !== null) {
      // Clear the URL so a refresh doesn't re-show the toast.
      const url = new URL(window.location.href);
      url.searchParams.delete('notice');
      window.history.replaceState({}, '', url);
      const t = setTimeout(() => setNotice(null), 4000);
      return () => clearTimeout(t);
    }
  }, [noticeParam]);

  /**
   * Resolve the nickname (auto-generating a guest one if empty), persist it
   * and the input field, then navigate. Centralized so every entry point
   * (create / join card / join-by-code) gets the same behavior.
   */
  const persistAndGo = (code: string, opts: { spectate?: boolean } = {}) => {
    const resolved = resolveNickname(nickname);
    setNickname(resolved);
    if (resolved !== nickname) setNick(resolved);
    setJoinError(null);
    const qs = opts.spectate ? '?spectate=1' : '';
    router.push(`/play/${code}${qs}`);
  };

  const onCreate = () => {
    persistAndGo(generateRoomCode());
  };

  const onJoinRoom = (code: string, status: RoomMeta['status']) => {
    // Rooms in countdown/racing/finished are joinable only as spectator.
    persistAndGo(code, { spectate: status !== 'lobby' });
  };

  const onSpectate = (code: string) => {
    persistAndGo(code, { spectate: true });
  };

  const onJoinByCode = (e: FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code.length === 0) {
      setJoinError('enter a room code first');
      return;
    }
    if (!isValidRoomCode(code)) {
      setJoinError(`code must be ${ROOM_CODE_LENGTH} characters (A–Z, 2–9, no I/O/0/1)`);
      return;
    }
    persistAndGo(code);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-stretch gap-8 px-6 pb-12 pt-24 font-mono">
      {notice && (
        <div className="rounded bg-error/20 px-4 py-3 text-sm text-error">{notice}</div>
      )}

      <header className="flex flex-col items-center gap-1">
        <h1 className="text-2xl text-text">play with friends</h1>
        <p className="text-sm text-sub">create a room or jump into one of the active ones below</p>
      </header>

      <section className="flex flex-col gap-3">
        <label htmlFor="nick" className="text-xs uppercase tracking-wider text-sub">
          nickname <span className="text-sub/70 normal-case tracking-normal">(optional — leave blank for a random one)</span>
        </label>
        <input
          id="nick"
          autoFocus
          value={nickname}
          maxLength={NICKNAME_MAX_LENGTH}
          onChange={(e) => setNick(e.target.value)}
          className="w-full rounded bg-sub-alt px-3 py-2 text-text outline-none focus:ring-2 focus:ring-main"
          placeholder="how should we call you? (optional)"
        />
        {joinError && <p className="text-sm text-error">{joinError}</p>}
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onCreate}
          className="rounded bg-main px-4 py-3 font-semibold text-bg transition-colors hover:brightness-110"
        >
          + create new room
        </button>

        <form onSubmit={onJoinByCode} className="flex gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={ROOM_CODE_LENGTH}
            spellCheck={false}
            className="flex-1 rounded bg-sub-alt px-3 py-2 text-center uppercase tracking-widest text-text outline-none focus:ring-2 focus:ring-main"
            placeholder="enter code"
          />
          <button
            type="submit"
            className="rounded bg-sub-alt px-4 py-2 text-text transition-colors hover:bg-main hover:text-bg"
          >
            join
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <header className="flex items-center justify-between text-xs uppercase tracking-wider text-sub">
          <span>active rooms{rooms.length > 0 && ` (${rooms.length})`}</span>
          <button
            type="button"
            onClick={refetch}
            className="text-sub transition-colors hover:text-text"
            aria-label="refresh room list"
          >
            ↻ refresh
          </button>
        </header>

        {roomsError && (
          <p className="text-sm text-error">couldn&apos;t reach the server: {roomsError}</p>
        )}

        {loading && rooms.length === 0 ? (
          <p className="py-6 text-center text-sm text-sub">loading rooms…</p>
        ) : rooms.length === 0 ? (
          <p className="py-6 text-center text-sm text-sub">
            no active rooms — be the first to create one
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rooms.map((r) => (
              <RoomRow
                key={r.code}
                room={r}
                onJoin={() => onJoinRoom(r.code, r.status)}
                onSpectate={() => onSpectate(r.code)}
              />
            ))}
          </ul>
        )}
      </section>

      <footer className="text-center">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="text-sm text-sub hover:text-text"
        >
          ← back to solo practice
        </button>
      </footer>
    </main>
  );
}

function RoomRow({
  room,
  onJoin,
  onSpectate,
}: {
  room: RoomMeta;
  onJoin: () => void;
  onSpectate: () => void;
}) {
  const inLobby = room.status === 'lobby';
  const modeLabel =
    room.config.mode === 'words'
      ? `${room.config.wordCount} words`
      : `${room.config.timeSeconds}s`;
  const punc = room.config.punctuation ? ' • @ punct' : '';

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded bg-sub-alt px-4 py-3">
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-2 text-sm">
          <span className="truncate text-text">{room.hostNickname}&apos;s room</span>
          <StatusPill status={room.status} />
        </div>
        <div className="text-xs text-sub">
          <span className="font-mono tracking-widest text-main">{room.code}</span>
          {' • '}
          {modeLabel}
          {punc}
          {' • '}
          {room.playerCount} player{room.playerCount === 1 ? '' : 's'}
          {room.spectatorCount > 0 && ` • ${room.spectatorCount} watching`}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onJoin}
          className={`rounded px-3 py-1.5 text-sm transition-colors ${
            inLobby
              ? 'bg-main text-bg hover:brightness-110'
              : 'bg-sub-alt text-sub hover:text-text'
          }`}
          title={inLobby ? 'Join as player' : 'Race already started — join as spectator'}
        >
          {inLobby ? 'join' : 'spectate'}
        </button>
        {inLobby && (
          <button
            type="button"
            onClick={onSpectate}
            className="rounded bg-sub-alt px-3 py-1.5 text-sm text-sub hover:text-text"
            title="Watch without playing"
          >
            👁 spectate
          </button>
        )}
      </div>
    </li>
  );
}

function StatusPill({ status }: { status: RoomMeta['status'] }) {
  const map: Record<RoomMeta['status'], { label: string; cls: string }> = {
    lobby: { label: 'lobby', cls: 'bg-main/20 text-main' },
    countdown: { label: 'starting…', cls: 'bg-sub/30 text-text' },
    racing: { label: 'racing', cls: 'bg-error/20 text-error' },
    finished: { label: 'finished', cls: 'bg-sub/20 text-sub' },
  };
  const { label, cls } = map[status];
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}>
      {label}
    </span>
  );
}
