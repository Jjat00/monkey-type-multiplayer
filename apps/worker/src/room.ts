import { DurableObject } from 'cloudflare:workers';
import type {
  ClientMessage,
  PlayerPublic,
  RoomPublic,
  RoomStatus,
  ServerMessage,
} from '@monkey-type/shared';

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
}

export class Room extends DurableObject<Env> {
  private readonly players = new Map<WebSocket, PlayerInternal>();
  private status: RoomStatus = 'lobby';
  private text: string | null = null;
  private startedAt: number | null = null;
  private code: string | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    );

    // Recover player state after hibernation: any WebSocket the runtime kept
    // alive comes back to us via getWebSockets(), and the attachment we stored
    // when the player joined gets us back the data.
    for (const ws of this.ctx.getWebSockets()) {
      const data = ws.deserializeAttachment() as PlayerInternal | null;
      if (data) this.players.set(ws, data);
    }
  }

  override async fetch(request: Request): Promise<Response> {
    // Capture the room code from the URL the very first time. The Worker
    // routes /room/CODE/ws to this DO; the URL is preserved through the stub.
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
      // Phase 3b will implement these:
      case 'progress':
      case 'finish':
      case 'rematch':
        return;
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    if (this.players.delete(ws)) {
      this.broadcastRoomState();
    }
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    if (this.players.delete(ws)) {
      this.broadcastRoomState();
    }
  }

  private handleJoin(ws: WebSocket, rawNickname: string): void {
    // Idempotent: re-joining (e.g. after a reconnect) doesn't create duplicates.
    if (this.players.has(ws)) return;

    const player: PlayerInternal = {
      id: crypto.randomUUID(),
      nickname: sanitizeNickname(rawNickname),
      ready: false,
      charIndex: 0,
      wpm: 0,
      errors: 0,
      finishedAt: null,
    };
    this.players.set(ws, player);
    ws.serializeAttachment(player);

    // Tell the joining player their own id + the full room snapshot.
    this.send(ws, {
      type: 'joined',
      playerId: player.id,
      room: this.snapshot(),
    });
    // Tell everyone else there's a new player.
    this.broadcastRoomState(ws);
  }

  private handleReady(ws: WebSocket, ready: boolean): void {
    const player = this.players.get(ws);
    if (!player) return;
    if (player.ready === ready) return;

    player.ready = ready;
    ws.serializeAttachment(player);
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

  /** Broadcast room_state to all connected players (optionally excluding one). */
  private broadcastRoomState(except?: WebSocket): void {
    const payload = JSON.stringify({ type: 'room_state', room: this.snapshot() } satisfies ServerMessage);
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
