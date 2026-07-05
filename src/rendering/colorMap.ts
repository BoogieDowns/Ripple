/**
 * Maps a scalar height value to an RGB color for the water surface.
 *
 * This is purely a visualization choice — swapping palettes has zero
 * effect on the physics. It exists only to make the simulation's actual
 * state legible, and to let you look at the same underlying data in
 * different ways (thermal, oil-slick, or a fully custom user-picked
 * gradient from the color wheel).
 */

export type ColorMode =
  | "water"
  | "oil"
  | "thermal"
  | "ultraviolet"
  | "emerald"
  | "solar"
  | "mono"
  | "obsidian"
  | "custom";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Convert HSL (h in [0,360), s/l in [0,1]) to RGB. */
export function hslToRgb(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;

  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  const m = l - c / 2;
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

/**
 * Convert HSV (h in [0,360), s/v in [0,1]) to RGB. Used by the color
 * wheel picker, which works in hue/saturation/value space (radius =
 * saturation, angle = hue, a separate slider = value/brightness).
 */
export function hsvToRgb(h: number, s: number, v: number): RGB {
  const c = v * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;

  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  const m = v - c;
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

// ── Deep Water (default) ──────────────────────────────────────────
const BASE_WATER: RGB = { r: 8, g: 28, b: 46 };
const CREST_COLOR: RGB = { r: 120, g: 210, b: 255 };
const TROUGH_COLOR: RGB = { r: 4, g: 10, b: 22 };

function waterColor(normalized: number): RGB {
  if (normalized >= 0) {
    return {
      r: lerp(BASE_WATER.r, CREST_COLOR.r, normalized),
      g: lerp(BASE_WATER.g, CREST_COLOR.g, normalized),
      b: lerp(BASE_WATER.b, CREST_COLOR.b, normalized),
    };
  }
  const t = -normalized;
  return {
    r: lerp(BASE_WATER.r, TROUGH_COLOR.r, t),
    g: lerp(BASE_WATER.g, TROUGH_COLOR.g, t),
    b: lerp(BASE_WATER.b, TROUGH_COLOR.b, t),
  };
}

// ── Oil Slick — thin-film-interference-style rainbow ───────────────
function oilColor(normalized: number): RGB {
  const hue = 200 + normalized * 160;
  const lightness = 0.28 + Math.abs(normalized) * 0.32;
  return hslToRgb(hue, 0.75, lightness);
}

/** Linearly interpolate across an arbitrary list of 2+ RGB stops, t in [0,1]. */
function lerpStops(stops: RGB[], t: number): RGB {
  const seg = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const localT = seg - i;
  return {
    r: lerp(stops[i].r, stops[i + 1].r, localT),
    g: lerp(stops[i].g, stops[i + 1].g, localT),
    b: lerp(stops[i].b, stops[i + 1].b, localT),
  };
}

// ── Thermal / Infrared — black-body style ramp ──────────────────────
function thermalColor(normalized: number): RGB {
  const t = clamp((normalized + 1) / 2, 0, 1);
  return lerpStops(
    [
      { r: 4, g: 4, b: 10 },
      { r: 60, g: 8, b: 90 },
      { r: 180, g: 20, b: 40 },
      { r: 255, g: 120, b: 10 },
      { r: 255, g: 240, b: 160 },
    ],
    t
  );
}

// ── Ultraviolet — violet/blue/magenta ramp ──────────────────────────
function ultravioletColor(normalized: number): RGB {
  const t = clamp((normalized + 1) / 2, 0, 1);
  const hue = lerp(255, 300, t);
  const lightness = lerp(0.06, 0.62, t);
  return hslToRgb(hue, 0.85, lightness);
}

// ── Emerald — mirrors the same structure as Obsidian: solid black
// through the lower half of the range, then ramping into green only in
// the upper half. This keeps black dominant (matching the reference
// custom gradient) with a punchier, more saturated green at the peak
// rather than green filling most of the visible area.
function emeraldColor(normalized: number): RGB {
  const t = clamp((normalized + 1) / 2, 0, 1);
  if (t < 0.5) return { r: 0, g: 0, b: 0 };
  return lerpStops([{ r: 0, g: 0, b: 0 }, { r: 25, g: 255, b: 65 }], (t - 0.5) * 2);
}

// ── Solar — warm reds, oranges, and yellows ──────────────────────────
function solarColor(normalized: number): RGB {
  const t = clamp((normalized + 1) / 2, 0, 1);
  return lerpStops(
    [
      { r: 10, g: 4, b: 3 },
      { r: 120, g: 20, b: 12 },
      { r: 230, g: 90, b: 20 },
      { r: 255, g: 180, b: 40 },
      { r: 255, g: 248, b: 200 },
    ],
    t
  );
}

// ── Obsidian — mirrors exactly what the custom picker produces when you
// add a single black swatch: solid black through the lower half of the
// range, then ramping all the way up to white for the upper half (see
// customColor's single-color case below). Hardcoded here as its own
// preset rather than requiring the color wheel, since it's just black.
function obsidianColor(normalized: number): RGB {
  const t = clamp((normalized + 1) / 2, 0, 1);
  if (t < 0.5) return { r: 0, g: 0, b: 0 };
  return lerpStops([{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }], (t - 0.5) * 2);
}

// ── Monochrome — clean grayscale, good for pure pattern legibility ──
function monoColor(normalized: number): RGB {
  const t = clamp((normalized + 1) / 2, 0, 1);
  const v = lerp(6, 235, t);
  return { r: v, g: v, b: v };
}

// ── Custom — user-picked colors from the color wheel, 1 to 4 stops ──
// With 1 color, it's blended from black through the chosen color to
// white (so the pattern still reads). With 2+, we interpolate straight
// across the user's own stops in the order they were added.
function customColor(normalized: number, colors: RGB[]): RGB {
  if (colors.length === 0) return waterColor(normalized);
  const t = clamp((normalized + 1) / 2, 0, 1);
  if (colors.length === 1) {
    const c = colors[0];
    if (t < 0.5) return lerpStops([{ r: 0, g: 0, b: 0 }, c], t * 2);
    return lerpStops([c, { r: 255, g: 255, b: 255 }], (t - 0.5) * 2);
  }
  return lerpStops(colors, t);
}

/**
 * Convert a height value (roughly in [-gain, gain]) into an RGB color
 * using the selected palette. Palette choice is purely cosmetic.
 * `customColors` is only used when mode === "custom".
 */
export function heightToColor(
  height: number,
  gain: number,
  mode: ColorMode,
  customColors: RGB[] = []
): RGB {
  const normalized = clamp(height / gain, -1, 1);

  switch (mode) {
    case "oil":
      return oilColor(normalized);
    case "thermal":
      return thermalColor(normalized);
    case "ultraviolet":
      return ultravioletColor(normalized);
    case "emerald":
      return emeraldColor(normalized);
    case "solar":
      return solarColor(normalized);
    case "mono":
      return monoColor(normalized);
    case "obsidian":
      return obsidianColor(normalized);
    case "custom":
      return customColor(normalized, customColors);
    case "water":
    default:
      return waterColor(normalized);
  }
}

/**
 * Simple fake-lighting boost from a surface-normal-like gradient.
 * Approximates specular highlighting by brightening cells where the
 * local slope (dx, dy) points toward a fixed "light" direction.
 * This is a cheap shading trick, not a physical light transport model.
 */
export function specularBoost(dHeightDx: number, dHeightDy: number): number {
  const lightDirX = -0.6;
  const lightDirY = -0.6;
  const dot = dHeightDx * lightDirX + dHeightDy * lightDirY;
  return clamp(dot * 40, 0, 60);
}
