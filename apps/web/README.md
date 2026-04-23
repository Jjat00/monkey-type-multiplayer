# @monkey-type/web

Frontend Next.js 16 de [`keyduelo`](../../README.md). App Router, React 19, Tailwind v4.

> 📚 Para arquitectura, decisiones técnicas y guía completa de desarrollo, ver el [README raíz del repo](../../README.md).

## Estructura

```
app/
  layout.tsx            # ThemeProvider + SettingsProvider + SoundProvider + Header + Footer
  globals.css           # CSS vars por tema, scroller, caret animation
  icon.png              # Favicon (convención Next.js, auto-detectado)
  apple-icon.png        # iOS home-screen icon (convención Next.js)
  page.tsx              # Solo-practice (/)
  play/
    page.tsx            # Lobby público con lista de salas (/play)
    [code]/page.tsx     # Sala multijugador (/play/XXXXX), branch por rol
components/
  Header.tsx            # Nav global + theme switcher + sound switcher
  Footer.tsx            # Link al repo GitHub (server component)
  ConfigBar.tsx         # Config editable; acepta value/onChange opcional (host-driven)
  HostControls.tsx      # Admin-only: ConfigBar + start + kick por peer + ready indicator
  CopyButton.tsx        # Copy a clipboard con fallback execCommand
  TypingArea.tsx        # Texto + scroller estilo Monkeytype + caret + HUD (countdown en time mode)
lib/
  settings/
    types.ts            # Mode ('words'|'time'), WordCount, TimeSeconds, Settings
    storage.ts          # localStorage con validación field-by-field
    SettingsProvider.tsx # Context + useSettings hook (solo-practice)
  sound/
    types.ts            # SoundType ('off'|'click'|'mech'|'pop')
    storage.ts          # localStorage
    synth.ts            # Web Audio API: AudioContext singleton, synths
    SoundProvider.tsx   # Context + useSound hook (expone playKey estable)
  theme/
    themes.ts           # 5 paletas (dracula default, warm-dark, warm-light, nord, gruvbox-dark)
    storage.ts          # getStoredTheme, setStoredTheme, applyTheme
    ThemeProvider.tsx   # Context + useTheme hook
    noFlashScript.ts    # Inline blocking script para evitar FOUT
  typing/
    engine.ts           # Máquina de estados pura (sin React)
    useTypingEngine.ts  # Hook con keyboard listener global + forceFinish para time-mode externo
  room/
    code.ts             # Generador de códigos de sala (32-char alphabet)
    useRoomConnection.ts # Hook WebSocket: role, hostToken, kicked, host_changed, spectator
    useRoomList.ts      # Polling de GET /rooms cada 2s (AbortController cleanup)
  storage/
    nickname.ts         # localStorage helper + generateGuestNickname + resolveNickname
    hostId.ts           # getHostToken/setHostToken/clearHostToken por código
  config.ts             # WORKER_WS_URL + WORKER_HTTP_URL (derivado por protocolo)
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

`WORKER_HTTP_URL` se deriva automáticamente de `WORKER_WS_URL` cambiando el protocolo (`ws://` → `http://`, `wss://` → `https://`). Se usa para el polling del lobby a `/rooms`. No hay una segunda env var.

## Notas de diseño

### Routing y páginas

- **Sin SSR para `/play/[code]`**: el lobby de sala es enteramente client-side (`'use client'`) porque depende de WebSockets, `localStorage` y `crypto.getRandomValues`. Hidratación en dos fases para evitar SSR/CSR mismatch del nickname.
- **`useSearchParams` dentro de `<Suspense>`** en `/play` y `/play/[code]`: requerido por Next.js 16 para que el prerender estático funcione sin bailar a CSR.

### Multijugador

- **Lista de salas**: el hook `useRoomList` poolea `GET /rooms` cada 2s con `AbortController` cleanup en unmount. `WORKER_HTTP_URL` se deriva de la env var WS — una sola fuente de verdad.
- **Branch por rol** en `/play/[code]`:
  - `host` → `<HostControls />` con `<ConfigBar />` controlada, botón "start race", kick por peer
  - `player` → lista de players + `ReadyToggle` + texto "waiting for host to start"
  - `spectator` → lista de players + config read-only, en racing solo ve `PeerProgressBars` (sin TypingArea) + countdown sincronizado
