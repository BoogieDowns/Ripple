/**
 * Draws the current simulation state to a 2D canvas.
 *
 * Reads the simulation's height field directly — nothing here is
 * pre-generated or frequency-mapped independently of the sim. If the
 * simulation state is flat, the render is flat. Color palette is a
 * pure cosmetic remap of the same height data (see colorMap.ts) and
 * has no effect on the underlying physics.
 *
 * RENDER-ONLY SMOOTHING NOTE: `boxBlur3` below applies a very mild blur
 * to a *copy* of the height field purely for display. The finite-
 * difference scheme produces some grid-scale high-frequency noise
 * (numerical dispersion), especially at small source radii and high
 * frequencies — real behavior of this class of explicit scheme, not a
 * bug, but visually grainy at screen resolution. This blur reduces that
 * grain the same way anti-aliasing smooths a rendered edge. It never
 * touches the simulation's actual buffers, so the physics is unaffected.
 *
 * AUTO-EXPOSURE NOTE: some parameter combinations (very high amplitude
 * with very low damping, for instance) push actual height values well
 * outside what a fixed Gain divisor can represent — everything clips to
 * one saturated color, even though real pattern detail exists in the
 * data underneath. Rather than requiring you to manually match Gain to
 * whatever Amplitude/Damping happen to be set to, this measures the
 * data's own typical magnitude each frame (an RMS over the visible
 * cells, smoothed over time so it doesn't flicker/pump like a camera
 * hunting for exposure) and uses that as the actual divisor. The Gain
 * slider becomes a multiplier on top of that auto-detected scale (1.0 =
 * neutral, higher/lower brightens/dims from there) rather than being the
 * sole divisor itself. This should make legible patterns show up across
 * the full range of slider combinations, not just the ones a fixed Gain
 * value happened to be calibrated for.
 */

import type { GridDimensions } from "../simulation/types";
import { heightToColor, specularBoost, type ColorMode, type RGB } from "./colorMap";
import { boxBlur3 } from "./boxBlur";

export interface RenderOptions {
  gain: number; // relative multiplier on top of the auto-detected exposure scale (1.0 = neutral)
  colorMode: ColorMode;
  customColors?: RGB[]; // only used when colorMode === "custom"
  /** Current oscillator frequency (Hz, the same value on the Frequency
   * slider). Higher frequencies pack rings more tightly together — more
   * spatial detail than a fixed grid can fully resolve, which is what
   * shows up as a grainy/pixelated ring edge. Passing it through lets
   * the blur below scale itself to match, rather than using one fixed
   * amount that's a compromise between "not enough at high frequency"
   * and "too soft at low frequency". */
  frequency?: number;
}

let imageDataCache: ImageData | null = null;
let bufferCache: Uint8ClampedArray | null = null;

// Auto-exposure state — persists across calls (module-level, not per-call)
// so the exposure adapts smoothly frame to frame rather than being
// recomputed from scratch, and survives incidental effect re-runs in
// SimulationCanvas (color mode changes, etc.) which don't reset it.
let smoothedRms = 0;
let rmsInitialized = false;

// How much the smoothed RMS moves toward the current frame's instant
// value each frame. Lower = slower/smoother adaptation (less flicker,
// slower to react to a genuinely new parameter regime); higher = faster
// reaction but more visible "pumping". This is a first-pass estimate,
// not something empirically tuned against the live app.
const EXPOSURE_SMOOTHING = 0.9;

// Converts the measured RMS into an effective peak-ish scale. For a
// clean sine wave, RMS ≈ peak / √2 ≈ peak * 0.707, so multiplying RMS by
// roughly 1/0.707 ≈ 1.4 would recover an estimate of the peak. This is
// tuned somewhat higher than that pure-sine estimate as a starting guess
// to land close to how the old fixed-Gain default (amplitude ~1.2,
// gain 1.0) used to look — but this is exactly the kind of constant that
// really needs checking against the live app rather than trusted blind;
// if the default view looks different than before, this is the first
// number to adjust.
const RMS_TO_SCALE = 5;

// Floor so a perfectly flat (or just-reset) surface doesn't divide by
// something close to zero.
const MIN_AUTO_SCALE = 0.05;

/** RMS of height over only the cells actually inside the dish (edgeAlpha
 * > 0) — masked-out cells are always exactly 0 and would otherwise just
 * dilute the average without meaning anything physically. */
function computeRms(field: Float32Array, edgeAlpha: Float32Array): number {
  let sumSq = 0;
  let count = 0;
  for (let i = 0; i < field.length; i++) {
    if (edgeAlpha[i] <= 0) continue;
    const h = field[i];
    sumSq += h * h;
    count++;
  }
  return count > 0 ? Math.sqrt(sumSq / count) : 0;
}

