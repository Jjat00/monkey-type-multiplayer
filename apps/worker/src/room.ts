import { DurableObject } from 'cloudflare:workers';
import {
  COUNTDOWN_SECONDS,
  DEFAULT_RACE_CONFIG,
  generateText,
  type ClientMessage,
  type PlayerPublic,
  type RaceConfig,
  type RaceResult,
  type RoomMeta,
  type RoomPublic,
  type RoomStatus,
  type ServerMessage,
} from '@monkey-type/shared';

/** Buffer big enough that >100 wpm typers can't run out in 60s mode. */
const TIME_MODE_BUFFER_WORDS = 250;
/** ms after the last player leaves before we auto-close the room (and unregister it). */
const EMPTY_ROOM_TTL_MS = 60_000;

/**
 * Per-player state. `joinedAt` is what we sort by when promoting a new host
 * after the current admin disconnects (oldest connected player wins).
 *
 * NOTE: a copy of this is also persisted via `ws.serializeAttachment` so it
 * survives hibernation. After hibernation the constructor rebuilds the
 * players Map by reading attachments off `ctx.getWebSockets()`.
 */
interface PlayerInternal {
  id: string;
  nickname: string;
  ready: boolean;
  charIndex: number;
  wpm: number;
  errors: number;
  finishedAt: number | null;
  timeMs: number | null;
  accuracy: number | null;
  joinedAt: number;
}

/**
 * Discriminated union persisted on every WebSocket attachment so we can
 * tell players apart from spectators after hibernation. Without the `kind`
 * tag, a rebuild from `ctx.getWebSockets()` couldn't classify them.
 */
type WSAttachment =
  | (PlayerInternal & { kind: 'player' })
  | { kind: 'spectator' };

/**
 * Everything that must survive DO hibernation/eviction. WS attachments
 * cover per-connection player data; this single key covers room-wide state.
 * Stored as one object so a single put is atomic (no risk of writing
 * `status` and crashing before writing `text`).
 */
interface PersistedRoomState {
  code: string;
  status: RoomStatus;
  hostToken: string | null;
  hostPlayerId: string | null;
  config: RaceConfig;
  createdAt: number;
  text: string | null;
  startedAt: number | null;
}

const ROOM_STATE_KEY = 'room';

export class Room extends DurableObject<Env> {
  private readonly players = new Map<WebSocket, PlayerInternal>();
  private readonly spectators = new Set<WebSocket>();

  private status: RoomStatus = 'lobby';
  private text: string | null = null;
  private startedAt: number | null = null;
  private code: string | null = null;
  private hostToken: string | null = null;
  private hostPlayerId: string | null = null;
  private config: RaceConfig = { ...DEFAULT_RACE_CONFIG };
  private createdAt: number | null = null;

  private countdownTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Timer that auto-closes the room when zero players remain (spectators
   * alone don't keep the room alive). Reset every time a player joins.
   */
  private emptyRoomTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong'),
    );

