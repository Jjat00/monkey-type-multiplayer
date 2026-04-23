'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { getStoredSettings, setStoredSettings } from './storage.ts';
import { DEFAULT_SETTINGS, type Settings } from './types.ts';

interface SettingsContextValue {
  settings: Settings;
  /** Patch one or more fields. Fields you don't pass keep their current value. */
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  // Hydrate with defaults to keep SSR markup deterministic; the effect below
  // syncs from localStorage after mount. There's a brief flash to defaults
  // for users with custom settings, but solo-practice doesn't render the
  // text until effects run anyway, so it's not visible.
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(getStoredSettings());
  }, []);

  const update = useCallback((patch: Partial<Settings>): void => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      setStoredSettings(next);
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, update }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used inside a SettingsProvider');
  }
  return ctx;
}
