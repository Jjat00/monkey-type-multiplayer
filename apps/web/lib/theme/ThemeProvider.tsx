'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { applyTheme, getStoredTheme, setStoredTheme } from './storage.ts';
import { DEFAULT_THEME, type ThemeName } from './themes.ts';

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Default to DEFAULT_THEME so SSR markup matches the no-script fallback in
  // globals.css. The inline script in <head> already applied the user's stored
  // theme to the DOM before React hydrated, so there's no visible flash.
  const [theme, setThemeState] = useState<ThemeName>(DEFAULT_THEME);

  // Sync React state with whatever the inline script applied to the DOM.
  useEffect(() => {
    setThemeState(getStoredTheme());
  }, []);

  const setTheme = useCallback((name: ThemeName): void => {
    setThemeState(name);
    setStoredTheme(name);
    applyTheme(name);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used inside a ThemeProvider');
  }
  return ctx;
}
