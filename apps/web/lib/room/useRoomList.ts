'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomMeta } from '@monkey-type/shared';
import { WORKER_HTTP_URL } from '@/lib/config';

/**
 * 2s feels snappy without hammering the registry — a freshly created room
 * shows up in other tabs within ~2s of the first WS message hitting the worker.
 */
const POLL_INTERVAL_MS = 2000;

export interface UseRoomListReturn {
  rooms: RoomMeta[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Polls `GET /rooms` every 3s. Cheap and good enough for MVP scale —
 * if rooms grow into the hundreds, switch to a WebSocket subscription
 * to the RoomRegistry DO.
 *
 * Uses an AbortController so a stale fetch from before unmount can't
 * resolve into a setState on a torn-down component.
 */
export function useRoomList(): UseRoomListReturn {
  const [rooms, setRooms] = useState<RoomMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Bumping this counter re-triggers the effect for an immediate refetch. */
  const [tick, setTick] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const fetchOnce = async (): Promise<void> => {
      try {
        const res = await fetch(`${WORKER_HTTP_URL}/rooms`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as RoomMeta[];
        if (!mountedRef.current) return;
        setRooms(Array.isArray(data) ? data : []);
        setError(null);
      } catch (e) {
        if (controller.signal.aborted) return;
        if (!mountedRef.current) return;
        setError(e instanceof Error ? e.message : 'failed to load rooms');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    void fetchOnce();
    const id = setInterval(() => void fetchOnce(), POLL_INTERVAL_MS);

    return () => {
      controller.abort();
      clearInterval(id);
    };
  }, [tick]);

  const refetch = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  return { rooms, loading, error, refetch };
}
