export type RoomStatus = 'lobby' | 'countdown' | 'racing' | 'finished';

export type PlayerId = string;

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
  text: string | null;
  startedAt: number | null;
  players: PlayerPublic[];
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
