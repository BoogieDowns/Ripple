/**
 * SandSimulation
 *
 * Models a thin layer of sand resting on the vibrating plate/surface.
 * This is the standard qualitative mechanism behind real Chladni
 * figures: grains get kicked away from regions that are shaking a lot
 * (antinodes) and accumulate where the surface is nearly still (nodes),
 * which is why the sand ends up tracing the *nodal lines* of the
 * vibration pattern rather than the vibration pattern itself.
 *
 * ── What drives this ─────────────────────────────────────────────────
 * It reads WaveSimulation's `activity` field (a running estimate of how
 * much each cell has been shaking) and nothing else. There is no
 * separate frequency-to-pattern mapping here — if the activity field is
 * flat, sand does nothing; if it has structure, sand migrates toward
 * the calm regions of that exact structure.
 *
 * ── The numerical method (this took a few iterations to get right) ────
 * Earlier versions compared each cell against a fixed set of neighbors
 * (first 4, then 8 including diagonals) and moved sand pairwise toward
 * whichever neighbor was calmer. That approach can never be fully
 * rotation-independent — no matter how the neighbor weights are tuned,
 * comparing against a fixed lattice of directions occasionally produces
 * a hard "+" or "X" shaped artifact exactly at true node points, where
 * the real activity field is naturally near-symmetric and a lattice
 * direction ends up winning an otherwise-meaningless tie.
 *
 * This version instead computes an actual 2D gradient of the (smoothed)
 * activity field using central differences — a proper vector quantity,
 * not a comparison against fixed directions — and treats sand motion as
 * drift down that gradient (from shakier toward calmer), transported via
 * "dimensional splitting": one 1D upwind advection sweep along X, then
 * one along Y. This is a standard, well-understood technique for
 * numerically solving 2D transport equations specifically because
 * sweeping along the two axes independently, driven by a continuous
 * gradient, has no preferred diagonal or lattice direction to bias
 * toward — the earlier failure mode structurally can't happen here.
 *
 * Still an approximation (no grain-grain collision, friction, or
 * repose-angle modeling) — but it reproduces the qualitative Chladni
 * behavior (drift from antinodes to nodes, settling into a static
 * pattern once vibration is steady) that Phase 1 needs.
 */

import type { GridDimensions } from "./types";

// How strongly sand responds to the activity gradient. Tunable — if
// migration feels too slow/fast after this rewrite, this is the first
// constant to adjust.
const DRIFT_STRENGTH = 1.3;

// Hard ceiling on drift speed, in grid cells per sub-step. This is a
// CFL-style safety limit for the upwind advection scheme: an upwind
// transport step is only numerically stable if a cell can't be asked to
// send away more than ~1 cell-width worth of material per step. Rather
// than tune DRIFT_STRENGTH to *hopefully* stay under that limit for
// every possible activity gradient (which is exactly the kind of
// "guess a constant and hope" approach that caused problems before),
// this clamps velocity directly — so the scheme stays stable by
// construction regardless of how extreme the underlying gradient gets.
const MAX_SPEED = 0.4;

// The source works by directly setting displacement each frame (see
// source.ts) rather than smoothly driving it, which creates an
// artificial jump in the *measured* velocity right at those exact cells
// — often far larger than the real vibration intensity nearby, which
// would otherwise produce an enormous, unrealistic gradient right at the
// source point. This cap only applies to cells that are actually part of
// the source disc (see setSourceCells below), not the whole field.
const SOURCE_ACTIVITY_CAP = 3.5;

// Absolute ceiling on how much sand a single cell can hold. A backstop
// against runaway pileup under extreme parameter combinations — normal
// patterns never get close to this. Comfortably above the visual
// saturation point used for rendering (see SAND_MAX_DENSITY in
// SimulationCanvas.tsx).
const MAX_DENSITY = 8;

const SUBSTEPS = 6;

export class SandSimulation {
  private dims: GridDimensions;
  private mask: Uint8Array;
  private density: Float32Array;
  private nextDensity: Float32Array;
  private isSourceCell: Uint8Array;

  // Scratch buffers, allocated once and reused every step to avoid
  // per-frame garbage.
  private correctedActivity: Float32Array;
  private blurTemp: Float32Array;
  private smoothedActivity: Float32Array;
  private velocityX: Float32Array;
  private velocityY: Float32Array;

