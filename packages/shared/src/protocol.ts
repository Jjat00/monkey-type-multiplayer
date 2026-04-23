import type {
  PlayerId,
  PlayerRole,
  RaceConfig,
  RaceResult,
  RoomPublic,
} from './room.ts';

export type ClientMessage =
  /**
   * Sent by every client immediately after the WebSocket opens.
   * - `hostToken` (optional): if set, the server tries to re-grant the host
   *   role to the connecting socket. Comes from localStorage on reconnect.
   * - `asSpectator` (optional): join without participating in the race.
   *   Spectators don't show up in `players`, can't ready, can't type.
   */
  | { type: 'join'; nickname: string; hostToken?: string; asSpectator?: boolean }
  | { type: 'ready'; ready: boolean }
  /** Host-only. Triggers the countdown when the host decides everyone is ready. */
  | { type: 'start' }
  /** Host-only. Closes the target's WebSocket and broadcasts a `kicked` to them. */
  | { type: 'kick'; targetPlayerId: PlayerId }
  /** Host-only. Only valid in `lobby`; ignored otherwise to avoid race-state corruption. */
  | { type: 'update_config'; config: RaceConfig }
  | { type: 'progress'; charIndex: number; errors: number; wpm: number }
  | { type: 'finish'; timeMs: number; wpm: number; accuracy: number }
  /** After a race ends, any player can request the next race; resets the room to lobby. */
  | { type: 'next_race' };

export type ServerMessage =
  /**
   * First message after a successful join.
   * - `hostToken` is included ONLY when role === 'host'; clients persist it
   *   to localStorage to reclaim admin on refresh.
   */
  | {
      type: 'joined';
      playerId: PlayerId;
      role: PlayerRole;
      hostToken?: string;
      room: RoomPublic;
    }
  | { type: 'room_state'; room: RoomPublic }
  /** Broadcast when the host changes the race config in lobby. */
  | { type: 'config_updated'; config: RaceConfig }
  /**
   * Broadcast when the original host leaves and a new player is promoted.
   * The `hostToken` field is included ONLY in the copy sent to the newly
   * promoted player; everyone else gets a payload without it. Clients must
   * still gate `setHostToken(...)` on `newHostPlayerId === selfId` as a
   * defense-in-depth check.
   */
  | { type: 'host_changed'; newHostPlayerId: PlayerId; hostToken?: string }
  /** Sent only to the kicked socket immediately before the server closes it. */
  | { type: 'kicked'; reason: string }
  | { type: 'countdown'; secondsLeft: number }
  | { type: 'start'; startedAt: number; text: string }
  | { type: 'peer_progress'; playerId: PlayerId; charIndex: number; wpm: number }
  | { type: 'race_end'; results: RaceResult[] }
  | { type: 'error'; code: string; message: string };

export const PROGRESS_THROTTLE_MS = 150;
export const COUNTDOWN_SECONDS = 3;
