# @monkey-type/web

Frontend Next.js 16 de [`monkey-type-multiplayer`](../../README.md). App Router, React 19, Tailwind v4.

> 📚 Para arquitectura, decisiones técnicas y guía completa de desarrollo, ver el [README raíz del repo](../../README.md).

## Estructura

```
app/
  page.tsx              # Solo-practice (/)
  play/
    page.tsx            # Lobby landing (/play)
    [code]/page.tsx     # Sala multijugador (/play/XXXXX)
components/
  TypingArea.tsx        # Texto, caret, HUD de métricas
lib/
  typing/
    engine.ts           # Máquina de estados pura (sin React)
    useTypingEngine.ts  # Hook con keyboard listener global
  room/
    code.ts             # Generador de códigos de sala (32-char alphabet)
    useRoomConnection.ts # Hook WebSocket con state management
  storage/
    nickname.ts         # localStorage helper
  config.ts             # WORKER_WS_URL desde NEXT_PUBLIC_WORKER_WS_URL
```

## Comandos

Desde la raíz del monorepo:

```bash
pnpm dev                              # Web en :3000 + worker en :8787
pnpm --filter @monkey-type/web dev    # Solo el web
pnpm --filter @monkey-type/web build  # Build de producción
pnpm --filter @monkey-type/web lint   # ESLint
```

## Variables de entorno

Crea `.env.local` (existe `.env.local.example` como plantilla):

```bash
NEXT_PUBLIC_WORKER_WS_URL=ws://localhost:8787      # dev
# NEXT_PUBLIC_WORKER_WS_URL=wss://...workers.dev   # prod
```

`NEXT_PUBLIC_*` se inlinea al bundle del cliente en build-time. Si la cambias, hay que rebuildear.

## Notas de diseño

- **Sin SSR para `/play/[code]`**: el lobby es enteramente client-side (`'use client'`) porque depende de WebSockets, `localStorage` y `crypto.getRandomValues`. Hidratación en dos fases para evitar SSR/CSR mismatch del nickname.
- **Tema serika dark** definido como CSS custom properties en `app/globals.css` y expuesto a Tailwind con `@theme inline`. Preparado para theme switcher futuro (Fase 4).
- **`useTypingEngine`** usa `useRef` para mutar el state del motor sin pasar por `setState`, evitando que React 18 batchee y pierda keystrokes a >100 wpm.
- **Reglas estrictas de `react-hooks` v6** (`purity`, `refs`, `set-state-in-effect`) están desactivadas en `eslint.config.mjs` con justificación documentada.