  constructor(dims: GridDimensions, mask: Uint8Array) {
    this.dims = dims;
    this.mask = mask;
    const size = dims.width * dims.height;
    this.density = new Float32Array(size);
    this.nextDensity = new Float32Array(size);
    this.isSourceCell = new Uint8Array(size);
    this.correctedActivity = new Float32Array(size);
    this.blurTemp = new Float32Array(size);
    this.smoothedActivity = new Float32Array(size);
    this.velocityX = new Float32Array(size);
    this.velocityY = new Float32Array(size);
    this.layFlatSand();
  }

  /** Update which cells are considered "the source" for activity-reading
   * purposes (see SOURCE_ACTIVITY_CAP above). Call whenever the source's
   * radius, offset, or angle changes so this stays in sync. */
  setSourceCells(cells: number[]): void {
    this.isSourceCell.fill(0);
    for (const idx of cells) {
      this.isSourceCell[idx] = 1;
    }
  }

  /** Spread an even layer of sand across the whole dish. */
  layFlatSand(): void {
    for (let i = 0; i < this.density.length; i++) {
      this.density[i] = this.mask[i] === 1 ? 1 : 0;
    }
  }

  reset(): void {
    this.layFlatSand();
  }

  getDensityField(): Float32Array {
    return this.density;
  }

  /**
   * Advance the sand layer by one step, using the wave simulation's
   * activity (vibration intensity) field as the only input. Internally
   * runs a few sub-steps so the pattern catches up to a changed
   * vibration state within a handful of animation frames rather than
   * many seconds.
   */
  step(activity: Float32Array): void {
    const smoothed = this.prepareSmoothedActivity(activity);
    this.computeVelocityField(smoothed);
    for (let i = 0; i < SUBSTEPS; i++) {
      this.xSweep();
      this.ySweep();
    }
    this.clampDensity();
  }

  /**
   * Applies the source-region correction, then a mild 2-pass blur.
   * Smoothing isn't the fix for the directional-bias problem anymore
   * (the gradient-based scheme handles that structurally) — it's still
   * worth doing to reduce sensitivity to single-cell numerical noise in
   * the underlying wave simulation's activity readout.
   */
  private prepareSmoothedActivity(activity: Float32Array): Float32Array {
    const { width, height } = this.dims;
    const isSourceCell = this.isSourceCell;
    const corrected = this.correctedActivity;
    const temp = this.blurTemp;
    const out = this.smoothedActivity;

    for (let i = 0; i < activity.length; i++) {
      corrected[i] = isSourceCell[i] === 1 ? Math.min(activity[i], SOURCE_ACTIVITY_CAP) : activity[i];
    }

    boxBlurPass(corrected, temp, out, width, height);
    boxBlurPass(out, temp, corrected, width, height);
    out.set(corrected);

    return out;
  }

  /**
   * Computes a per-cell drift velocity from the activity gradient via
   * central differences — a real vector estimate of "which way is
   * calmer", not a comparison against a fixed set of neighbor
   * directions. Velocity points down the gradient (away from high
   * activity, toward low), clamped to MAX_SPEED for stability.
   */
  private computeVelocityField(activity: Float32Array): void {
    const { width, height } = this.dims;
    const mask = this.mask;
    const vx = this.velocityX;
    const vy = this.velocityY;

    for (let y = 1; y < height - 1; y++) {
      const row = y * width;
      const rowUp = row - width;
      const rowDown = row + width;

      for (let x = 1; x < width - 1; x++) {
        const idx = row + x;
        if (mask[idx] === 0) {
          vx[idx] = 0;
          vy[idx] = 0;
          continue;
        }

        const gx = (activity[idx + 1] - activity[idx - 1]) * 0.5;
        const gy = (activity[rowDown + x] - activity[rowUp + x]) * 0.5;

        let vX = -DRIFT_STRENGTH * gx;
        let vY = -DRIFT_STRENGTH * gy;
        if (vX > MAX_SPEED) vX = MAX_SPEED;
        else if (vX < -MAX_SPEED) vX = -MAX_SPEED;
        if (vY > MAX_SPEED) vY = MAX_SPEED;
        else if (vY < -MAX_SPEED) vY = -MAX_SPEED;

        vx[idx] = vX;
        vy[idx] = vY;
      }
    }
  }

