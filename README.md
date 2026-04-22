# monkey-type-multiplayer

Multiplayer typing race inspired by [Monkeytype](https://monkeytype.com).
Players join a room via short code and race on the same text — winner is the highest WPM.

## Stack

- **Frontend:** Next.js 15 + React + TypeScript + Tailwind CSS — hosted on Cloudflare Pages
- **Realtime backend:** Cloudflare Workers + Durable Objects (one DO instance per room) — WebSocket native, edge-deployed
- **Monorepo:** Turborepo + pnpm workspaces

## Layout

```
apps/
  web/          Next.js client
  worker/       Cloudflare Worker + Room Durable Object
packages/
  shared/       Types + WebSocket protocol shared between web and worker
```

## Development

```bash
pnpm install
pnpm dev          # runs web (3000) and worker (8787) in parallel
```

## Status

MVP in progress. See commits for current state.
