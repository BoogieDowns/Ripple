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
 * - iOS WebKit (which is what Safari, Chrome, Brave, and every other
 *   browser is required to run on iOS — Apple mandates the same engine
 *   underneath regardless of branding) has historically been stricter
 *   about unlocking audio than desktop browsers or Android. Two separate
 *   unlock mechanisms are used defensively: a silent Web Audio buffer
 *   (unlocks the AudioContext specifically) and a silent HTMLAudioElement
 *   play() call (a completely separate browser subsystem from Web Audio,
 *   and historically the single most reliable gesture-unlock trick across
 *   mobile browsers generally). Belt and suspenders — either one alone
 *   is usually enough, but this doesn't rely on guessing which.
 */

import { useEffect, useRef, useState } from "react";

const TONE_VOLUME = 0.12;
const RAMP_SECONDS = 0.05;
const FREQUENCY_SMOOTHING_SECONDS = 0.01;

// A silent, ~0.1s WAV as a data URI — used purely to unlock the
// HTMLAudioElement subsystem via a real play() call inside the gesture.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

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
    // Defensive: if a previous attempt left the context in a closed or
    // otherwise broken state, don't keep reusing it — rebuild from
    // scratch rather than silently reusing something non-functional.
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      return audioCtxRef.current;
    }

    // Unlock #1: a real HTMLAudioElement play() call, a different
    // browser subsystem entirely from Web Audio/AudioContext.
    try {
      const silentAudio = new Audio(SILENT_WAV);
      silentAudio.play().catch(() => {
        // Some browsers reject this too — the AudioContext unlock below
        // is the one that actually matters for the oscillator itself.
      });
    } catch {
      // Audio element unsupported/blocked — continue regardless.
    }

    const AudioContextClass: typeof AudioContext =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextClass();

    // Unlock #2: a silent, effectively zero-length Web Audio buffer,
    // played within this same gesture — specifically unlocks the
    // AudioContext/oscillator pipeline, separate from the above.
    const unlockBuffer = ctx.createBuffer(1, 1, 22050);
    const unlockSource = ctx.createBufferSource();
    unlockSource.buffer = unlockBuffer;
    unlockSource.connect(ctx.destination);
    unlockSource.start(0);

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

  const toggle = async () => {
    // TEMPORARY DIAGNOSTIC: two rounds of reasonable, well-documented
    // fixes haven't resolved tone on iOS, which means continuing to
    // guess blind isn't a good use of another round. This wraps
    // everything in a try/catch that surfaces the *actual* error (if
    // any is even being thrown) directly on the device via alert(),
    // since remote debugging tools aren't always available on mobile.
    // Screenshot whatever this shows (or the fact that nothing shows at
    // all, which is itself useful information) and that tells us
    // exactly what to fix next, instead of another guess. Remove this
    // try/catch once the real cause is identified.
    try {
      const ctx = ensureAudioGraph();
      const gainNode = gainRef.current;
      if (!gainNode) {
        window.alert("Tone diagnostic: gainNode is missing after ensureAudioGraph().");
        return;
      }

      // Always attempt resume() here, not just when ctx.state looks
      // suspended — iOS/WebKit can silently re-suspend an existing context
      // after the tab loses focus or after a period of inactivity, and
      // checking `.state` first occasionally lags reality on that platform.
      // Awaiting it (rather than firing-and-forgetting) ensures the
      // gain ramp below is scheduled only once the context is actually
      // confirmed running, which is a stricter requirement on WebKit than
      // on Chromium/desktop.
      try {
        await ctx.resume();
      } catch {
        // Some browsers reject resume() if already running — harmless.
      }

      setIsOn((prev) => {
        const next = !prev;
        const now = ctx.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setTargetAtTime(next ? TONE_VOLUME : 0, now, RAMP_SECONDS);
        return next;
      });

      // Surfaces the actual state right after toggling, since "silent"
      // could mean several different things (context suspended, volume
      // at 0, context never created at all) that all look the same from
      // the outside.
      window.alert(
        `Tone diagnostic: ctx.state=${ctx.state}, gain=${gainNode.gain.value.toFixed(3)}`
      );
    } catch (err) {
      window.alert("Tone error: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  return { isOn, toggle };
}
