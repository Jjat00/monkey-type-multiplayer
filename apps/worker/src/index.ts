export { Room } from './room.ts';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return new Response('ok', { status: 200 });
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
