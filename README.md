# Resonance Lab

A physics-driven cymatics simulator: a circular water surface whose
visible wave patterns emerge entirely from a real finite-difference
solution of the 2D wave equation. Nothing on screen is a pre-baked
pattern, a decorative shader, or a random-noise generator dressed up to
look like water — every ripple you see is the simulation itself.

<!-- Consider adding a screenshot here once it's live, e.g.:
![Resonance Lab](docs/screenshot.png) -->

## Running it

```bash
npm install
npm run dev
```

Then open the local URL Vite prints (usually `http://localhost:5173`).

## What's actually happening

- `src/simulation/WaveSimulation.ts` runs a 3-buffer (previous/current/next)
  finite-difference update of the wave equation on a 320×320 grid, masked
  to a circle, with a damped (lossy) boundary approximating a dish wall.
- `src/simulation/source.ts` injects a `sin(2π·f·t)` oscillator into a
  small, positionable disc — this is the only place "frequency" enters
  the system. Everything else (interference, standing waves, decay) is
  an emergent consequence of the wave equation running with that forcing
  term, not something separately drawn on top.
- `src/rendering/renderHeightField.ts` reads the simulation's live height
  field and colors it. It has no independent knowledge of frequency — if
  you disconnect it from the simulation, it renders nothing.

## Controls

| Control | What it does |
|---|---|
| Frequency | Oscillator frequency in Hz (click the number to type an exact value) |
| Amplitude | Oscillator strength |
| Damping | How quickly energy dissipates — low = busier/longer-lived patterns |
| Speed | Wave propagation speed. Wavelength = Speed ÷ Frequency, so very high Frequency needs a higher Speed too to stay resolvable |
| Radius | Size of the source disc |
| Offset / Angle | Moves the source off-center. A dead-center source can only produce plain concentric rings — move it off-axis for richer, asymmetric patterns |
| Gain | A brightness multiplier on top of automatic exposure (see below) — 1.0 is neutral |

Color palettes (Deep Water, Oil Slick, Thermal, Ultraviolet, Emerald,
Solar, Obsidian, Monochrome) are purely cosmetic remaps of the same
height data. There's also a custom color-wheel picker for building your
own 1-4 color gradient, and a "?" button in the panel with in-app tips.

## Auto-exposure

Rather than a fixed brightness divisor that only looks right for one
narrow band of settings, the renderer measures the wave field's actual
typical magnitude each frame (smoothed over time to avoid flicker) and
uses that as the real divisor. Gain is a multiplier on top of that
auto-detected scale, not an absolute value — so legible patterns should
show up across most of the parameter range rather than clipping to a
single solid color at the extremes.

## Why frequency looks "scaled"

Real audio frequencies (100s of Hz) are far too fast for a grid running
at ~60 steps/sec to visualize meaningfully — you'd just see a flicker.
`frequencyScale` (in `simulation/types.ts`) maps the user-facing Hz value
down into the simulation's actual internal update rate. The UI still
shows real Hz; only the internal oscillator phase is scaled. This is
documented inline in `source.ts` and `types.ts`.

## Known simplifications (intentional, documented in code)

- 2D scalar height field, not a full 3D fluid/Navier-Stokes solve.
- Boundary condition is an approximate damped/reflective edge, not a
  precise physical boundary condition.
- No viscosity, surface tension, or pressure field.
- The standard 5-point finite-difference stencil has a known property
  called numerical anisotropy — at extreme settings (very high
  frequency, near-zero damping, high amplitude all at once) a faint
  directional bias can become visible as a diagonal artifact. This is a
  well-documented limitation of this class of discretization, not a bug,
  and only shows up at the far edges of the parameter space.

These are called out because the guiding principle for this project is:
**start with a physically motivated approximation, and be honest about
where it's an approximation** — never fake the visuals independently of
the simulation.

## Ideas for future phases

- A Chladni-style steel plate + sand simulation was attempted (see the
  git history / commit messages if you're curious) and pulled back out —
  the water surface alone was strong enough that a half-finished second
  feature sitting next to it wasn't worth shipping. Worth revisiting
  properly as its own effort.
- More explicit water/speaker geometry and resonance modes.
- Electromagnetic field visualization.

## License

MIT — do whatever you'd like with it.

