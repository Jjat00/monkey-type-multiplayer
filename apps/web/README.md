# @monkey-type/web

Frontend Next.js 16 de [`monkey-type-multiplayer`](../../README.md). App Router, React 19, Tailwind v4.

> 📚 Para arquitectura, decisiones técnicas y guía completa de desarrollo, ver el [README raíz del repo](../../README.md).

## Estructura

```
app/
  layout.tsx            # ThemeProvider + Header global + no-flash script
  globals.css           # CSS vars por tema, scroller, caret animation
  page.tsx              # Solo-practice (/)
  play/
    page.tsx            # Lobby landing (/play)
    [code]/page.tsx     # Sala multijugador (/play/XXXXX)
components/
  Header.tsx            # Nav global (solo/multi) + theme switcher dropdown
  ConfigBar.tsx         # Solo-practice config: puntuación, mode words/time, cantidad
  TypingArea.tsx        # Texto + scroller estilo Monkeytype + caret + HUD (incluye contador en time mode)
lib/
  settings/
    types.ts            # Mode ('words'|'time'), WordCount, TimeSeconds, Settings
    storage.ts          # localStorage con validación field-by-field
    SettingsProvider.tsx # Context + useSettings hook
  sound/
    types.ts            # SoundType ('off'|'click'|'mech'|'pop')
    storage.ts          # localStorage
    synth.ts            # Web Audio API: AudioContext singleton, synths
    SoundProvider.tsx   # Context + useSound hook (expone playKey)
  theme/
    themes.ts           # 5 paletas (dracula default, warm-dark, warm-light, nord, gruvbox-dark)
    storage.ts          # getStoredTheme, setStoredTheme, applyTheme
    ThemeProvider.tsx   # Context + useTheme hook
    noFlashScript.ts    # Inline blocking script para evitar FOUT
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
- **Theme system con 5 paletas** (`lib/theme/`): cambia las CSS custom properties del `<html>` en runtime; las utilidades Tailwind (`bg-bg`, `text-main`, etc.) se actualizan en vivo gracias al `@theme inline` de `globals.css`. El `noFlashScript` inline en `<head>` aplica el tema guardado antes de hidratar para evitar FOUT. Default theme: **dracula**. `nord`/`dracula`/`gruvbox` provienen de proyectos open-source independientes (atribuidos en el [LICENSE](../../LICENSE)); `warm-dark`/`warm-light` están inspirados en el tema `serika` de Monkeytype.
- **Settings de carrera** (`lib/settings/`) en solo-practice: modo `words` (10/25/50/100) o `time` (15/30/60s) y toggle de puntuación. Mismo patrón provider+storage que el theme. El `useTypingEngine` recibe `timeLimitSeconds` opcional y schedula un `setTimeout` desde el primer keystroke. En time mode el page genera 250 palabras de buffer (suficientes para 60s a >100wpm).
- **Sonido de teclas** (`lib/sound/`): 4 modos (off/click/mech/pop) generados con Web Audio API en `synth.ts` — sin audio files, sin descargas. AudioContext singleton inicializado lazy en el primer keystroke (browsers bloquean Audio antes de un user gesture). El `useTypingEngine` invoca `onKeystroke(correct)` que reproduce sonido normal o pitch-shifted hacia abajo si el char es incorrecto.
- **Header fijo** (`components/Header.tsx`) overlay sobre el contenido con `bg/90 + backdrop-blur` — no participa del flow para no romper el `min-h-dvh + justify-center` de las pages.
- **Texto que scrollea estilo Monkeytype**: el `TypingArea` mide `lineHeight` post-mount, fija el container a 3 líneas con `overflow:hidden + mask-image gradient`, y traslada el wrapper interno con `translateY` para mantener el caret en la línea 2 (anchored).
- **Atajos**: `Tab` o `Esc` en `/` generan un texto nuevo; `Esc` también cierra el theme switcher.
- **`useTypingEngine`** usa `useRef` para mutar el state del motor sin pasar por `setState`, evitando que React 18 batchee y pierda keystrokes a >100 wpm.
- **Reglas estrictas de `react-hooks` v6** (`purity`, `refs`, `set-state-in-effect`) están desactivadas en `eslint.config.mjs` con justificación documentada.
