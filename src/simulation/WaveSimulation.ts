/**
 * WaveSimulation
 *
 * A 2D finite-difference approximation of the wave equation, run on a
 * rectangular grid but masked to a circular boundary (the "dish").
 *
 * ── Physics being approximated ──────────────────────────────────────
 * The continuous 2D wave equation is:
 *
 *   ∂²u/∂t² = c² ∇²u - damping * ∂u/∂t
 *
 * We discretize this with a standard explicit finite-difference scheme
 * using three time-buffers (previous, current, next) and a 5-point
 * Laplacian stencil:
 *
 *   laplacian(x,y) = u[y-1][x] + u[y+1][x] + u[y][x-1] + u[y][x+1] - 4*u[y][x]
 *
 *   next[y][x] = 2*current[y][x] - previous[y][x]
 *                + c² * laplacian(x,y)
 *                - damping * (current[y][x] - previous[y][x])
 *
 * This is a well-known, physically-motivated approximation (it's the
 * same family of scheme used in real-time wave/water simulations), but
 * it is NOT a full 3D fluid dynamics solve — there's no pressure field,
 * no viscosity term, no surface tension. It captures propagation,
 * reflection, interference and resonance, which is what this prototype
 * needs.
 *
 * ── Stability note (CFL condition) ──────────────────────────────────
 * Explicit schemes like this are only numerically stable if the wave
 * can't cross more than ~1 cell per timestep. Concretely we need
 * c² <= 0.5 (roughly) for a 2D 5-point stencil with dt = 1 "step".
 * `setParams` clamps waveSpeed accordingly so the UI slider can't push
 * the sim into a blow-up.
 */

import type { GridDimensions, SimulationParams } from "./types";
import { buildCircularMask, buildEdgeAlphaMask, computeCircleGeometry, type CircleGeometry } from "./circularMask";
import { buildSourceRegion, injectSource, type SourceRegion } from "./source";

const DEFAULT_PARAMS: SimulationParams = {
  frequency: 220,
  amplitude: 1.2,
  damping: 0.015,
  waveSpeed: 0.5,
  sourceRadius: 3,
  sourceOffsetFraction: 0.22,
  sourceAngleDeg: 35,
  frequencyScale: 0.01, // maps real Hz down into a visualizable sim rate
};

// Upper bound for c^2 to keep the explicit 2D scheme stable. The true
// CFL limit for this 5-point stencil is c² <= 0.5; kept a bit below that
// (rather than right at it) for safety margin, but nudged up from an
// earlier, more conservative 0.45 to allow slightly faster wave speeds.
const MAX_C2 = 0.47;

// Exponential-moving-average decay for the activity (vibration intensity)
// field. This is a Phase-1 approximation: a true oscillation envelope
// would need per-cell peak tracking over a full period, and the "right"
// time-constant actually depends on frequency (higher frequency = shorter
// period = this average settles faster relative to it). A single fixed
// decay works reasonably across the app's frequency range but will lag
// visibly at the very low end of the frequency slider — documented rather
// than hidden.
const ACTIVITY_DECAY = 0.87;

// A driven, undamped resonant system has no way to shed the energy being
// continuously injected by the oscillator — it grows without bound. That's
// real behavior for damping = 0, but it makes the sim numerically blow up
// and produces clipped, saturated visuals rather than anything readable.
// These floors ensure the dish wall and bulk medium always dissipate at
// least a whisper of energy, regardless of what the Damping slider is set
// to — analogous to how no real material or container is perfectly
// lossless, even a "low damping" one.
const MIN_INTERIOR_DAMPING = 0.0025;
const MIN_EDGE_DAMPING = 0.02;

// Hard safety ceiling on displacement magnitude. This is a numerical
// safety net, not a physical effect being modeled — it exists so that an
// extreme parameter combination degrades gracefully (a visibly saturated
// but stable pattern) instead of diverging toward infinity/NaN.
const MAX_DISPLACEMENT = 30;

function clampDisplacement(value: number): number {
  if (value > MAX_DISPLACEMENT) return MAX_DISPLACEMENT;
  if (value < -MAX_DISPLACEMENT) return -MAX_DISPLACEMENT;
  return value;
}

export class WaveSimulation {
  private dims: GridDimensions;
  private previous: Float32Array;
  private current: Float32Array;
  private next: Float32Array;

  private mask: Uint8Array;
  private edgeAlpha: Float32Array;
  private circle: CircleGeometry;
  private sourceRegion: SourceRegion;

  /**
   * Running estimate of local vibration intensity (an exponential moving
   * average of |velocity| per cell). Purely a derived read of the wave
   * state above — it doesn't feed back into the wave equation itself.
   */
  private activity: Float32Array;

  private params: SimulationParams;
  private simTime = 0; // seconds of simulation time, advances by dt each step
  private paused = false;

