'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClientMessage,
  PlayerId,
  PlayerRole,
  RaceConfig,
  RaceResult,
  RoomPublic,
  ServerMessage,
} from '@monkey-type/shared';
import { buildRoomWsUrl } from '@/lib/config';
import {
  clearHostToken,
  getHostToken,
  setHostToken,
} from '@/lib/storage/hostId';

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
  /** Join as a read-only spectator instead of a player. */
  asSpectator?: boolean;
  /**
   * Fired when the server kicks this socket. The page typically routes away
   * to /play with a notice. Called BEFORE the WS close event.
   */
  onKicked?: (reason: string) => void;
}

export interface UseRoomConnectionReturn {
  status: ConnectionStatus;
  /** Latest snapshot of the room from the server. null until the first room_state arrives. */
  room: RoomPublic | null;
  /** This client's playerId, set by the `joined` message. Empty string for spectators. */
  selfId: string | null;
  /** This client's role in the room, set by `joined` and updated on `host_changed`. */
  selfRole: PlayerRole | null;
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
  /** Live progress of OTHER players, keyed by playerId. */
  peers: Record<PlayerId, PeerProgress>;
  /** Final results of the most recent race, set by `race_end`. Cleared on next race. */
  results: RaceResult[] | null;
}

export function useRoomConnection({
  code,
  nickname,
  enabled = true,
  asSpectator = false,
  onKicked,
}: UseRoomConnectionOptions): UseRoomConnectionReturn {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [room, setRoom] = useState<RoomPublic | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [selfRole, setSelfRole] = useState<PlayerRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [raceText, setRaceText] = useState<string | null>(null);
  const [raceStartedAt, setRaceStartedAt] = useState<number | null>(null);
  const [peers, setPeers] = useState<Record<PlayerId, PeerProgress>>({});
  const [results, setResults] = useState<RaceResult[] | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  /**
   * onKicked is captured in a ref so updating the callback doesn't tear
   * down the WebSocket. The connect effect must NOT depend on it.
   */
  const onKickedRef = useRef(onKicked);
  useEffect(() => {
    onKickedRef.current = onKicked;
  }, [onKicked]);
  /** Mirror selfId in a ref so the message handler can compare against it without stale closures. */
  const selfIdRef = useRef<string | null>(null);
  useEffect(() => {
    selfIdRef.current = selfId;
  }, [selfId]);

  useEffect(() => {
    if (!enabled || !nickname || !code) {
      setStatus('idle');
      return;
    }

    setStatus('connecting');
    setRoom(null);
    setSelfId(null);
    setSelfRole(null);
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
      // Read hostToken from localStorage at connect time so refresh recovers
      // admin role without the page having to know about tokens.
      const savedToken = getHostToken(code);
      const joinMsg: ClientMessage = {
        type: 'join',
        nickname,
        ...(savedToken !== null && !asSpectator && { hostToken: savedToken }),
        ...(asSpectator && { asSpectator: true }),
      };
      ws.send(JSON.stringify(joinMsg));
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
          setSelfRole(msg.role);
          setRoom(msg.room);
          if (msg.hostToken !== undefined) {
            setHostToken(code, msg.hostToken);
          }
          // Late joiner during a race: snapshot already carries text+startedAt.
          if (msg.room.status === 'racing' && msg.room.text !== null) {
            setRaceText(msg.room.text);
            setRaceStartedAt(msg.room.startedAt);
          }
          break;

        case 'room_state':
          setRoom(msg.room);
          if (msg.room.status === 'lobby') {
            setCountdown(null);
            setRaceText(null);
            setRaceStartedAt(null);
            setPeers({});
            setResults(null);
          }
          break;

        case 'host_changed': {
          const becameHost = msg.newHostPlayerId === selfIdRef.current;
          if (becameHost) {
            setSelfRole('host');
            // Defense-in-depth: only persist a token whose recipient matches us,
            // even though the server only sends it on the `becameHost` payload.
            if (msg.hostToken !== undefined) {
              setHostToken(code, msg.hostToken);
            }
          } else if (selfRole === 'host') {
            // We were demoted (shouldn't happen with current server logic,
            // but stay defensive — if a new host appeared, we're not it anymore).
            setSelfRole('player');
            clearHostToken(code);
          }
          break;
        }

        case 'config_updated':
          // Authoritative config also arrives via room_state; no-op here.
          // Kept as a discrete event in case the UI wants a "config changed" toast later.
          break;

        case 'kicked':
          // Server is about to close the socket. Drop the host token and
          // notify the page so it can navigate away with a notice.
          clearHostToken(code);
          onKickedRef.current?.(msg.reason);
          break;

        case 'countdown':
          setCountdown(msg.secondsLeft);
          break;

        case 'start':
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- selfRole intentionally omitted; we compare via ref
  }, [code, nickname, enabled, asSpectator]);

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
    selfRole,
    send,
    error,
    countdown,
    raceText,
    raceStartedAt,
    peers,
    results,
  };
}

// Re-export RaceConfig for ergonomic imports from page components.
export type { RaceConfig };
