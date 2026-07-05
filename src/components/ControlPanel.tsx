import { useState } from "react";
import type { SimulationParams } from "../simulation/types";
import type { ColorMode, RGB } from "../rendering/colorMap";
import { GlassSelect } from "./GlassSelect";

interface ControlPanelProps {
  params: SimulationParams;
  onChange: (params: Partial<SimulationParams>) => void;
  paused: boolean;
  onTogglePause: () => void;
  onReset: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  isToneOn: boolean;
  onToggleTone: () => void;
  showDiagnostics: boolean;
  onToggleDiagnostics: () => void;
  gain: number;
  onGainChange: (gain: number) => void;
  colorMode: ColorMode;
  onColorModeChange: (mode: ColorMode) => void;
  customColors: RGB[];
  onOpenColorPicker: () => void;
  onOpenHelp: () => void;
}

interface SliderConfig {
  label: string;
  key: keyof SimulationParams;
  min: number;
  max: number;
  step: number;
  unit?: string;
  /** If true, clicking the value display lets you type an exact number
   * directly instead of only dragging the slider. */
  editable?: boolean;
}

const SLIDERS: SliderConfig[] = [
  { label: "Frequency", key: "frequency", min: 20, max: 1000, step: 1, unit: "Hz", editable: true },
  { label: "Amplitude", key: "amplitude", min: 0, max: 3, step: 0.05 },
  { label: "Damping", key: "damping", min: 0, max: 0.08, step: 0.001 },
  { label: "Speed", key: "waveSpeed", min: 0.05, max: 0.685, step: 0.01 },
  { label: "Radius", key: "sourceRadius", min: 1, max: 16, step: 1, unit: "cells" },
  { label: "Offset", key: "sourceOffsetFraction", min: 0, max: 1, step: 0.02 },
  { label: "Angle", key: "sourceAngleDeg", min: 0, max: 360, step: 5, unit: "°" },
];

const PRESET_COLOR_MODES: { value: ColorMode; label: string }[] = [
  { value: "water", label: "Deep Water" },
  { value: "oil", label: "Oil Slick" },
  { value: "thermal", label: "Thermal / Infrared" },
  { value: "ultraviolet", label: "Ultraviolet" },
  { value: "emerald", label: "Emerald" },
  { value: "solar", label: "Solar" },
  { value: "obsidian", label: "Obsidian" },
  // Monochrome stays last — keep any future preset added above this line.
  { value: "mono", label: "Monochrome" },
];

function rgbToCss(c: RGB): string {
  return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
}

export function ControlPanel({
  params,
  onChange,
  paused,
  onTogglePause,
  onReset,
  isFullscreen,
  onToggleFullscreen,
  isToneOn,
  onToggleTone,
  showDiagnostics,
  onToggleDiagnostics,
  gain,
  onGainChange,
  colorMode,
  onColorModeChange,
  customColors,
  onOpenColorPicker,
  onOpenHelp,
}: ControlPanelProps) {
  const colorModes =
    customColors.length > 0
      ? [...PRESET_COLOR_MODES, { value: "custom" as ColorMode, label: "Custom" }]
      : PRESET_COLOR_MODES;

  // Click-to-edit for slider values marked `editable` (currently just
  // Frequency): tracks which one is being typed into, and its current
  // (possibly not-yet-valid) text, separately from the committed value.
  const [editingKey, setEditingKey] = useState<keyof SimulationParams | null>(null);
  const [editText, setEditText] = useState("");

  const startEditing = (s: SliderConfig) => {
    setEditingKey(s.key);
    setEditText(String(params[s.key]));
  };

  const commitEdit = (s: SliderConfig) => {
    const parsed = parseFloat(editText);
    if (!Number.isNaN(parsed)) {
      const clamped = Math.min(s.max, Math.max(s.min, parsed));
      onChange({ [s.key]: clamped });
    }
    setEditingKey(null);
  };

  return (
    <div className="control-panel">
      <div className="control-row">
        <GlassSelect value={colorMode} options={colorModes} onChange={onColorModeChange} />
      </div>

      <div className="control-row">
        <button className="secondary-button" onClick={onOpenColorPicker} title="Custom Colors">
          🎨
        </button>
        {colorMode === "custom" && customColors.length > 0 && (
          <div className="mini-stops-row">
            {customColors.map((c, i) => (
              <div key={i} className="mini-swatch" style={{ background: rgbToCss(c) }} />
            ))}
          </div>
        )}
      </div>

      {SLIDERS.map((s) => (
        <div className="control-row" key={s.key}>
          <div className="control-label-row">
            <label htmlFor={s.key}>{s.label}</label>
            {s.editable && editingKey === s.key ? (
              <input
                type="number"
                className="control-value-input"
                autoFocus
                value={editText}
                min={s.min}
                max={s.max}
                step={s.step}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={() => commitEdit(s)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  } else if (e.key === "Escape") {
                    setEditingKey(null);
                  }
                }}
              />
            ) : (
              <span
                className={s.editable ? "control-value control-value--editable" : "control-value"}
                onClick={s.editable ? () => startEditing(s) : undefined}
                title={s.editable ? "Click to type an exact value" : undefined}
              >
                {Number(params[s.key]).toFixed(s.step < 1 ? 3 : 0)}
                {s.unit ? ` ${s.unit}` : ""}
              </span>
            )}
          </div>
          <input
            id={s.key}
            type="range"
            min={s.min}
            max={s.max}
            step={s.step}
            value={params[s.key] as number}
            onChange={(e) => onChange({ [s.key]: parseFloat(e.target.value) })}
          />
        </div>
      ))}

      <div className="control-row">
        <div className="control-label-row">
          <label htmlFor="gain">Gain</label>
          <span className="control-value">{gain.toFixed(2)}</span>
        </div>
        <input
          id="gain"
          type="range"
          min={0.2}
          max={3}
          step={0.05}
          value={gain}
          onChange={(e) => onGainChange(parseFloat(e.target.value))}
        />
      </div>

      <div className="button-row">
        <button onClick={onTogglePause} title={paused ? "Play" : "Pause"}>
          {paused ? "▶" : "❚❚"}
        </button>
        <button onClick={onReset} title="Reset">
          ↺
        </button>
        <button
          onClick={onToggleFullscreen}
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? "⤢" : "⛶"}
        </button>
        <button onClick={onToggleTone} title={isToneOn ? "Mute tone" : "Play tone"}>
          {isToneOn ? "🔊" : "🔇"}
        </button>
        <button onClick={onOpenHelp} title="Tips">
          ?
        </button>
      </div>

      <label className="diagnostic-toggle" title="Show diagnostics">
        <input type="checkbox" checked={showDiagnostics} onChange={onToggleDiagnostics} />
        <span>fps</span>
      </label>
    </div>
  );
}
