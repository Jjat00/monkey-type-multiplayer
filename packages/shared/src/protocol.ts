import type { PlayerId, RaceResult, RoomPublic } from './room.ts';

export type ClientMessage =
  | { type: 'join'; nickname: string }
  | { type: 'ready'; ready: boolean }
  | { type: 'progress'; charIndex: number; errors: number; wpm: number }
  | { type: 'finish'; timeMs: number; wpm: number; accuracy: number }
  | { type: 'rematch' };

export type ServerMessage =
  | { type: 'joined'; playerId: PlayerId; room: RoomPublic }
  | { type: 'room_state'; room: RoomPublic }
  | { type: 'countdown'; secondsLeft: number }
  | { type: 'start'; startedAt: number; text: string }
  | { type: 'peer_progress'; playerId: PlayerId; charIndex: number; wpm: number }
  | { type: 'race_end'; results: RaceResult[] }
  | { type: 'error'; code: string; message: string };

export const PROGRESS_THROTTLE_MS = 150;
export const COUNTDOWN_SECONDS = 3;