    // Restore room-wide state and rebuild the player/spectator maps from
    // surviving WS attachments. blockConcurrencyWhile defers any inbound
    // message until this finishes — critical because handleJoin etc. would
    // otherwise see empty maps and treat returning clients as first-joiners.
    this.ctx.blockConcurrencyWhile(async () => {
      const stored = await this.ctx.storage.get<PersistedRoomState>(ROOM_STATE_KEY);
      if (stored) {
        this.code = stored.code;
        this.status = stored.status;
        this.hostToken = stored.hostToken;
        this.hostPlayerId = stored.hostPlayerId;
        this.config = stored.config;
        this.createdAt = stored.createdAt;
        this.text = stored.text;
        this.startedAt = stored.startedAt;
      }

      for (const ws of this.ctx.getWebSockets()) {
        const data = ws.deserializeAttachment() as WSAttachment | null;
        if (!data) continue;
        if (data.kind === 'spectator') {
          this.spectators.add(ws);
        } else {
          const { kind: _kind, ...player } = data;
          this.players.set(ws, player);
        }
      }
    });
  }

  override async fetch(request: Request): Promise<Response> {
    if (this.code === null) {
      const m = new URL(request.url).pathname.match(/\/room\/([A-Z0-9]+)\/ws$/i);
      if (m) {
        this.code = m[1]!.toUpperCase();
        await this.persistRoomState();
      }
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
        return this.handleJoin(ws, msg);
      case 'ready':
        return this.handleReady(ws, msg.ready);
      case 'start':
        return this.handleStart(ws);
      case 'kick':
        return this.handleKick(ws, msg.targetPlayerId);
      case 'update_config':
        return this.handleUpdateConfig(ws, msg.config);
      case 'progress':
        return this.handleProgress(ws, msg);
      case 'finish':
        return this.handleFinish(ws, msg);
      case 'next_race':
        return this.handleNextRace(ws);
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.removeSocket(ws);
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.removeSocket(ws);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Join / role assignment
  // ────────────────────────────────────────────────────────────────────────

  private async handleJoin(
    ws: WebSocket,
    msg: { nickname: string; hostToken?: string; asSpectator?: boolean },
  ): Promise<void> {
    if (this.players.has(ws) || this.spectators.has(ws)) return;

    const nickname = sanitizeNickname(msg.nickname);

    if (msg.asSpectator) {
      this.spectators.add(ws);
      ws.serializeAttachment({ kind: 'spectator' } satisfies WSAttachment);

      // Spectators get the snapshot but no host token (they have no privileges).
      // Late spectator during a race: snapshot already carries text+startedAt.
      this.send(ws, {
        type: 'joined',
        playerId: '',
        role: 'spectator',
        room: this.snapshot(),
      });
      if (this.status === 'racing' && this.text !== null && this.startedAt !== null) {
        this.send(ws, { type: 'start', startedAt: this.startedAt, text: this.text });
      }
      this.broadcastRoomState(ws);
      await this.notifyRegistry();
      return;
    }

    // Cancel any pending auto-close — a real player just walked in.
    this.clearEmptyRoomTimer();

    const now = Date.now();
    if (this.createdAt === null) this.createdAt = now;

    const player: PlayerInternal = {
      id: crypto.randomUUID(),
      nickname,
      ready: false,
      charIndex: 0,
      wpm: 0,
      errors: 0,
      finishedAt: null,
      timeMs: null,
      accuracy: null,
      joinedAt: now,
    };
    this.players.set(ws, player);
    ws.serializeAttachment({ kind: 'player', ...player } satisfies WSAttachment);

    // Decide host role: a matching token wins (refresh / reconnect), otherwise
    // the very first player to ever join becomes host.
    let role: 'host' | 'player' = 'player';
    let tokenToReturn: string | undefined;

    const tokenMatches =
      msg.hostToken !== undefined &&
      this.hostToken !== null &&
      msg.hostToken === this.hostToken;

    if (tokenMatches || this.hostPlayerId === null) {
      role = 'host';
      // Always rotate the token on host (re)assignment so a leaked previous
      // token can't be reused by a third party after a handoff.
      this.hostToken = generateHostToken();
      this.hostPlayerId = player.id;
      tokenToReturn = this.hostToken;
    }

    await this.persistRoomState();

    this.send(ws, {
      type: 'joined',
      playerId: player.id,
      role,
      ...(tokenToReturn !== undefined && { hostToken: tokenToReturn }),
      room: this.snapshot(),
    });

    if (this.status === 'racing' && this.text !== null && this.startedAt !== null) {
      this.send(ws, { type: 'start', startedAt: this.startedAt, text: this.text });
    }

    this.broadcastRoomState(ws);
    await this.notifyRegistry();
  }

  // ────────────────────────────────────────────────────────────────────────
  // Lobby actions
  // ────────────────────────────────────────────────────────────────────────

  private async handleReady(ws: WebSocket, ready: boolean): Promise<void> {
    // Ready toggles only matter in the lobby — a stray click during
    // countdown/race must not corrupt state.
    if (this.status !== 'lobby') return;

    const player = this.players.get(ws);
    if (!player) return;
    if (player.ready === ready) return;

    player.ready = ready;
    ws.serializeAttachment({ kind: 'player', ...player } satisfies WSAttachment);
    this.broadcastRoomState();
    // Auto-start removed in Phase 6: the host explicitly triggers `start`.
  }

  private async handleStart(ws: WebSocket): Promise<void> {
    if (!this.isHost(ws)) {
      this.send(ws, { type: 'error', code: 'NOT_HOST', message: 'Only the host can start the race' });
      return;
    }
    if (this.status !== 'lobby') {
      this.send(ws, { type: 'error', code: 'BAD_STATE', message: 'Can only start from lobby' });
      return;
    }
    if (this.players.size === 0) return;
    this.startCountdown();
    await this.notifyRegistry();
  }

  private async handleUpdateConfig(ws: WebSocket, config: RaceConfig): Promise<void> {
    if (!this.isHost(ws)) {
      this.send(ws, { type: 'error', code: 'NOT_HOST', message: 'Only the host can change config' });
      return;
    }
    // Config changes mid-race would invalidate the in-flight text — gate to lobby only.
    if (this.status !== 'lobby') {
      this.send(ws, { type: 'error', code: 'BAD_STATE', message: 'Config can only change in lobby' });
      return;
    }
    const sanitized = sanitizeConfig(config);
    this.config = sanitized;
    await this.persistRoomState();
    this.broadcastAll({ type: 'config_updated', config: sanitized });
    this.broadcastRoomState();
    await this.notifyRegistry();
  }

  private async handleKick(ws: WebSocket, targetPlayerId: string): Promise<void> {
    if (!this.isHost(ws)) {
      this.send(ws, { type: 'error', code: 'NOT_HOST', message: 'Only the host can kick' });
      return;
    }
    if (targetPlayerId === this.hostPlayerId) {
      this.send(ws, { type: 'error', code: 'CANT_KICK_HOST', message: 'Host cannot kick themselves' });
      return;
    }
    const targetWs = this.findPlayerWs(targetPlayerId);
    if (!targetWs) return;

    this.send(targetWs, { type: 'kicked', reason: 'Removed by host' });
    try {
      // 4000–4999 is the app-defined range; clients can branch on this if needed.
      targetWs.close(4001, 'kicked');
    } catch {
      /* socket may already be closing */
    }
    await this.removeSocket(targetWs);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Race lifecycle
  // ────────────────────────────────────────────────────────────────────────

  private startCountdown(): void {
    this.status = 'countdown';
    void this.persistRoomState();
    this.broadcastRoomState();

    let secondsLeft = COUNTDOWN_SECONDS;

    const tick = (): void => {
      if (this.status !== 'countdown') return;
      this.broadcastAll({ type: 'countdown', secondsLeft });
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

    // In time mode generate a big buffer so fast typers don't run out;
    // engine/UI ignore the overflow because the timer ends the race.
    const wordCount =
      this.config.mode === 'time' ? TIME_MODE_BUFFER_WORDS : this.config.wordCount;
    this.text = generateText(wordCount, { punctuation: this.config.punctuation });
    this.startedAt = Date.now();
    this.status = 'racing';

    for (const [ws, p] of this.players) {
      p.charIndex = 0;
      p.wpm = 0;
      p.errors = 0;
      p.finishedAt = null;
      p.timeMs = null;
      p.accuracy = null;
      ws.serializeAttachment({ kind: 'player', ...p } satisfies WSAttachment);
    }

    void this.persistRoomState();

    // Send `start` BEFORE `room_state` so clients have the text in hand by
    // the time they see status='racing' and try to render the typing area.
    this.broadcastAll({ type: 'start', startedAt: this.startedAt, text: this.text });
    this.broadcastRoomState();
    void this.notifyRegistry();
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
    // Skip serializeAttachment — progress is high-frequency and recovery
    // can rebuild it from the next tick.

    const payload = JSON.stringify({
      type: 'peer_progress',
      playerId: player.id,
      charIndex: player.charIndex,
      wpm: player.wpm,
    } satisfies ServerMessage);

    // Send to other players AND to spectators (they need to see the bars too).
    for (const peerWs of this.players.keys()) {
      if (peerWs === ws) continue;
      try { peerWs.send(payload); } catch { /* ignore */ }
    }
    for (const specWs of this.spectators) {
      try { specWs.send(payload); } catch { /* ignore */ }
    }
  }

  private async handleFinish(
    ws: WebSocket,
    msg: { timeMs: number; wpm: number; accuracy: number },
  ): Promise<void> {
    if (this.status !== 'racing') return;
    const player = this.players.get(ws);
    if (!player || player.finishedAt !== null) return;

    player.finishedAt = Date.now();
    player.timeMs = Math.max(1, Math.floor(msg.timeMs));
    player.wpm = Math.max(0, Math.floor(msg.wpm));
    player.accuracy = Math.max(0, Math.min(100, msg.accuracy));
    if (this.text !== null) player.charIndex = this.text.length;
    ws.serializeAttachment({ kind: 'player', ...player } satisfies WSAttachment);

    this.broadcastRoomState();
    await this.maybeEndRace();
  }

  private async maybeEndRace(): Promise<void> {
    if (this.status !== 'racing') return;
    const allFinished = Array.from(this.players.values()).every(
      (p) => p.finishedAt !== null,
    );
    if (allFinished) await this.endRace();
  }

  private async endRace(): Promise<void> {
    this.status = 'finished';
    await this.persistRoomState();

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

    this.broadcastAll({ type: 'race_end', results });
    this.broadcastRoomState();
    await this.notifyRegistry();
  }

  private async handleNextRace(ws: WebSocket): Promise<void> {
    // Host-only in Phase 6: prevents a stray click from a finished racer
    // from kicking everyone back to lobby unexpectedly.
    if (!this.isHost(ws)) {
      this.send(ws, { type: 'error', code: 'NOT_HOST', message: 'Only the host can start the next race' });
      return;
    }
    if (this.status !== 'finished') return;
    await this.resetToLobby();
  }

  private async resetToLobby(): Promise<void> {
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
      ws.serializeAttachment({ kind: 'player', ...p } satisfies WSAttachment);
    }
    await this.persistRoomState();
    this.broadcastRoomState();
    await this.notifyRegistry();
  }

  // ────────────────────────────────────────────────────────────────────────
  // Disconnect / host handoff
  // ────────────────────────────────────────────────────────────────────────

  private async removeSocket(ws: WebSocket): Promise<void> {
    if (this.spectators.delete(ws)) {
      this.broadcastRoomState();
      await this.notifyRegistry();
      return;
    }

    const player = this.players.get(ws);
    if (!player) return;
    this.players.delete(ws);

    const wasHost = player.id === this.hostPlayerId;

    if (wasHost) {
      // Phase 6 rule: when the host leaves, the room ends. No handoff —
      // everyone (remaining players + spectators) gets booted with a
      // "host left" notice and the room is removed from the registry.
      await this.shutdown('Host left the room');
      return;
    }

    if (this.players.size === 0) {
      // No players left and no host departure to attribute it to. Reset
      // race state and arm the auto-close timer for any lingering spectators.
      this.hostPlayerId = null;
      this.hostToken = null;
      await this.resetToLobby();
      this.armEmptyRoomTimer();
      return;
    }

    this.broadcastRoomState();

    if (this.status === 'racing') {
      // The leaver might have been the last unfinished player.
      await this.maybeEndRace();
    }

    await this.notifyRegistry();
  }

  private armEmptyRoomTimer(): void {
    this.clearEmptyRoomTimer();
    this.emptyRoomTimer = setTimeout(() => {
      void this.shutdown('Room closed (no players)');
    }, EMPTY_ROOM_TTL_MS);
  }

  private clearEmptyRoomTimer(): void {
    if (this.emptyRoomTimer !== null) {
      clearTimeout(this.emptyRoomTimer);
      this.emptyRoomTimer = null;
    }
  }

  /**
   * Tear down the room: kick everyone (players + spectators) with a notice,
   * wipe persisted state, and unregister from the lobby. Used by both the
   * empty-room TTL and the host-leaves rule.
   *
   * The DO instance itself can't be deleted (CF doesn't expose that), but
   * emptying storage + closing all sockets is functionally equivalent —
   * a fresh `fetch` to the same code will start a new room from zero.
   */
  private async shutdown(reason: string): Promise<void> {
    this.clearEmptyRoomTimer();
    if (this.countdownTimer !== null) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }

    const allSockets = [...this.players.keys(), ...this.spectators];
    for (const ws of allSockets) {
      try {
        this.send(ws, { type: 'kicked', reason });
        ws.close(4002, 'room closed');
      } catch { /* ignore */ }
    }
    this.players.clear();
    this.spectators.clear();

    const code = this.code;
    this.code = null;
    this.hostToken = null;
    this.hostPlayerId = null;
    this.config = { ...DEFAULT_RACE_CONFIG };
    this.createdAt = null;
    this.text = null;
    this.startedAt = null;
    this.status = 'lobby';

    await this.ctx.storage.delete(ROOM_STATE_KEY);

    if (code !== null) {
      try {
        const registry = this.env.ROOM_REGISTRY.getByName('global');
        await registry.unregister(code);
      } catch { /* registry may be unavailable; not critical */ }
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Registry sync
  // ────────────────────────────────────────────────────────────────────────

  private async notifyRegistry(): Promise<void> {
    if (this.code === null) return;
    const meta = this.toMeta();
    if (meta === null) return;
    try {
      const registry = this.env.ROOM_REGISTRY.getByName('global');
      await registry.upsert(meta);
    } catch {
      // Registry being unavailable shouldn't break the room — it just means
      // this room won't show in /play until the next event.
    }
  }

  private toMeta(): RoomMeta | null {
    if (this.code === null) return null;
    const host = this.hostPlayerId !== null
      ? Array.from(this.players.values()).find((p) => p.id === this.hostPlayerId)
      : undefined;
    return {
      code: this.code,
      hostNickname: host?.nickname ?? 'unknown',
      status: this.status,
      playerCount: this.players.size,
      spectatorCount: this.spectators.size,
      config: this.config,
      createdAt: this.createdAt ?? Date.now(),
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Helpers / snapshot / send
  // ────────────────────────────────────────────────────────────────────────

  private isHost(ws: WebSocket): boolean {
    const player = this.players.get(ws);
    return player !== undefined && player.id === this.hostPlayerId;
  }

  private findPlayerWs(playerId: string): WebSocket | null {
    for (const [ws, p] of this.players) {
      if (p.id === playerId) return ws;
    }
    return null;
  }

  private snapshot(): RoomPublic {
    return {
      code: this.code ?? 'unknown',
      status: this.status,
      hostPlayerId: this.hostPlayerId,
      config: this.config,
      text: this.status === 'racing' ? this.text : null,
      startedAt: this.startedAt,
      players: Array.from(this.players.values(), toPlayerPublic),
      spectatorCount: this.spectators.size,
    };
  }

  private async persistRoomState(): Promise<void> {
    if (this.code === null) return;
    const state: PersistedRoomState = {
      code: this.code,
      status: this.status,
      hostToken: this.hostToken,
      hostPlayerId: this.hostPlayerId,
      config: this.config,
      createdAt: this.createdAt ?? Date.now(),
      text: this.text,
      startedAt: this.startedAt,
    };
    await this.ctx.storage.put(ROOM_STATE_KEY, state);
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Socket may be in a closing state — ignore, webSocketClose will clean up.
    }
  }

  /** Broadcast to players AND spectators (the common case in Phase 6). */
  private broadcastAll(msg: ServerMessage): void {
    const payload = JSON.stringify(msg);
    for (const ws of this.players.keys()) {
      try { ws.send(payload); } catch { /* ignore */ }
    }
    for (const ws of this.spectators) {
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
    for (const ws of this.spectators) {
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

const ALLOWED_WORD_COUNTS = new Set([10, 25, 50, 100]);
const ALLOWED_TIME_SECONDS = new Set([15, 30, 60]);

function sanitizeConfig(c: RaceConfig): RaceConfig {
  const mode: RaceConfig['mode'] = c.mode === 'time' ? 'time' : 'words';
  const wordCount = ALLOWED_WORD_COUNTS.has(c.wordCount) ? c.wordCount : 25;
  const timeSeconds = ALLOWED_TIME_SECONDS.has(c.timeSeconds) ? c.timeSeconds : 30;
  return {
    mode,
    wordCount,
    timeSeconds,
    punctuation: Boolean(c.punctuation),
  };
}

function generateHostToken(): string {
  // 32 random bytes → 64 hex chars. Enough entropy to be non-guessable.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function clampInt(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  const v = Math.floor(n);
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}
