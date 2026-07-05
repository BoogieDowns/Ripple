/**
 * Circular boundary logic for the water dish.
 *
 * The simulation grid is rectangular, but only cells within a circular
 * region are treated as "inside the dish." Cells outside the circle are
 * excluded from the update and rendered as background.
 */

import type { GridDimensions } from "./types";

export interface CircleGeometry {
  centerX: number;
  centerY: number;
  radius: number;
}

/** Compute a centered circle that fits inside the grid with a small margin. */
export function computeCircleGeometry(dims: GridDimensions, marginCells = 2): CircleGeometry {
  const centerX = dims.width / 2;
  const centerY = dims.height / 2;
  const radius = Math.max(1, Math.min(dims.width, dims.height) / 2 - marginCells);
  return { centerX, centerY, radius };
}

/** Returns true if grid cell (x, y) is inside the circular dish. */
export function isInsideCircle(x: number, y: number, circle: CircleGeometry): boolean {
  const dx = x - circle.centerX;
  const dy = y - circle.centerY;
  return dx * dx + dy * dy <= circle.radius * circle.radius;
}

/**
 * Precompute a boolean mask for every cell in the grid.
 * Doing this once avoids recalculating dx*dx + dy*dy every frame for
 * every cell, which matters once the grid gets reasonably large.
 */
export function buildCircularMask(dims: GridDimensions, circle: CircleGeometry): Uint8Array {
  const mask = new Uint8Array(dims.width * dims.height);
  for (let y = 0; y < dims.height; y++) {
    for (let x = 0; x < dims.width; x++) {
      const idx = y * dims.width + x;
      mask[idx] = isInsideCircle(x, y, circle) ? 1 : 0;
    }
  }
  return mask;
}

/**
 * Precompute a soft, anti-aliased alpha value for every cell, used only
 * for rendering (never for the physics update, which keeps using the
 * binary mask above). Cells well inside the circle get alpha 1, cells
 * well outside get alpha 0, and cells within `featherCells` of the true
 * boundary get a smooth ramp between the two. This exists purely to fix
 * a hard-edged binary cutoff producing a visibly staircased/pixelated
 * circle outline once the canvas is scaled up — it has no effect on
 * simulation values, only on how the existing edge is displayed.
 */
export function buildEdgeAlphaMask(
  dims: GridDimensions,
  circle: CircleGeometry,
  featherCells = 1.4
): Float32Array {
  const alpha = new Float32Array(dims.width * dims.height);
  for (let y = 0; y < dims.height; y++) {
    for (let x = 0; x < dims.width; x++) {
      const idx = y * dims.width + x;
      const dx = x - circle.centerX;
      const dy = y - circle.centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // signedDistance > 0 means outside the circle, < 0 means inside.
      const signedDistance = dist - circle.radius;
      const t = 0.5 - signedDistance / featherCells;
      alpha[idx] = Math.max(0, Math.min(1, t));
    }
  }
  return alpha;
}
