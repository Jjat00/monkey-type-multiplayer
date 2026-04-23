/**
 * Public client config. Anything here ends up in the browser bundle, so
 * never put secrets in this file.
 *
 * `NEXT_PUBLIC_WORKER_WS_URL` overrides the default. In production set it
 * to wss://<your-worker>.workers.dev (or your custom domain).
 */
export const WORKER_WS_URL: string =
  process.env.NEXT_PUBLIC_WORKER_WS_URL ?? 'ws://localhost:8787';

/**
 * HTTP(S) variant of the worker URL for non-WebSocket endpoints (`/rooms`,
 * `/health`). Derived by swapping the protocol so we don't need a second
 * env var that could drift out of sync.
 */
export const WORKER_HTTP_URL: string = WORKER_WS_URL.replace(/^ws/, 'http');

export function buildRoomWsUrl(code: string): string {
  return `${WORKER_WS_URL}/room/${encodeURIComponent(code)}/ws`;
}
