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
 * - OUTPUT ROUTING (the actual fix for iOS silence): this does NOT
 *   connect the gain node directly to `ctx.destination`. On iOS/WebKit,
 *   a Web Audio graph connected straight to ctx.destination can report
 *   completely normal internal state (AudioContext "running", gain
 *   ramping as scheduled) while producing genuinely zero audible
 *   output — WebKit doesn't always treat that connection alone as a
 *   real "media playback" session at the OS level. That exact
 *   signature (everything reports fine, nothing audible) is what
 *   testing showed here. The standard fix: route the signal through a
 *   MediaStreamAudioDestinationNode and play that stream via a real
 *   HTMLAudioElement instead — iOS reliably recognizes an actual
 *   <audio> element as genuine playback. This is used as the *only*
 *   output path (not in addition to a direct destination connection)
 *   specifically to avoid the tone playing twice on platforms where
 *   direct-destination output already worked fine (like desktop).
 */

import { useEffect, useRef, useState } from "react";

const TONE_VOLUME = 0.12;
const RAMP_SECONDS = 0.05;
const FREQUENCY_SMOOTHING_SECONDS = 0.01;

export function useTone(frequency: number) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const mediaElRef = useRef<HTMLAudioElement | null>(null);
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
      mediaElRef.current?.pause();
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
    osc.start();

    // The actual output path — see the module doc comment above for why
    // this is a MediaStream + real <audio> element rather than a direct
    // connection to ctx.destination.
    const streamDestination = ctx.createMediaStreamDestination();
    gainNode.connect(streamDestination);

    const mediaEl = new Audio();
    mediaEl.srcObject = streamDestination.stream;
    mediaEl.volume = 1; // actual loudness is controlled upstream by gainNode
    mediaEl.play().catch(() => {
      // If this rejects, the resume()/play() retry in toggle() below
      // (also inside a user-gesture call) gets another chance.
    });

    audioCtxRef.current = ctx;
    oscillatorRef.current = osc;
    gainRef.current = gainNode;
    mediaElRef.current = mediaEl;
    return ctx;
  };

  const toggle = async () => {
    const ctx = ensureAudioGraph();
    const gainNode = gainRef.current;
    const mediaEl = mediaElRef.current;
    if (!gainNode) return;

    // Always attempt resume()/play() here, not just when state looks
    // wrong — iOS/WebKit can silently re-suspend things after the tab
    // loses focus or after a period of inactivity, and checking state
    // first occasionally lags reality on that platform. Awaiting resume()
    // ensures the gain ramp below is scheduled only once the context is
    // actually confirmed running.
    try {
      await ctx.resume();
    } catch {
      // Some browsers reject resume() if already running — harmless.
    }
    if (mediaEl && mediaEl.paused) {
      mediaEl.play().catch(() => {});
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
