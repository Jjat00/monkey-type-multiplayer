/**
 * Host token persistence — keyed by room code so a user can be host of
 * multiple rooms simultaneously (one per browser tab/code combo).
 *
 * The token is the server-issued capability that proves "I created this
 * room" or "I was promoted via host_changed". On reconnect we send it
 * back in the `join` message; the server verifies and re-grants admin.
 *
 * NOT secure auth — anyone with the token controls the room. Don't put
 * sensitive data behind it. Treat it like a Google Docs share link.
 */
const KEY = 'mtmp:hostTokens';

type Store = Record<string, string>;

function read(): Store {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return {};
    const out: Store = {};
    for (const [code, token] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof token === 'string' && token.length > 0) out[code] = token;
    }
    return out;
  } catch {
    return {};
  }
}

function write(store: Store): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* quota exceeded or unavailable — silent fail is fine for a hint */
  }
}

export function getHostToken(code: string): string | null {
  return read()[code.toUpperCase()] ?? null;
}

export function setHostToken(code: string, token: string): void {
  const store = read();
  store[code.toUpperCase()] = token;
  write(store);
}

export function clearHostToken(code: string): void {
  const store = read();
  delete store[code.toUpperCase()];
  write(store);
}
