export type RoomStatus = 'lobby' | 'countdown' | 'racing' | 'finished';

export type PlayerId = string;

export type PlayerRole = 'host' | 'player' | 'spectator';

/**
 * Race configuration the host picks for everyone in the room. Mirrors the
 * solo-practice settings (apps/web/lib/settings/types.ts) so the same
 * ConfigBar UI can drive both — but lives in shared because the server is
 * the source of truth in multiplayer.
 */
export interface RaceConfig {
  mode: 'words' | 'time';
  /** Used when mode === 'words'. Discrete: 10 | 25 | 50 | 100. */
  wordCount: number;
  /** Used when mode === 'time'. Discrete: 15 | 30 | 60. */
  timeSeconds: number;
  punctuation: boolean;
}

export const DEFAULT_RACE_CONFIG: RaceConfig = {
  mode: 'words',
  wordCount: 25,
  timeSeconds: 30,
  punctuation: false,
};

export interface PlayerPublic {
  id: PlayerId;
  nickname: string;
  ready: boolean;
  charIndex: number;
  wpm: number;
  errors: number;
  finishedAt: number | null;
}

export interface RoomPublic {
  code: string;
  status: RoomStatus;
  /** PlayerId of the current admin. Null only during the brief moment between host leave and handoff. */
  hostPlayerId: PlayerId | null;
  config: RaceConfig;
  text: string | null;
  startedAt: number | null;
  players: PlayerPublic[];
  /** Spectator count is exposed but spectator identities are not (no nicknames in the room state). */
  spectatorCount: number;
}

export interface RaceResult {
  playerId: PlayerId;
  nickname: string;
  rank: number;
  wpm: number;
  accuracy: number;
  timeMs: number;
  finished: boolean;
}

/**
 * Trimmed-down room summary returned by GET /rooms — what the lobby list
 * displays. Excludes race text and full player rows so the payload stays
 * tiny even with hundreds of rooms.
 */
export interface RoomMeta {
  code: string;
  hostNickname: string;
  status: RoomStatus;
  playerCount: number;
  spectatorCount: number;
  config: RaceConfig;
  /** ms since epoch — used to sort newest-first in the list. */
  createdAt: number;
}
