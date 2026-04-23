'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getStoredSound, setStoredSound } from './storage.ts';
import { playSound } from './synth.ts';
import { DEFAULT_SOUND, type SoundType } from './types.ts';

interface SoundContextValue {
  sound: SoundType;
  setSound: (s: SoundType) => void;
  /**
   * Stable function that callers wire into typing keystrokes. Reads the
   * current sound choice from a ref so it never goes stale even if the
   * caller closes over an old value.
   */
  playKey: (isError?: boolean) => void;
}

const SoundContext = createContext<SoundContextValue | null>(null);

export function SoundProvider({ children }: { children: ReactNode }) {
  const [sound, setSoundState] = useState<SoundType>(DEFAULT_SOUND);
  const soundRef = useRef<SoundType>(DEFAULT_SOUND);

  useEffect(() => {
    const stored = getStoredSound();
    soundRef.current = stored;
    setSoundState(stored);
  }, []);

  const setSound = useCallback((next: SoundType): void => {
    soundRef.current = next;
    setSoundState(next);
    setStoredSound(next);
    // Play a sample immediately so the user hears what they picked.
    if (next !== 'off') playSound(next, false);
  }, []);

  // Stable identity — keystroke callbacks shouldn't fire re-renders by
  // changing reference each time the sound choice updates.
  const playKey = useCallback((isError = false): void => {
    playSound(soundRef.current, isError);
  }, []);

  return (
    <SoundContext.Provider value={{ sound, setSound, playKey }}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSound(): SoundContextValue {
  const ctx = useContext(SoundContext);
  if (!ctx) {
    throw new Error('useSound must be used inside a SoundProvider');
  }
  return ctx;
}
