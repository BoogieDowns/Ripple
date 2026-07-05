import { useEffect, useMemo, useRef, useState } from "react";
import { WaveSimulation } from "./simulation/WaveSimulation";
import type { SimulationParams } from "./simulation/types";
import type { ColorMode, RGB } from "./rendering/colorMap";
import { SimulationCanvas } from "./components/SimulationCanvas";
import { ControlPanel } from "./components/ControlPanel";
import { ColorWheelPicker } from "./components/ColorWheelPicker";
import { HelpModal } from "./components/HelpModal";
import { useTone } from "./audio/useTone";
import "./styles/app.css";

const GRID_SIZE = 320; // grid cells per side — higher = finer detail, more cost.
const CELL_SIZE = 2; // pixels per grid cell in the internal bitmap

const DEFAULT_PARAMS: SimulationParams = {
  frequency: 220,
  amplitude: 1.2,
  damping: 0.015,
  waveSpeed: 0.5,
  sourceRadius: 3,
  sourceOffsetFraction: 0.22,
  sourceAngleDeg: 35,
  frequencyScale: 0.01,
};

export default function App() {
  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [paused, setPaused] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(true);
  const [gain, setGain] = useState(1.0);
  const [colorMode, setColorMode] = useState<ColorMode>("water");
  const [customColors, setCustomColors] = useState<RGB[]>([]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);

  // On narrow screens the control panel becomes a slide-out drawer
  // rather than an always-visible floating sidebar (which would end up
  // covering most of a phone-sized dish) — see the media query in
  // app.css. This state only matters visually below that breakpoint; on
  // desktop the toggle button stays hidden and the panel behaves exactly
  // as before.
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Fullscreen targets this container (the dish + its overlays, not the
  // whole page/control panel) — lives here so the toggle button can sit
  // in the control panel's button row while the element it fullscreens
  // is rendered inside SimulationCanvas.
  const fullscreenTargetRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleChange = () => {
      setIsFullscreen(document.fullscreenElement === fullscreenTargetRef.current);
    };
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  const handleToggleFullscreen = () => {
    const target = fullscreenTargetRef.current;
    if (!target) return;

    // iOS doesn't implement the Fullscreen API for arbitrary elements at
    // all (historically limited to <video>) — and every browser on iOS
    // (Safari, Chrome, Brave, Firefox) is required to run Apple's
    // WebKit engine underneath, so this isn't a Brave-specific gap, it's
    // a platform-wide one. `requestFullscreen` is simply undefined in
    // that case, so this is detectable up front rather than needing to
    // wait for a rejected promise.
    const supportsNativeFullscreen = typeof target.requestFullscreen === "function";

    if (!supportsNativeFullscreen) {
      // Soft fullscreen: a CSS-only approximation (dish fills the
      // viewport, panel/toggle hidden) rather than the real OS-level
      // fullscreen — it can't hide the browser's own address bar the
      // way true fullscreen does, since only the OS/browser controls
      // that, but it's the closest equivalent available from web content
      // on a platform that doesn't expose the real API here.
      setIsFullscreen((v) => !v);
      return;
    }

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      target.requestFullscreen().catch(() => {
        // Some browsers report support but still reject in practice —
        // same soft-fullscreen fallback as above.
        setIsFullscreen(true);
      });
    }
  };

  // Used both by the toggle button and by clicking the dish itself while
  // fullscreened (see SimulationCanvas) — exits native fullscreen if
  // that's what's active, otherwise just clears the soft-fullscreen state.
  const handleExitFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      setIsFullscreen(false);
    }
  };

  // Audible sine tone at the same Hz value driving the simulation's
  // oscillator — a separate, optional reference for what the current
  // Frequency slider actually sounds like. Doesn't feed into or read
  // from the wave equation itself.
  const { isOn: isToneOn, toggle: handleToggleTone } = useTone(params.frequency);

  // Simulation instance is created once and persists across re-renders;
  // parameter changes are pushed into it via setParams (see SimulationCanvas).
  const simulation = useMemo(
    () => new WaveSimulation({ width: GRID_SIZE, height: GRID_SIZE }, params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const handleParamChange = (partial: Partial<SimulationParams>) => {
    setParams((prev) => ({ ...prev, ...partial }));
  };

  const handleTogglePause = () => {
    setPaused((prev) => {
      simulation.setPaused(!prev);
      return !prev;
    });
  };

  const handleReset = () => {
    setResetSignal((n) => n + 1);
  };

  const handleAddCustomColor = (color: RGB) => {
    setCustomColors((prev) => {
      const next = [...prev, color];
      // As soon as there's at least one custom color, switch to it live
      // so picking a color immediately shows up on the disc.
      setColorMode("custom");
      return next;
    });
  };

  const handleRemoveCustomColor = (index: number) => {
    setCustomColors((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0 && colorMode === "custom") {
        setColorMode("water");
      }
      return next;
    });
  };

  return (
    <div className={isFullscreen ? "app-root app-root--fullscreen" : "app-root"}>
      <div className="canvas-stage">
        <SimulationCanvas
          simulation={simulation}
          containerRef={fullscreenTargetRef}
          isFullscreen={isFullscreen}
          onExitFullscreen={handleExitFullscreen}
          cellSize={CELL_SIZE}
          gain={gain}
          colorMode={colorMode}
          customColors={customColors}
          showDiagnostics={showDiagnostics}
          resetSignal={resetSignal}
          params={params}
        />
      </div>
      <ControlPanel
        params={params}
        onChange={handleParamChange}
        paused={paused}
        onTogglePause={handleTogglePause}
        onReset={handleReset}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        isToneOn={isToneOn}
        onToggleTone={handleToggleTone}
        showDiagnostics={showDiagnostics}
        onToggleDiagnostics={() => setShowDiagnostics((v) => !v)}
        gain={gain}
        onGainChange={setGain}
        colorMode={colorMode}
        onColorModeChange={setColorMode}
        customColors={customColors}
        onOpenColorPicker={() => setShowColorPicker(true)}
        onOpenHelp={() => setShowHelp(true)}
        isPanelOpen={isPanelOpen}
      />
      <button
        className="panel-toggle-button"
        onClick={() => setIsPanelOpen((v) => !v)}
        aria-label={isPanelOpen ? "Close controls" : "Open controls"}
        title={isPanelOpen ? "Close controls" : "Open controls"}
      >
        {isPanelOpen ? "×" : "⚙"}
      </button>
      {showColorPicker && (
        <ColorWheelPicker
          colors={customColors}
          onAddColor={handleAddCustomColor}
          onRemoveColor={handleRemoveCustomColor}
          onClose={() => setShowColorPicker(false)}
        />
      )}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