- **`useRoomConnection` maneja 4 mensajes nuevos**: `joined` guarda `hostToken` en localStorage (solo si rol es host), `host_changed` promueve/demote local, `config_updated` no-op (room_state trae la config), `kicked` limpia el token y dispara callback.
- **`hostToken` persistencia**: `localStorage[mtmp:hostTokens][code] = token`. Al conectar el hook lee el token guardado y lo incluye en `join`. El server rotea el token en cada reasignación para neutralizar tokens filtrados.
- **Nickname opcional**: `resolveNickname(input)` retorna el input trimmed o un `guest####` random si vacío. Aplicado en ambas entradas (`/play` y `/play/[code]`); ningún prompt bloqueante.

### Typing & carrera

- **`TypingArea` con scroll estilo Monkeytype**: mide `lineHeight` post-mount, fija el container a 3 líneas con `overflow:hidden + mask-image gradient`, y traslada el wrapper interno con `translateY` para mantener el caret en la línea 2. El caret vive **fuera** del scroller (en el container relative parent) — si estuviera adentro, el `translateY` lo movería de más y se clipearía.
- **`useTypingEngine`** usa `useRef` para mutar el state del motor sin pasar por `setState`, evitando que React 18 batchee y pierda keystrokes a >100 wpm.
- **`forceFinish()`** en el hook permite disparar el fin de carrera externamente — usado por multiplayer time mode anclado a `raceStartedAt` del server (no al primer keystroke local).
- **`useServerCountdown`** (en `/play/[code]/page.tsx`) deriva los segundos restantes de `Date.now() - raceStartedAt` tickeando cada 200ms. Todos los clientes (players + spectators) ven el mismo countdown sincronizado.
- **Bars relativas en time mode**: en `PeerProgressBars`, en time mode el total del bar es `max(charIndex de todos los players)` en vez de `text.length` — así el leader tiene bar al 100% y el resto es relativo. En words mode sigue siendo `text.length`.

### Configuración por usuario

- **`ConfigBar` con modo opcional controlled**: si recibe `value` + `onChange` opera como controlled component (usado por el host en multiplayer). Si no, hace fallback al `useSettings` local (solo-practice).
- **Settings de solo-practice** (`lib/settings/`): modo `words` (10/25/50/100) o `time` (15/30/60s) y toggle de puntuación. El `useTypingEngine` recibe `timeLimitSeconds` opcional y schedula un `setTimeout` desde el primer keystroke. En time mode la página genera 250 palabras de buffer (suficientes para 60s a >100wpm).

### Theme y audio

- **Theme system con 5 paletas** (`lib/theme/`): cambia las CSS custom properties del `<html>` en runtime; las utilidades Tailwind (`bg-bg`, `text-main`, etc.) se actualizan en vivo gracias al `@theme inline` de `globals.css`. El `noFlashScript` inline en `<head>` aplica el tema guardado antes de hidratar para evitar FOUT. Default theme: **dracula**. `nord`/`dracula`/`gruvbox` provienen de proyectos open-source independientes (atribuidos en el [LICENSE](../../LICENSE)); `warm-dark`/`warm-light` están inspirados en el tema `serika` de Monkeytype.
- **Sonido de teclas** (`lib/sound/`): 4 modos (off/click/mech/pop) generados con Web Audio API en `synth.ts` — sin audio files, sin descargas. `AudioContext` singleton inicializado lazy en el primer keystroke (browsers bloquean Audio antes de un user gesture). El `useTypingEngine` invoca `onKeystroke(correct)` que reproduce sonido normal o pitch-shifted hacia abajo si el char es incorrecto.

### Layout global

- **Header fijo** (`components/Header.tsx`) overlay sobre el contenido con `bg/90 + backdrop-blur` — no participa del flow.
- **Footer pegado al fondo del viewport** (`components/Footer.tsx`) gracias a que el body es `min-h-dvh flex flex-col` y el `<main>` de cada página usa `flex-1`. Link al repo en GitHub (`https://github.com/Jjat00/keyduelo`).
- **Favicon**: `app/icon.png` + `app/apple-icon.png` detectados por convención de Next.js 16 — no hace falta `<link>` manual en el layout.

### Reglas de ESLint relajadas

**Reglas estrictas de `react-hooks` v6** (`purity`, `refs`, `set-state-in-effect`) están desactivadas en `eslint.config.mjs` con justificación documentada. Se usan patrones legítimos que esas reglas rechazan: ref-as-state en `useTypingEngine`, `setState` post-mount para hidratación, y `performance.now()` en render para métricas live.

## Atajos de teclado

| Tecla | Contexto | Acción |
|---|---|---|
| `Tab` o `Esc` | Solo-practice (`/`) | Genera un texto nuevo |
| `Esc` | Theme / sound switcher abierto | Cierra el dropdown |
