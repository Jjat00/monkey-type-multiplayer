/**
 * Synthesized typing sounds via Web Audio API. No audio files needed.
 *
 * Each sound is a short (30–60ms) burst with an exponential gain envelope
 * for a clean attack and decay. Errors play a lower-pitched variant so the
 * typist gets immediate audible feedback when they hit the wrong key.
 *
 * The AudioContext is created lazily on the first call (browsers require a
 * user gesture before allowing audio — keystrokes count as one) and reused
 * across calls to keep latency under 1ms per sound.
 */

import type { SoundType } from './types.ts';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  // Browsers may suspend the context when the tab loses focus; resume() is
  // a no-op if it's already running.
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  return ctx;
}

/**
 * Public entry point. `isError = true` shifts the chosen sound down in pitch
 * so wrong keystrokes are audibly distinct from correct ones.
 */
export function playSound(type: SoundType, isError: boolean = false): void {
  if (type === 'off') return;
  const c = getCtx();
  if (!c) return;
  switch (type) {
    case 'click': return playClick(c, isError);
    case 'mech':  return playMech(c, isError);
    case 'pop':   return playPop(c, isError);
  }
}

// ---------------------------------------------------------------------------
// Individual synths. Volumes intentionally low (≤0.2) so multiple keys per
// second don't fatigue the listener.
// ---------------------------------------------------------------------------

function playClick(c: AudioContext, isError: boolean): void {
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();

  osc.type = 'sine';
  osc.frequency.value = isError ? 380 : 760;

  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

  osc.connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.05);
}

function playMech(c: AudioContext, isError: boolean): void {
  const now = c.currentTime;

  // White-noise burst → the percussive "tk" of a mechanical switch.
  const buffer = c.createBuffer(1, Math.floor(c.sampleRate * 0.04), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  const source = c.createBufferSource();
  source.buffer = buffer;

  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = isError ? 800 : 1600;
  filter.Q.value = 1;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

  source.connect(filter).connect(gain).connect(c.destination);
  source.start(now);
}

function playPop(c: AudioContext, isError: boolean): void {
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();

  osc.type = 'sine';
  // Quick downward pitch sweep gives the bubble-pop character.
  const startFreq = isError ? 600 : 1200;
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(startFreq / 2, now + 0.06);

  gain.gain.setValueAtTime(0.16, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

  osc.connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.07);
}
