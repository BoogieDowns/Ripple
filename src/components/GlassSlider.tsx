/**
 * GlassSlider
 *
 * A custom slider replacing the native <input type="range">. The native
 * element's internal track/thumb layout is rendered by the browser
 * itself (not normal CSS children), which turned out not to be reliably
 * controllable enough to fix two real problems on mobile: making the
 * actual touch-hit-area meaningfully bigger than the visible track
 * (attempts at this via CSS produced inconsistent thumb positioning
 * across browsers), and centering a thumb that's visually much bigger
 * than the track itself. Building it as a plain div with Pointer Events
 * (which unifies mouse, touch, and pen) gives full, consistent control
 * over both.
 */

import { useRef, useState } from "react";

interface GlassSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  id?: string;
}

export function GlassSlider({ value, min, max, step, onChange, id }: GlassSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const percent = ((clamp(value) - min) / (max - min)) * 100;

  const updateFromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;
    const raw = min + Math.min(1, Math.max(0, ratio)) * (max - min);
    const stepped = Math.round(raw / step) * step;
    onChange(clamp(stepped));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    updateFromClientX(e.clientX);
  };

  const endDrag = () => setIsDragging(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      onChange(clamp(value + step));
      e.preventDefault();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      onChange(clamp(value - step));
      e.preventDefault();
    }
  };

  return (
    <div
      ref={trackRef}
      id={id}
      className="glass-slider"
      role="slider"
      tabIndex={0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
    >
      <div className="glass-slider-track" />
      <div className="glass-slider-thumb" style={{ left: `${percent}%` }} />
    </div>
  );
}
