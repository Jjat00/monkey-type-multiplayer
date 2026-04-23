export { Room } from './room.ts';
export { RoomRegistry } from './registry.ts';

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response('ok', { status: 200 });
    }

    // Lobby discovery endpoint — the web client polls this every few seconds
    // to render the `/play` room list. No auth; the registry is world-visible
    // by design (same as the WS endpoints).
    if (url.pathname === '/rooms') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (request.method !== 'GET') {
        return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
      }
      const registry = env.ROOM_REGISTRY.getByName('global');
      const rooms = await registry.list();
      return Response.json(rooms, {
        headers: { ...CORS_HEADERS, 'cache-control': 'no-store' },
      });
    }

    const match = url.pathname.match(/^\/room\/([A-Z0-9]{4,8})\/ws$/i);
    if (!match) {
      return new Response('Not found', { status: 404 });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const roomCode = match[1]!.toUpperCase();
    const stub = env.ROOM.getByName(roomCode);
    return stub.fetch(request);
  },
} satisfies ExportedHandler<Env>;
