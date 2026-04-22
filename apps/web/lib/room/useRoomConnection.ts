'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, RoomPublic, ServerMessage } from '@monkey-type/shared';
import { buildRoomWsUrl } from '@/lib/config';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

interface UseRoomConnectionOptions {
  /** Room code to connect to (the [code] segment in /play/[code]). */
  code: string;
  /** Nickname to send in the join message. If empty, no connection is opened. */
  nickname: string;
  /** Hard switch: caller can keep the connection closed (e.g. before the user submits the nickname form). */
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
          break;
        case 'room_state':
          setRoom(msg.room);
          break;
        case 'error':
          setError(`${msg.code}: ${msg.message}`);
          break;
        // Phase 3b will handle these:
        case 'countdown':
        case 'start':
        case 'peer_progress':
        case 'race_end':
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
      // Tell the server we're going away cleanly. close() is idempotent if
      // the socket is already closed.
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

  return { status, room, selfId, send, error };
}
