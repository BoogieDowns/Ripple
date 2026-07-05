import { useEffect, useRef, useState, type RefObject } from "react";
import { WaveSimulation } from "../simulation/WaveSimulation";
import { renderHeightField, resetAutoExposure } from "../rendering/renderHeightField";
import type { SimulationParams } from "../simulation/types";
import type { ColorMode, RGB } from "../rendering/colorMap";

interface SimulationCanvasProps {
  simulation: WaveSimulation;
  containerRef: RefObject<HTMLDivElement>;
  isFullscreen: boolean;
  onExitFullscreen: () => void;
  cellSize: number;
  gain: number;
  colorMode: ColorMode;
  customColors: RGB[];
  showDiagnostics: boolean;
  resetSignal: number; // increment from parent to trigger a reset
  params: SimulationParams;
}

// Fixed sim-seconds advanced per step. Kept constant so oscillator phase
// and wave propagation behave consistently regardless of display frame rate.
const SIM_DT = 1 / 60;

export function SimulationCanvas({
  simulation,
  containerRef,
  isFullscreen,
  onExitFullscreen,
  cellSize,
  gain,
  colorMode,
  customColors,
  showDiagnostics,
  resetSignal,
  params,
}: SimulationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const fpsRef = useRef<{ frames: number; lastTime: number; fps: number }>({
    frames: 0,
    lastTime: performance.now(),
    fps: 0,
  });

  // Diagnostics are rendered as a normal HTML overlay (not drawn into the
  // canvas bitmap). This keeps them crisp regardless of simulation
  // resolution, and keeps them from ever bleeding into the circular
  // clip edge the way canvas-drawn text could.
  const [diagnostics, setDiagnostics] = useState({ fps: 0, simFreq: 0 });

  // Keep the simulation's params in sync with the latest props every frame
  // without recreating the simulation instance.
  useEffect(() => {
    simulation.setParams(params);
  }, [simulation, params]);

  useEffect(() => {
    simulation.reset();
    resetAutoExposure();
  }, [simulation, resetSignal]);

  // Tracks how many CSS pixels each grid cell is currently displayed at.
  // Fullscreen (toggled from the control panel, targeting this same
  // container via the shared ref from App.tsx) stretches the exact same
  // simulation data over far more physical screen pixels than the
  // windowed view, so a fixed amount of render-only smoothing that looks
  // right normally isn't enough once it's blown up bigger.
  const displayScaleRef = useRef(1);

  // Sizes the canvas's *displayed* dimensions (CSS width/height) to fill
  // the available square space in its container, independent of the
  // simulation's internal bitmap resolution (dims * cellSize). This makes
  // the dish visually large regardless of grid resolution, while the
  // simulation itself keeps rendering at a fixed, performant internal size.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const applySize = () => {
      const rect = container.getBoundingClientRect();
      const side = Math.max(200, Math.min(rect.width, rect.height) - 24);
      canvas.style.width = `${side}px`;
      canvas.style.height = `${side}px`;
      const dims = simulation.getDimensions();
      displayScaleRef.current = side / dims.width;
    };

    applySize();
    const observer = new ResizeObserver(applySize);
    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dims = simulation.getDimensions();
    canvas.width = dims.width * cellSize;
    canvas.height = dims.height * cellSize;

    let running = true;

    const loop = () => {
      if (!running) return;

      simulation.step(SIM_DT);

      renderHeightField(ctx, simulation.getHeightField(), simulation.getEdgeAlphaMask(), dims, cellSize, {
        gain,
        colorMode,
        customColors,
        frequency: params.frequency,
      });

      const fpsState = fpsRef.current;
      fpsState.frames += 1;
      const now = performance.now();
      if (now - fpsState.lastTime >= 500) {
        fpsState.fps = (fpsState.frames * 1000) / (now - fpsState.lastTime);
        fpsState.frames = 0;
        fpsState.lastTime = now;
        setDiagnostics({
          fps: fpsState.fps,
          simFreq: params.frequency * params.frequencyScale,
        });
      }

      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulation, cellSize, gain, colorMode, customColors, params.frequency, params.frequencyScale]);

  // Clicking anywhere on the fullscreened area exits fullscreen — same
  // idea as Escape (which browsers already handle natively for real
  // fullscreen), just via a click instead of a keypress. Delegates to
  // the parent's handler since exiting differs depending on whether this
  // is real native fullscreen or the CSS-only soft-fullscreen fallback
  // (used on iOS, which doesn't support the Fullscreen API at all).
  const handleContainerClick = () => {
    if (isFullscreen) {
      onExitFullscreen();
    }
  };

  return (
    <div
      ref={containerRef}
      className="canvas-container"
      onClick={handleContainerClick}
      style={isFullscreen ? { cursor: "pointer" } : undefined}
    >
      <canvas ref={canvasRef} className="simulation-canvas simulation-canvas--round" />
      {showDiagnostics && !isFullscreen && (
        <div className="diagnostics-overlay">
          <div>fps: {diagnostics.fps.toFixed(0)}</div>
          <div>freq: {params.frequency.toFixed(1)} Hz</div>
          <div>sim freq: {diagnostics.simFreq.toFixed(3)}</div>
        </div>
      )}
    </div>
  );
}
