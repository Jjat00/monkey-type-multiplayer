'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClientMessage,
  PlayerId,
  RaceResult,
  RoomPublic,
  ServerMessage,
} from '@monkey-type/shared';
import { buildRoomWsUrl } from '@/lib/config';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

export interface PeerProgress {
  charIndex: number;
  wpm: number;
}

interface UseRoomConnectionOptions {
  /** Room code to connect to (the [code] segment in /play/[code]). */
  code: string;
  /** Nickname to send in the join message. If empty, no connection is opened. */
  nickname: string;
  /** Hard switch: caller can keep the connection closed (e.g. before nickname submit). */
  enabled?: boolean;
}

export interface UseRoomConnectionReturn {
  status: ConnectionStatus;
  /** Latest snapshot of the room from the server. null until the first room_state arrives. */
  room: RoomPublic | null;
  /** This client's playerId, set by the `joined` message. */
  selfId: string | null;
  /** Send a typed message to the server. No-op if the socket isn't open. */
  send: (msg: ClientMessage) => void;
  /** Last error message from the server (e.g. BAD_JSON), or null. */
  error: string | null;
  /** Seconds left in the countdown, or null if not in countdown. */
  countdown: number | null;
  /** Server-provided text for the current race. */
  raceText: string | null;
  /** Server-provided start timestamp (Date.now() server-side). */
  raceStartedAt: number | null;
  /** Live progress of OTHER players, keyed by playerId. Updated by `peer_progress` messages. */
  peers: Record<PlayerId, PeerProgress>;
  /** Final results of the most recent race, set by `race_end`. Cleared on rematch. */
  results: RaceResult[] | null;
}

export function useRoomConnection({
  code,
  nickname,
  enabled = true,
}: UseRoomConnectionOptions): UseRoomConnectionReturn {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [room, setRoom] = useState<RoomPublic | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [raceText, setRaceText] = useState<string | null>(null);
  const [raceStartedAt, setRaceStartedAt] = useState<number | null>(null);
  const [peers, setPeers] = useState<Record<PlayerId, PeerProgress>>({});
  const [results, setResults] = useState<RaceResult[] | null>(null);

  /*
   * The WebSocket lives in a ref, NOT in state, because:
   * (a) we don't want every re-render to think the socket changed, and
   * (b) the `send` function needs a stable reference to the current socket
   *     without re-running the connect effect.
   */
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled || !nickname || !code) {
      setStatus('idle');
      return;
    }

    setStatus('connecting');
    setRoom(null);
    setSelfId(null);
    setError(null);
    setCountdown(null);
    setRaceText(null);
    setRaceStartedAt(null);
    setPeers({});
    setResults(null);

    const ws = new WebSocket(buildRoomWsUrl(code));
    wsRef.current = ws;

    ws.addEventListener('open', () => {
      setStatus('open');
      ws.send(JSON.stringify({ type: 'join', nickname } satisfies ClientMessage));
    });

    ws.addEventListener('message', (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data as string) as ServerMessage;
      } catch {
        return;
      }
      switch (msg.type) {
        case 'joined':
          setSelfId(msg.playerId);
          setRoom(msg.room);
          // Late joiner during a race: snapshot already carries text+startedAt.
          if (msg.room.status === 'racing' && msg.room.text !== null) {
            setRaceText(msg.room.text);
            setRaceStartedAt(msg.room.startedAt);
          }
          break;

        case 'room_state':
          setRoom(msg.room);
          // When server resets to lobby (rematch / empty room), clear race-only state.
          if (msg.room.status === 'lobby') {
            setCountdown(null);
            setRaceText(null);
            setRaceStartedAt(null);
            setPeers({});
            setResults(null);
          }
          break;

        case 'countdown':
          setCountdown(msg.secondsLeft);
          break;

        case 'start':
          // Authoritative race kickoff.
          setCountdown(null);
          setRaceText(msg.text);
          setRaceStartedAt(msg.startedAt);
          setPeers({});
          setResults(null);
          break;

        case 'peer_progress':
          setPeers((prev) => ({
            ...prev,
            [msg.playerId]: { charIndex: msg.charIndex, wpm: msg.wpm },
          }));
          break;

        case 'race_end':
          setResults(msg.results);
          break;

        case 'error':
          setError(`${msg.code}: ${msg.message}`);
          break;
      }
    });

    ws.addEventListener('close', () => {
      setStatus('closed');
    });

    ws.addEventListener('error', () => {
      setStatus('error');
    });

    return () => {
      ws.close(1000, 'client unmount');
      wsRef.current = null;
    };
  }, [code, nickname, enabled]);

  const send = useCallback((msg: ClientMessage): void => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[useRoomConnection] tried to send while socket not open', msg.type);
      return;
    }
    ws.send(JSON.stringify(msg));
  }, []);

  return {
    status,
    room,
    selfId,
    send,
    error,
    countdown,
    raceText,
    raceStartedAt,
    peers,
    results,
  };
}