/** Resets the auto-exposure's memory of "typical brightness" back to
 * uninitialized. Call this whenever the simulation itself resets —
 * otherwise exposure calibrated for a previous (possibly very different)
 * parameter setting keeps being applied to fresh data, making a calm new
 * setting look artificially dim/bright until the smoothing catches up. */
export function resetAutoExposure(): void {
  smoothedRms = 0;
  rmsInitialized = false;
}

export function renderHeightField(
  ctx: CanvasRenderingContext2D,
  field: Float32Array,
  edgeAlpha: Float32Array,
  dims: GridDimensions,
  cellSize: number,
  options: RenderOptions
): void {
  const canvasWidth = dims.width * cellSize;
  const canvasHeight = dims.height * cellSize;

  if (
    !imageDataCache ||
    imageDataCache.width !== dims.width ||
    imageDataCache.height !== dims.height
  ) {
    imageDataCache = ctx.createImageData(dims.width, dims.height);
    bufferCache = imageDataCache.data as unknown as Uint8ClampedArray;
  }
  const buffer = bufferCache!;

  // Auto-exposure: measure this frame's actual signal level, smooth it
  // over time, and use it (times the user's Gain multiplier) as the
  // effective divisor for color mapping. See the module doc comment
  // above for why this replaces a fixed Gain-as-divisor scheme.
  const instRms = computeRms(field, edgeAlpha);
  if (!rmsInitialized) {
    smoothedRms = instRms;
    rmsInitialized = true;
  } else {
    smoothedRms = smoothedRms * EXPOSURE_SMOOTHING + instRms * (1 - EXPOSURE_SMOOTHING);
  }
  const autoScale = Math.max(MIN_AUTO_SCALE, smoothedRms * RMS_TO_SCALE);
  const effectiveGain = autoScale * options.gain;

  // Higher frequency = tighter ring spacing = more high-spatial-frequency
  // detail than the grid can fully resolve, independent of how big the
  // canvas is displayed at. A single fixed blur amount was always a
  // compromise: enough for the worst case looks soft at low frequency,
  // enough to stay crisp at low frequency isn't enough at high frequency.
  // Scaling pass count with frequency avoids that compromise. Calling
  // boxBlur3 repeatedly with the same cache key is safe: each call fully
  // finishes reading its input into a temp buffer before it ever writes
  // into the buffer that same input came from (see boxBlur.ts).
  const frequency = options.frequency ?? 220;
  const passes = frequency > 700 ? 3 : frequency > 400 ? 2 : 1;
  let smoothed = field;
  for (let i = 0; i < passes; i++) {
    smoothed = boxBlur3(smoothed, dims, "height");
  }

  for (let y = 0; y < dims.height; y++) {
    const row = y * dims.width;
    for (let x = 0; x < dims.width; x++) {
      const idx = row + x;
      const pixelOffset = idx * 4;
      const alpha = edgeAlpha[idx];

      if (alpha <= 0) {
        buffer[pixelOffset] = 0;
        buffer[pixelOffset + 1] = 0;
        buffer[pixelOffset + 2] = 0;
        buffer[pixelOffset + 3] = 0;
        continue;
      }

      const h = smoothed[idx];

      // Approximate local slope from neighboring (smoothed) heights for
      // a cheap specular highlight — see colorMap.ts.
      const left = x > 0 ? smoothed[idx - 1] : h;
      const right = x < dims.width - 1 ? smoothed[idx + 1] : h;
      const up = y > 0 ? smoothed[idx - dims.width] : h;
      const down = y < dims.height - 1 ? smoothed[idx + dims.width] : h;
      const dHdx = right - left;
      const dHdy = down - up;

      const color = heightToColor(h, effectiveGain, options.colorMode, options.customColors);
      const boost = specularBoost(dHdx, dHdy);

      buffer[pixelOffset] = Math.min(255, color.r + boost);
      buffer[pixelOffset + 1] = Math.min(255, color.g + boost);
      buffer[pixelOffset + 2] = Math.min(255, color.b + boost);
      buffer[pixelOffset + 3] = Math.round(alpha * 255);
    }
  }

  // Composite the low-res simulation grid up to full canvas resolution.
  // The circular boundary is anti-aliased via `edgeAlpha` above rather
  // than drawn as a hard shape, so it no longer staircases when scaled up.
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  const off = getOffscreenCanvas(dims.width, dims.height);
  const offCtx = off.getContext("2d")!;
  offCtx.putImageData(imageDataCache, 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(off, 0, 0, dims.width, dims.height, 0, 0, canvasWidth, canvasHeight);
}

let offscreen: HTMLCanvasElement | null = null;

function getOffscreenCanvas(width: number, height: number): HTMLCanvasElement {
  if (!offscreen) {
    offscreen = document.createElement("canvas");
  }
  if (offscreen.width !== width || offscreen.height !== height) {
    offscreen.width = width;
    offscreen.height = height;
  }
  return offscreen;
}
