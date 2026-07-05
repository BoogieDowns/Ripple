/**
 * A very mild separable 3-tap box blur, applied to a *copy* of the wave
 * height field, purely for display. Used by renderHeightField.ts to
 * reduce grid-scale grain/pixelation without touching the actual
 * simulation data that everything else reads.
 */

import type { GridDimensions } from "../simulation/types";

interface BlurCache {
  temp: Float32Array;
  out: Float32Array;
}

const caches = new Map<string, BlurCache>();

export function boxBlur3(field: Float32Array, dims: GridDimensions, cacheKey: string): Float32Array {
  const { width, height } = dims;
  const size = width * height;

  let cache = caches.get(cacheKey);
  if (!cache || cache.temp.length !== size) {
    cache = { temp: new Float32Array(size), out: new Float32Array(size) };
    caches.set(cacheKey, cache);
  }
  const { temp, out } = cache;

  // Horizontal pass.
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const left = x > 0 ? field[row + x - 1] : field[row + x];
      const right = x < width - 1 ? field[row + x + 1] : field[row + x];
      temp[row + x] = (left + field[row + x] + right) / 3;
    }
  }

  // Vertical pass.
  for (let y = 0; y < height; y++) {
    const row = y * width;
    const rowUp = y > 0 ? row - width : row;
    const rowDown = y < height - 1 ? row + width : row;
    for (let x = 0; x < width; x++) {
      out[row + x] = (temp[rowUp + x] + temp[row + x] + temp[rowDown + x]) / 3;
    }
  }

  return out;
}
