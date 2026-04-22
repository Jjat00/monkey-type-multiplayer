import { DurableObject } from 'cloudflare:workers';
import {
  COUNTDOWN_SECONDS,
  generateText,
  type ClientMessage,
  type PlayerPublic,
  type RaceResult,
  type RoomPublic,
  type RoomStatus,
  type ServerMessage,
} from '@monkey-type/shared';

const RACE_WORD_COUNT = 25;

/**
 * Per-player state held in the DO. Keyed by the WebSocket instance because
 * the runtime gives us back the same WebSocket across hibernations.
 *
 * NOTE: a copy of this is also persisted via `ws.serializeAttachment` so it
 * survives hibernation — when the DO wakes up, the constructor rebuilds the
 * map by reading attachments off `ctx.getWebSockets()`.
 */
interface PlayerInternal {
  id: string;
  nickname: string;
  ready: boolean;
  charIndex: number;
  wpm: number;
  errors: number;
  finishedAt: number | null;
  /** Race time in ms reported by the client's `finish` message. */
  timeMs: number | null;
  /** Final accuracy from the client's `finish` message. */
  accuracy: number | null;
}

export class Room extends DurableObject<Env> {
  private readonly players = new Map<WebSocket, PlayerInternal>();
  private status: RoomStatus = 'lobby';
  private text: string | null = null;
  private startedAt: number | null = null;
  private code: string | null = null;
  private countdownTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    );

    // Recover player state after hibernation: any WebSocket the runtime kept
    // alive comes back via getWebSockets(), and the attachment we stored on
    // join gets us back the player data.
    for (const ws of this.ctx.getWebSockets()) {
      const data = ws.deserializeAttachment() as PlayerInternal | null;
      if (data) this.players.set(ws, data);
    }
  }

  override async fetch(request: Request): Promise<Response> {
    if (this.code === null) {
      const m = new URL(request.url).pathname.match(/\/room\/([A-Z0-9]+)\/ws$/i);
      if (m) this.code = m[1]!.toUpperCase();
    }

    const pair = new WebSocketPair();
    const client = pair[0]!;
    const server = pair[1]!;
    this.ctx.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(
    ws: WebSocket,
    raw: string | ArrayBuffer,
  ): Promise<void> {
    if (typeof raw !== 'string') return;

    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      this.send(ws, { type: 'error', code: 'BAD_JSON', message: 'Invalid JSON' });
      return;
    }

    switch (msg.type) {
      case 'join':
        return this.handleJoin(ws, msg.nickname);
      case 'ready':
        return this.handleReady(ws, msg.ready);
      case 'progress':
        return this.handleProgress(ws, msg);
      case 'finish':
        return this.handleFinish(ws, msg);
      case 'rematch':
        return this.handleRematch(ws);
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    this.removePlayer(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    this.removePlayer(ws);
  }

  private removePlayer(ws: WebSocket): void {
    if (!this.players.delete(ws)) return;

    if (this.players.size === 0) {
      this.resetToLobby();
      return;
    }

    this.broadcastRoomState();

    // If we were racing and the leaver was the last unfinished player, end the race.
    if (this.status === 'racing') {
      this.maybeEndRace();
    }
  }

  private handleJoin(ws: WebSocket, rawNickname: string): void {
    if (this.players.has(ws)) return;

    const player: PlayerInternal = {
      id: crypto.randomUUID(),
      nickname: sanitizeNickname(rawNickname),
      ready: false,
      charIndex: 0,
      wpm: 0,
      errors: 0,
      finishedAt: null,
      timeMs: null,
      accuracy: null,
    };
    this.players.set(ws, player);
    ws.serializeAttachment(player);

    this.send(ws, {
      type: 'joined',
      playerId: player.id,
      room: this.snapshot(),
    });

    // Late-joiner during a race: also push the start info so they can race too.
    if (this.status === 'racing' && this.text !== null && this.startedAt !== null) {
      this.send(ws, { type: 'start', startedAt: this.startedAt, text: this.text });
    }

    this.broadcastRoomState(ws);
  }

  private handleReady(ws: WebSocket, ready: boolean): void {
    // Ready toggles only matter in the lobby — ignore otherwise so a stray
    // click during countdown/race doesn't corrupt state.
    if (this.status !== 'lobby') return;

    const player = this.players.get(ws);
    if (!player) return;
    if (player.ready === ready) return;

    player.ready = ready;
    ws.serializeAttachment(player);
    this.broadcastRoomState();

    // Auto-start when every connected player is ready (≥1 player).
    const allReady = Array.from(this.players.values()).every((p) => p.ready);
    if (allReady) this.startCountdown();
  }

  private startCountdown(): void {
    this.status = 'countdown';
    this.broadcastRoomState();

    let secondsLeft = COUNTDOWN_SECONDS;

    const tick = (): void => {
      // Bail if something canceled the countdown (e.g. everyone disconnected).
      if (this.status !== 'countdown') return;

      this.broadcast({ type: 'countdown', secondsLeft });

      if (secondsLeft === 0) {
        this.startRace();
        return;
      }
      secondsLeft--;
      this.countdownTimer = setTimeout(tick, 1000);
    };

    tick();
  }

  private startRace(): void {
    this.countdownTimer = null;
    this.text = generateText(RACE_WORD_COUNT);
    this.startedAt = Date.now();
    this.status = 'racing';

    // Reset per-race stats for everyone before announcing the start.
    for (const [ws, p] of this.players) {
      p.charIndex = 0;
      p.wpm = 0;
      p.errors = 0;
      p.finishedAt = null;
      p.timeMs = null;
      p.accuracy = null;
      ws.serializeAttachment(p);
    }

    // Send `start` BEFORE `room_state` so clients have the text in hand by
    // the time they see status='racing' and try to render the typing area.
    this.broadcast({ type: 'start', startedAt: this.startedAt, text: this.text });
    this.broadcastRoomState();
  }

  private handleProgress(
    ws: WebSocket,
    msg: { charIndex: number; errors: number; wpm: number },
  ): void {
    if (this.status !== 'racing') return;
    const player = this.players.get(ws);
    if (!player || player.finishedAt !== null) return;

    player.charIndex = clampInt(msg.charIndex, 0, this.text?.length ?? 0);
    player.errors = Math.max(0, Math.floor(msg.errors));
    player.wpm = Math.max(0, Math.floor(msg.wpm));
    // Skip serializeAttachment here — progress is high-frequency and recovery
    // can rebuild it from the next tick. Avoids unnecessary disk writes.

    const payload = JSON.stringify({
      type: 'peer_progress',
      playerId: player.id,
      charIndex: player.charIndex,
      wpm: player.wpm,
    } satisfies ServerMessage);

    for (const peerWs of this.players.keys()) {
      if (peerWs === ws) continue;
      try { peerWs.send(payload); } catch { /* ignore */ }
    }
  }

  private handleFinish(
    ws: WebSocket,
    msg: { timeMs: number; wpm: number; accuracy: number },
  ): void {
    if (this.status !== 'racing') return;
    const player = this.players.get(ws);
    if (!player || player.finishedAt !== null) return;

    player.finishedAt = Date.now();
    player.timeMs = Math.max(1, Math.floor(msg.timeMs));
    player.wpm = Math.max(0, Math.floor(msg.wpm));
    player.accuracy = Math.max(0, Math.min(100, msg.accuracy));
    if (this.text !== null) player.charIndex = this.text.length;
    ws.serializeAttachment(player);

    this.broadcastRoomState();
    this.maybeEndRace();
  }

  private maybeEndRace(): void {
    if (this.status !== 'racing') return;
    const allFinished = Array.from(this.players.values()).every(
      (p) => p.finishedAt !== null,
    );
    if (allFinished) this.endRace();
  }

  private endRace(): void {
    this.status = 'finished';

    // Rank: finishers ahead of DNFs; among finishers, faster time first;
    // among DNFs, higher wpm first as a courtesy ordering.
    const results: RaceResult[] = Array.from(this.players.values())
      .map((p) => ({
        playerId: p.id,
        nickname: p.nickname,
        finished: p.finishedAt !== null,
        timeMs: p.timeMs ?? 0,
        wpm: p.wpm,
        accuracy: p.accuracy ?? 0,
        rank: 0,
      }))
      .sort((a, b) => {
        if (a.finished !== b.finished) return a.finished ? -1 : 1;
        if (a.finished) return a.timeMs - b.timeMs;
        return b.wpm - a.wpm;
      });

    results.forEach((r, i) => { r.rank = i + 1; });

    this.broadcast({ type: 'race_end', results });
    this.broadcastRoomState();
  }

  private handleRematch(ws: WebSocket): void {
    // Only meaningful once a race has ended; first request wins, rest no-op.
    if (this.status !== 'finished') return;
    this.resetToLobby();
    // The requester's click is an implicit "I want another round" — mark them
    // ready immediately. If they're alone in the room this also auto-starts
    // the next countdown (handleReady runs the all-ready check).
    this.handleReady(ws, true);
  }

  private resetToLobby(): void {
    if (this.countdownTimer !== null) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.status = 'lobby';
    this.text = null;
    this.startedAt = null;
    for (const [ws, p] of this.players) {
      p.ready = false;
      p.charIndex = 0;
      p.wpm = 0;
      p.errors = 0;
      p.finishedAt = null;
      p.timeMs = null;
      p.accuracy = null;
      ws.serializeAttachment(p);
    }
    this.broadcastRoomState();
  }

  private snapshot(): RoomPublic {
    return {
      code: this.code ?? 'unknown',
      status: this.status,
      text: this.status === 'racing' ? this.text : null,
      startedAt: this.startedAt,
      players: Array.from(this.players.values(), toPlayerPublic),
    };
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Socket may be in a closing state — ignore, webSocketClose will clean up.
    }
  }

  private broadcast(msg: ServerMessage): void {
    const payload = JSON.stringify(msg);
    for (const ws of this.players.keys()) {
      try { ws.send(payload); } catch { /* ignore */ }
    }
  }

  private broadcastRoomState(except?: WebSocket): void {
    const payload = JSON.stringify({
      type: 'room_state',
      room: this.snapshot(),
    } satisfies ServerMessage);
    for (const ws of this.players.keys()) {
      if (ws === except) continue;
      try { ws.send(payload); } catch { /* ignore */ }
    }
  }
}

function toPlayerPublic(p: PlayerInternal): PlayerPublic {
  return {
    id: p.id,
    nickname: p.nickname,
    ready: p.ready,
    charIndex: p.charIndex,
    wpm: p.wpm,
    errors: p.errors,
    finishedAt: p.finishedAt,
  };
}

function sanitizeNickname(input: string): string {
  const trimmed = (input ?? '').trim().slice(0, 20);
  return trimmed.length > 0 ? trimmed : 'guest';
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  const v = Math.floor(n);
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
