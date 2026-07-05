/**
 * useTone
 *
 * Plays a sine tone at the given frequency (the same Hz value driving
 * the wave simulation's oscillator), toggleable on/off. This is
 * completely separate from the simulation itself — it doesn't feed
 * into or read from the wave equation, it's just an audible reference
 * for the same frequency you're looking at.
 *
 * Implementation notes:
 * - Browsers block audio from starting without a user gesture, so the
 *   AudioContext/oscillator/gain graph is only created lazily, on the
 *   first call to `toggle()` (which only ever happens from a button
 *   click) — never on mount.
 * - The oscillator itself is only ever started once and left running
 *   for the lifetime of the app; muting/unmuting is done by ramping a
 *   GainNode's value rather than stopping/restarting the oscillator,
 *   since an OscillatorNode can only be started once — restarting the
 *   "tone" would otherwise mean tearing down and recreating the whole
 *   audio graph every toggle.
 * - Frequency changes use `setTargetAtTime` (a short exponential ramp)
 *   rather than an instant value jump, to avoid an audible click/zipper
 *   noise when the Frequency slider moves quickly.
 */

import { useEffect, useRef, useState } from "react";

const TONE_VOLUME = 0.12;
const RAMP_SECONDS = 0.05;
const FREQUENCY_SMOOTHING_SECONDS = 0.01;

export function useTone(frequency: number) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const [isOn, setIsOn] = useState(false);

  // Keep the oscillator's frequency in sync with the current slider
  // value even while muted, so it's already correct the instant you
  // turn the tone on.
  useEffect(() => {
    const ctx = audioCtxRef.current;
    const osc = oscillatorRef.current;
    if (ctx && osc) {
      osc.frequency.setTargetAtTime(frequency, ctx.currentTime, FREQUENCY_SMOOTHING_SECONDS);
    }
  }, [frequency]);

  // Clean up the audio graph if the component using this hook unmounts.
  useEffect(() => {
    return () => {
      audioCtxRef.current?.close().catch(() => {
        // Already closed or unsupported — nothing to do.
      });
    };
  }, []);

  const ensureAudioGraph = (): AudioContext => {
    if (audioCtxRef.current) return audioCtxRef.current;

    const AudioContextClass: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextClass();

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    gainNode.gain.value = 0; // starts silent regardless of isOn state
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start();

    audioCtxRef.current = ctx;
    oscillatorRef.current = osc;
    gainRef.current = gainNode;
    return ctx;
  };

  const toggle = () => {
    const ctx = ensureAudioGraph();
    const gainNode = gainRef.current;
    if (!gainNode) return;

    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    setIsOn((prev) => {
      const next = !prev;
      const now = ctx.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setTargetAtTime(next ? TONE_VOLUME : 0, now, RAMP_SECONDS);
      return next;
    });
  };

  return { isOn, toggle };
}
