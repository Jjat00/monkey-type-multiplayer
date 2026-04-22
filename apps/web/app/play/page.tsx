'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  ROOM_CODE_LENGTH,
  generateRoomCode,
  isValidRoomCode,
} from '@/lib/room/code';
import {
  NICKNAME_MAX_LENGTH,
  getNickname,
  setNickname,
} from '@/lib/storage/nickname';

export default function PlayLanding() {
  const router = useRouter();

  const [nickname, setNick] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);

  // Hydrate nickname from localStorage after mount (avoids SSR/CSR mismatch).
  useEffect(() => {
    setNick(getNickname());
  }, []);

  const persistAndGo = (code: string) => {
    setNickname(nickname);
    router.push(`/play/${code}`);
  };

  const onCreate = () => {
    if (!validateNickname()) return;
    persistAndGo(generateRoomCode());
  };

  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    if (!validateNickname()) return;
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

  const validateNickname = (): boolean => {
    if (nickname.trim().length === 0) {
      setJoinError('enter a nickname first');
      return false;
    }
    setJoinError(null);
    return true;
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 px-6 font-mono">
      <h1 className="text-2xl text-text">play with friends</h1>

      <div className="flex flex-col gap-2">
        <label htmlFor="nick" className="text-sm text-sub">nickname</label>
        <input
          id="nick"
          autoFocus
          value={nickname}
          maxLength={NICKNAME_MAX_LENGTH}
          onChange={(e) => setNick(e.target.value)}
          className="w-72 rounded bg-sub-alt px-3 py-2 text-text outline-none focus:ring-2 focus:ring-main"
          placeholder="how should we call you?"
        />
      </div>

      <button
        type="button"
        onClick={onCreate}
        className="w-72 rounded bg-main px-4 py-2 font-semibold text-bg transition-colors hover:brightness-110"
      >
        create new room
      </button>

      <div className="flex w-72 items-center gap-3 text-sub">
        <span className="h-px flex-1 bg-sub/40" />
        <span className="text-xs uppercase tracking-wider">or join</span>
        <span className="h-px flex-1 bg-sub/40" />
      </div>

      <form onSubmit={onJoin} className="flex w-72 gap-2">
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
          maxLength={ROOM_CODE_LENGTH}
          spellCheck={false}
          className="flex-1 rounded bg-sub-alt px-3 py-2 text-center text-lg uppercase tracking-widest text-text outline-none focus:ring-2 focus:ring-main"
          placeholder="enter code"
        />
        <button
          type="submit"
          className="rounded bg-sub-alt px-4 py-2 text-text transition-colors hover:bg-main hover:text-bg"
        >
          join
        </button>
      </form>

      {joinError && <p className="text-sm text-error">{joinError}</p>}

      <button
        type="button"
        onClick={() => router.push('/')}
        className="text-sm text-sub hover:text-text"
      >
        ← back to solo practice
      </button>
    </main>
  );
}
