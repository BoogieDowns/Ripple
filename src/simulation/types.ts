/**
 * Shared type definitions for the wave simulation.
 *
 * PHYSICS NOTE: This is a 2D scalar height-field approximation of a
 * water surface, not a full fluid dynamics (Navier-Stokes) solve.
 * It's the standard "finite-difference wave equation on a grid"
 * approximation, which is physically motivated but simplified.
 * See WaveSimulation.ts for details on where it diverges from reality.
 */

export interface SimulationParams {
  /** User-facing frequency in Hz. This is NOT used directly as the
   * oscillation rate of the grid (see source.ts for why) — it is
   * mapped through frequencyScale into a simulation-space frequency. */
  frequency: number;

  /** Oscillator amplitude — energy injected into the source region each step. */
  amplitude: number;

  /** Velocity-proportional damping coefficient. Higher = waves die out faster. */
  damping: number;

  /** Wave propagation speed coefficient (this is "c" in the wave equation,
   * clamped so the simulation stays numerically stable — see CFL note
   * in WaveSimulation.ts). */
  waveSpeed: number;

  /** Radius (in grid cells) of the circular source region. */
  sourceRadius: number;

  /** How far off-center the source sits, as a fraction (0..~0.6) of the
   * dish radius. 0 = dead center, which can only excite rotationally
   * symmetric (ring) modes — see source.ts. Moving it off-center is what
   * lets the richer star/petal Chladni patterns appear. */
  sourceOffsetFraction: number;

  /** Direction (degrees) of the source offset from center. Only matters
   * when sourceOffsetFraction > 0. */
  sourceAngleDeg: number;

  /** Multiplier mapping real Hz to the simulation's internal update rate.
   * Needed because real audio frequencies (e.g. 440 Hz) are far too fast
   * to visualize meaningfully at a stable simulation step rate. */
  frequencyScale: number;
}

export interface GridDimensions {
  width: number;
  height: number;
}
