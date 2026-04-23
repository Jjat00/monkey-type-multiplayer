'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useSound } from '@/lib/sound/SoundProvider';
import { SOUND_TYPES, soundLabel, type SoundType } from '@/lib/sound/types';
import { useTheme } from '@/lib/theme/ThemeProvider';
import { THEMES, THEME_NAMES, themeLabel, type ThemeName } from '@/lib/theme/themes';

export function Header() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 h-12 bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
      <nav className="mx-auto flex h-full max-w-5xl items-center justify-between px-6 font-mono text-sm">
        <Link
          href="/"
          className="flex items-center gap-2 text-text transition-colors hover:text-main"
        >
          <span className="text-main">⌨</span>
          <span className="font-semibold tracking-tight">
            <span className="text-text">key</span>
            <span className="text-main">duelo</span>
          </span>
        </Link>

        <div className="flex items-center gap-6">
          <NavLink href="/" label="solo" />
          <NavLink href="/play" label="multi" />
          <SoundSwitcher />
          <ThemeSwitcher />
        </div>
      </nav>
    </header>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  // Treat `/play/*` as "multi" too so the link stays highlighted in lobbies.
  const active =
    href === '/' ? pathname === '/' : pathname?.startsWith(href);
  return (
    <Link
      href={href}
      className={`transition-colors ${
        active ? 'text-main' : 'text-sub hover:text-text'
      }`}
    >
      {label}
    </Link>
  );
}

function SoundSwitcher() {
  const { sound, setSound } = useSound();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const icon = sound === 'off' ? '🔇' : '🔊';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 text-sub transition-colors hover:text-text"
      >
        <span aria-hidden="true">{icon}</span>
        <span className="hidden sm:inline">{soundLabel(sound)}</span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-full mt-2 w-40 overflow-hidden rounded bg-sub-alt py-1 shadow-lg ring-1 ring-black/20"
        >
          {SOUND_TYPES.map((name: SoundType) => {
            const selected = name === sound;
            return (
              <li key={name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    setSound(name);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                    selected ? 'text-main' : 'text-text hover:bg-bg/40'
                  }`}
                >
                  <span aria-hidden="true">{name === 'off' ? '🔇' : '🔊'}</span>
                  <span>{name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 text-sub transition-colors hover:text-text"
      >
        <ThemeDot palette={THEMES[theme]} />
        <span className="hidden sm:inline">{themeLabel(theme)}</span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-full mt-2 w-48 overflow-hidden rounded bg-sub-alt py-1 shadow-lg ring-1 ring-black/20"
        >
          {THEME_NAMES.map((name) => {
            const selected = name === theme;
            return (
              <li key={name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    setTheme(name);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                    selected ? 'text-main' : 'text-text hover:bg-bg/40'
                  }`}
                >
                  <ThemeDot palette={THEMES[name]} />
                  <span>{themeLabel(name)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * 3-dot palette preview using the theme's bg/main/text colors. Inline styles
 * because we need literal hex values from the palette object, not CSS vars
 * (otherwise every dot in the dropdown would show the CURRENT theme).
 */
function ThemeDot({ palette }: { palette: typeof THEMES[ThemeName] }) {
  return (
    <span className="flex items-center gap-0.5" aria-hidden="true">
      <span
        className="size-2 rounded-full"
        style={{ background: palette.bg, boxShadow: '0 0 0 1px rgba(255,255,255,0.1)' }}
      />
      <span
        className="size-2 rounded-full"
        style={{ background: palette.main }}
      />
      <span
        className="size-2 rounded-full"
        style={{ background: palette.text }}
      />
    </span>
  );
}
