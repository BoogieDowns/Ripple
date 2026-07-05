/**
 * Wave source / oscillator injection.
 *
 * Models a speaker-like point (or small disc) source beneath the water
 * or plate, injecting energy sinusoidally at the (scaled) driving
 * frequency. This is what actually couples "frequency" to visible
 * behavior — everything downstream (interference, standing waves) is
 * an emergent consequence of this forcing term plus the wave equation.
 *
 * ── Why source position matters for Chladni patterns ──────────────────
 * A source sitting exactly at the center of a circular dish can only
 * couple into rotationally-symmetric modes (pure concentric rings) —
 * that's a real mathematical property of the circular wave equation,
 * not a simulation limitation. Real Chladni plates get their star/petal/
 * grid nodal patterns because the driver (or clamp point) sits off the
 * plate's center of symmetry, which lets angular (non-axisymmetric)
 * modes get excited too. `sourceOffsetFraction`/`sourceAngleDeg` let the
 * source be moved off-center for exactly that reason.
 */

import type { GridDimensions, SimulationParams } from "./types";
import { computeCircleGeometry } from "./circularMask";

export interface SourceRegion {
  cells: number[]; // flat grid indices belonging to the source disc
}

/**
 * Precompute which grid cells belong to the (possibly off-center) source
 * disc. `offsetFraction` is 0..1, a fraction of the dish radius (0 =
 * dead center, 1 = right at the edge); `angleDeg` picks the direction.
 *
 * The offset is clamped so the source disc itself (which has its own
 * radius, `sourceRadiusCells`) never crosses the actual dish boundary —
 * without this, dragging the offset slider all the way to 1 with a large
 * source radius would push part of the source outside the circular mask,
 * leaking energy into cells that get zeroed every step and producing an
 * odd, asymmetric-looking boundary artifact rather than a clean edge
 * source. This means the slider can safely go from 0 to 1 (center to
 * edge) at any source radius.
 */
export function buildSourceRegion(
  dims: GridDimensions,
  sourceRadiusCells: number,
  offsetFraction = 0,
  angleDeg = 0
): SourceRegion {
  const { centerX, centerY, radius } = computeCircleGeometry(dims);

  const maxSafeFraction = radius > 0 ? Math.max(0, (radius - sourceRadiusCells - 1) / radius) : 0;
  const effectiveOffsetFraction = Math.min(offsetFraction, maxSafeFraction);

  const angleRad = (angleDeg * Math.PI) / 180;
  const sourceCenterX = centerX + effectiveOffsetFraction * radius * Math.cos(angleRad);
  const sourceCenterY = centerY + effectiveOffsetFraction * radius * Math.sin(angleRad);

  const cells: number[] = [];
  const r2 = sourceRadiusCells * sourceRadiusCells;

  const minX = Math.max(0, Math.floor(sourceCenterX - sourceRadiusCells));
  const maxX = Math.min(dims.width - 1, Math.ceil(sourceCenterX + sourceRadiusCells));
  const minY = Math.max(0, Math.floor(sourceCenterY - sourceRadiusCells));
  const maxY = Math.min(dims.height - 1, Math.ceil(sourceCenterY + sourceRadiusCells));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - sourceCenterX;
      const dy = y - sourceCenterY;
      if (dx * dx + dy * dy <= r2) {
        cells.push(y * dims.width + x);
      }
    }
  }
  return { cells };
}

/**
 * Compute the current oscillator displacement value for time `t` (seconds
 * of simulation time, not wall clock). Uses userFrequency * frequencyScale
 * as the effective simulation-space frequency — see types.ts for why.
 */
export function sourceValue(t: number, params: SimulationParams): number {
  const simFrequency = params.frequency * params.frequencyScale;
  return Math.sin(2 * Math.PI * simFrequency * t) * params.amplitude;
}

/** Inject the oscillator value directly into every cell of the source region. */
export function injectSource(
  field: Float32Array,
  region: SourceRegion,
  t: number,
  params: SimulationParams
): void {
  const value = sourceValue(t, params);
  for (const idx of region.cells) {
    field[idx] = value;
  }
}
