/**
 * Draws the sand layer to canvas: dark steel plate where sand has
 * migrated away, pale sand color where it has accumulated. Reads the
 * SandSimulation's density field directly — same principle as
 * renderHeightField.ts, no independent pattern generation.
 */

import type { GridDimensions } from "../simulation/types";
import { boxBlur } from "./boxBlur";

export interface SandRenderOptions {
  /** Density value considered "fully piled" for color-mapping purposes. */
  maxDensity: number;
  /** CSS pixels per grid cell at the current display size (bigger in
   * fullscreen). Used to scale up render-only smoothing so detail still
   * reads cleanly when the same data is stretched over more screen
   * pixels — see the note where it's used below. */
  displayScale?: number;
}

const PLATE_COLOR = { r: 62, g: 57, b: 50 };
const SAND_COLOR = { r: 214, g: 189, b: 141 };
const SAND_HIGHLIGHT = { r: 236, g: 220, b: 180 };

// How much to steepen the plate/sand transition after blurring (1 = no
// change, higher = crisper edge). See the render-only smoothing note above.
const SAND_CONTRAST = 2.2;

let imageDataCache: ImageData | null = null;
let bufferCache: Uint8ClampedArray | null = null;

export function renderSandField(
  ctx: CanvasRenderingContext2D,
  density: Float32Array,
  edgeAlpha: Float32Array,
  dims: GridDimensions,
  cellSize: number,
  options: SandRenderOptions
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

  // Sand density comes from a per-cell upwind advection scheme, which is
  // naturally blockier than the wave height field. Two things push
  // toward needing more smoothing: a bigger on-screen size (fullscreen
  // stretches the same grid data over more physical pixels), AND higher
  // frequencies (tighter ring spacing means fewer grid cells per ring
  // regardless of display size). We don't currently measure the latter
  // directly, so there's a floor of 2 passes even at normal window size
  // to cover it, scaling up further with displayScale for fullscreen.
  // Combined with the contrast curve below, this keeps detail sharp
  // instead of washing it out. Still purely cosmetic: it never touches
  // SandSimulation's actual density buffer.
  const displayScale = options.displayScale ?? 2;
  const passes = Math.max(2, Math.min(5, Math.round(displayScale / 1.5)));
  const smoothed = boxBlur(density, dims, "sand", passes);

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

      let t = Math.max(0, Math.min(1, smoothed[idx] / options.maxDensity));

      // Steepen the transition around its midpoint so edges read as a
      // fairly defined line rather than a soft gradient — a cheap
      // contrast curve, still driven entirely by the real (blurred)
      // density value above, not a separate shape.
      t = 0.5 + (t - 0.5) * SAND_CONTRAST;
      t = Math.max(0, Math.min(1, t));

      // Give thicker sand piles a slightly brighter tone, approximating
      // how a real sand ridge catches more light than a thin scatter —
      // still purely a function of the actual density value, not a
      // separate pattern.
      const highlightT = Math.max(0, t - 0.6) / 0.4;

      let r = PLATE_COLOR.r + (SAND_COLOR.r - PLATE_COLOR.r) * t;
      let g = PLATE_COLOR.g + (SAND_COLOR.g - PLATE_COLOR.g) * t;
      let b = PLATE_COLOR.b + (SAND_COLOR.b - PLATE_COLOR.b) * t;

      r += (SAND_HIGHLIGHT.r - SAND_COLOR.r) * highlightT;
      g += (SAND_HIGHLIGHT.g - SAND_COLOR.g) * highlightT;
      b += (SAND_HIGHLIGHT.b - SAND_COLOR.b) * highlightT;

      buffer[pixelOffset] = Math.min(255, r);
      buffer[pixelOffset + 1] = Math.min(255, g);
      buffer[pixelOffset + 2] = Math.min(255, b);
      buffer[pixelOffset + 3] = Math.round(alpha * 255);
    }
  }

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