  constructor(dims: GridDimensions, params: Partial<SimulationParams> = {}) {
    this.dims = dims;
    const size = dims.width * dims.height;

    this.previous = new Float32Array(size);
    this.current = new Float32Array(size);
    this.next = new Float32Array(size);
    this.activity = new Float32Array(size);

    this.params = { ...DEFAULT_PARAMS, ...params };
    this.circle = computeCircleGeometry(dims);
    this.mask = buildCircularMask(dims, this.circle);
    this.edgeAlpha = buildEdgeAlphaMask(dims, this.circle);
    this.sourceRegion = buildSourceRegion(
      dims,
      this.params.sourceRadius,
      this.params.sourceOffsetFraction,
      this.params.sourceAngleDeg
    );
  }

  setParams(params: Partial<SimulationParams>): void {
    const merged = { ...this.params, ...params };
    // Clamp waveSpeed so c^2 never exceeds the stability limit.
    const c2 = merged.waveSpeed * merged.waveSpeed;
    if (c2 > MAX_C2) {
      merged.waveSpeed = Math.sqrt(MAX_C2);
    }
    this.params = merged;

    // Source geometry affects which cells are precomputed, so rebuild if any of it changed.
    if (
      params.sourceRadius !== undefined ||
      params.sourceOffsetFraction !== undefined ||
      params.sourceAngleDeg !== undefined
    ) {
      this.sourceRegion = buildSourceRegion(
        this.dims,
        this.params.sourceRadius,
        this.params.sourceOffsetFraction,
        this.params.sourceAngleDeg
      );
    }
  }

  getParams(): SimulationParams {
    return { ...this.params };
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  reset(): void {
    this.previous.fill(0);
    this.current.fill(0);
    this.next.fill(0);
    this.activity.fill(0);
    this.simTime = 0;
  }

  getDimensions(): GridDimensions {
    return this.dims;
  }

  getMask(): Uint8Array {
    return this.mask;
  }

  getEdgeAlphaMask(): Float32Array {
    return this.edgeAlpha;
  }

  getCircleGeometry(): CircleGeometry {
    return this.circle;
  }

  /** Read-only access to the current height field for rendering. */
  getHeightField(): Float32Array {
    return this.current;
  }

  /** Read-only access to the vibration-intensity field. */
  getActivityField(): Float32Array {
    return this.activity;
  }

  /** Flat grid indices belonging to the current source disc. */
  getSourceRegionCells(): number[] {
    return this.sourceRegion.cells;
  }

  /**
   * Advance the simulation by one fixed timestep. `dt` is treated as a
   * "sim-seconds per step" quantity used for the oscillator's phase —
   * it is NOT plugged into the wave equation itself (the discretization
   * above assumes a unit step), which keeps the stencil's stability
   * behavior independent of frame-rate.
   */
  step(dt: number): void {
    if (this.paused) return;

    const { width, height } = this.dims;
    const { waveSpeed, damping } = this.params;
    const c2 = waveSpeed * waveSpeed;
    const interiorDamping = Math.max(damping, MIN_INTERIOR_DAMPING);
    const edgeDamping = Math.max(damping, MIN_EDGE_DAMPING);

    // 1. Inject the oscillator into the source region (sets displacement directly,
    //    modeling a driven speaker membrane rather than a free particle).
    injectSource(this.current, this.sourceRegion, this.simTime, this.params);

    // 2. Finite-difference update for every interior cell inside the circular mask.
    for (let y = 1; y < height - 1; y++) {
      const row = y * width;
      const rowUp = (y - 1) * width;
      const rowDown = (y + 1) * width;

      for (let x = 1; x < width - 1; x++) {
        const idx = row + x;

        // Track vibration intensity regardless of branch below.
        const instVelocity = this.current[idx] - this.previous[idx];
        this.activity[idx] =
          this.activity[idx] * ACTIVITY_DECAY + Math.abs(instVelocity) * (1 - ACTIVITY_DECAY);

        if (this.mask[idx] === 0) {
          this.next[idx] = 0;
          continue;
        }

        // If any neighbor is outside the dish, treat this as a damped
        // reflective boundary: pull the cell back toward zero rather
        // than sampling non-existent water outside the circle.
        const upInside = this.mask[rowUp + x] === 1;
        const downInside = this.mask[rowDown + x] === 1;
        const leftInside = this.mask[idx - 1] === 1;
        const rightInside = this.mask[idx + 1] === 1;

        if (!(upInside && downInside && leftInside && rightInside)) {
          // Edge cell: strongly damped, pulled toward 0 (approximates a
          // dish wall absorbing/reflecting energy rather than a clean
          // physical boundary condition).
          const cur = this.current[idx];
          const prev = this.previous[idx];
          this.next[idx] = clampDisplacement((cur + prev) * 0.5 * (1 - edgeDamping * 4));
          continue;
        }

        const up = this.current[rowUp + x];
        const down = this.current[rowDown + x];
        const left = this.current[idx - 1];
        const right = this.current[idx + 1];
        const centerVal = this.current[idx];

        const laplacian = up + down + left + right - 4 * centerVal;
        const velocity = centerVal - this.previous[idx];

        this.next[idx] = clampDisplacement(
          centerVal + velocity + c2 * laplacian - interiorDamping * velocity
        );
      }
    }

    // 3. Swap buffers: previous <- current <- next.
    const oldPrevious = this.previous;
    this.previous = this.current;
    this.current = this.next;
    this.next = oldPrevious; // reuse the old previous buffer as scratch space

    this.simTime += dt;
  }
}
