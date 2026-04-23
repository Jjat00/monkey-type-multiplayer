import { DurableObject } from 'cloudflare:workers';
import type { RoomMeta, RoomStatus } from '@monkey-type/shared';

/**
 * Singleton Durable Object that tracks every active room so the `/play`
 * lobby can discover them without a database. Accessed by name ('global'),
 * so the CF runtime guarantees a single active instance worldwide.
 *
 * The Room DO calls into this via RPC on every lifecycle event (create,
 * config change, player count change, status change, close).
 *
 * State is in-memory only — if the DO is evicted from memory the list
 * resets, and rooms re-register on their next state change. For an MVP
 * that's acceptable: rooms are themselves ephemeral.
 */
export class RoomRegistry extends DurableObject<Env> {
  private readonly rooms = new Map<string, RoomMeta>();

  /**
   * Idempotent register/update. Called by Room DOs whenever their meta
   * changes (join, leave, status change, config change). Using a single
   * upsert entry point keeps the Room → Registry plumbing trivial.
   */
  async upsert(meta: RoomMeta): Promise<void> {
    this.rooms.set(meta.code, meta);
  }

  async unregister(code: string): Promise<void> {
    this.rooms.delete(code);
  }

  /**
   * Returns rooms sorted for display: lobby rooms first (joinable!),
   * then countdown, then racing, then finished. Within a status bucket,
   * newest first so fresh rooms bubble up.
   */
  async list(): Promise<RoomMeta[]> {
    return Array.from(this.rooms.values()).sort(compareRoomsForDisplay);
  }
}

const STATUS_ORDER: Record<RoomStatus, number> = {
  lobby: 0,
  countdown: 1,
  racing: 2,
  finished: 3,
};

function compareRoomsForDisplay(a: RoomMeta, b: RoomMeta): number {
  const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (byStatus !== 0) return byStatus;
  return b.createdAt - a.createdAt;
}