  /** 1D upwind advection sweep along X. Reads `this.density`, writes the
   * result into `this.nextDensity`, then swaps them — so `this.density`
   * always holds the current readable state after this returns. */
  private xSweep(): void {
    const { width, height } = this.dims;
    const mask = this.mask;
    const density = this.density;
    const next = this.nextDensity;
    const vx = this.velocityX;

    next.set(density);

    for (let y = 1; y < height - 1; y++) {
      const row = y * width;
      for (let x = 0; x < width - 1; x++) {
        const idx = row + x;
        const rIdx = idx + 1;
        if (mask[idx] === 0 || mask[rIdx] === 0) continue;

        // Velocity at the face between the two cells, averaged from both.
        const faceV = (vx[idx] + vx[rIdx]) * 0.5;
        if (faceV === 0) continue;

        // Upwind: take the transported quantity from whichever cell the
        // flow is coming *from*, not the one it's going to.
        let flux: number;
        if (faceV > 0) {
          flux = faceV * density[idx];
          if (flux > density[idx]) flux = density[idx];
        } else {
          flux = faceV * density[rIdx];
          if (flux < -density[rIdx]) flux = -density[rIdx];
        }

        next[idx] -= flux;
        next[rIdx] += flux;
      }
    }

    clampBuffer(next, mask);

    this.density = next;
    this.nextDensity = density;
  }

  /** Same as xSweep but along Y. */
  private ySweep(): void {
    const { width, height } = this.dims;
    const mask = this.mask;
    const density = this.density;
    const next = this.nextDensity;
    const vy = this.velocityY;

    next.set(density);

    for (let x = 1; x < width - 1; x++) {
      for (let y = 0; y < height - 1; y++) {
        const idx = y * width + x;
        const dIdx = idx + width;
        if (mask[idx] === 0 || mask[dIdx] === 0) continue;

        const faceV = (vy[idx] + vy[dIdx]) * 0.5;
        if (faceV === 0) continue;

        let flux: number;
        if (faceV > 0) {
          flux = faceV * density[idx];
          if (flux > density[idx]) flux = density[idx];
        } else {
          flux = faceV * density[dIdx];
          if (flux < -density[dIdx]) flux = -density[dIdx];
        }

        next[idx] -= flux;
        next[dIdx] += flux;
      }
    }

    clampBuffer(next, mask);

    this.density = next;
    this.nextDensity = density;
  }

  /** Final safety clamp: keeps density in [0, MAX_DENSITY] regardless of
   * any accumulated floating-point drift across sub-steps. Each sweep
   * already clamps its own output (see xSweep/ySweep), so this is a
   * cheap extra layer of defense, not the only thing standing between a
   * bad parameter combination and a broken-looking pattern. */
  private clampDensity(): void {
    clampBuffer(this.density, this.mask);
  }
}

/** Clamps every masked cell in `buffer` to [0, MAX_DENSITY] in place. */
function clampBuffer(buffer: Float32Array, mask: Uint8Array): void {
  for (let i = 0; i < buffer.length; i++) {
    if (mask[i] === 1) {
      if (buffer[i] < 0) buffer[i] = 0;
      else if (buffer[i] > MAX_DENSITY) buffer[i] = MAX_DENSITY;
    }
  }
}

/** Separable 3-tap box blur: src -> temp (horizontal) -> dst (vertical). */
function boxBlurPass(
  src: Float32Array,
  temp: Float32Array,
  dst: Float32Array,
  width: number,
  height: number
): void {
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const left = x > 0 ? src[row + x - 1] : src[row + x];
      const right = x < width - 1 ? src[row + x + 1] : src[row + x];
      temp[row + x] = (left + src[row + x] + right) / 3;
    }
  }

  for (let y = 0; y < height; y++) {
    const row = y * width;
    const rowUp = y > 0 ? row - width : row;
    const rowDown = y < height - 1 ? row + width : row;
    for (let x = 0; x < width; x++) {
      dst[row + x] = (temp[rowUp + x] + temp[row + x] + temp[rowDown + x]) / 3;
    }
  }
}
