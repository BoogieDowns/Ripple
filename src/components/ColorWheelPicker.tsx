import { useEffect, useRef, useState } from "react";
import { hsvToRgb, type RGB } from "../rendering/colorMap";

interface ColorWheelPickerProps {
  colors: RGB[];
  onAddColor: (color: RGB) => void;
  onRemoveColor: (index: number) => void;
  onClose: () => void;
}

const MAX_COLORS = 4;
const WHEEL_SIZE = 220; // px, canvas is square

function rgbToCss(c: RGB): string {
  return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
}

function rgbToHex(c: RGB): string {
  const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`.toUpperCase();
}

export function ColorWheelPicker({ colors, onAddColor, onRemoveColor, onClose }: ColorWheelPickerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [value, setValue] = useState(0.9); // HSV "value" (brightness), controlled by the slider
  const [pending, setPending] = useState<RGB>({ r: 255, g: 255, b: 255 });

  // Draw the hue/saturation wheel. Redraws whenever the brightness slider
  // moves, since brightness (V in HSV) scales every pixel in the wheel.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Render at actual device pixel resolution (not just CSS pixels) —
    // otherwise this looks soft/blurry on any high-DPI (retina-style)
    // display, since one canvas pixel would get stretched over multiple
    // physical screen pixels.
    const dpr = window.devicePixelRatio || 1;
    const size = WHEEL_SIZE;
    const deviceSize = Math.round(size * dpr);
    canvas.width = deviceSize;
    canvas.height = deviceSize;

    const cx = deviceSize / 2;
    const cy = deviceSize / 2;
    const radius = deviceSize / 2 - 2 * dpr;
    // Width of the soft edge transition, in device pixels. Without this,
    // the circle's boundary is a hard per-pixel cutoff (in vs. out),
    // which reads as a jagged/aliased edge — feathering it over a couple
    // of pixels is the same anti-aliasing idea used for the dish's own
    // circular edge elsewhere in the app.
    const feather = 1.5 * dpr;

    const imageData = ctx.createImageData(deviceSize, deviceSize);
    const data = imageData.data;

    for (let py = 0; py < deviceSize; py++) {
      for (let px = 0; px < deviceSize; px++) {
        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const offset = (py * deviceSize + px) * 4;

        if (dist > radius + feather) {
          data[offset + 3] = 0;
          continue;
        }

        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const hue = (angle + 360) % 360;
        const saturation = Math.min(1, dist / radius);
        const rgb = hsvToRgb(hue, saturation, value);

        // Smooth alpha ramp across the feather band instead of a hard
        // 0/255 cutoff right at the radius.
        const edgeAlpha = Math.max(0, Math.min(1, (radius + feather - dist) / feather));

        data[offset] = rgb.r;
        data[offset + 1] = rgb.g;
        data[offset + 2] = rgb.b;
        data[offset + 3] = Math.round(edgeAlpha * 255);
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [value]);

  const handleWheelClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const dx = px - cx;
    const dy = py - cy;
    const radius = rect.width / 2 - 2;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > radius) return;

    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const hue = (angle + 360) % 360;
    const saturation = Math.min(1, dist / radius);
    setPending(hsvToRgb(hue, saturation, value));
  };

  const canAddMore = colors.length < MAX_COLORS;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Custom Colors</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <p className="modal-note">
          Pick up to {MAX_COLORS} colors — they'll form the gradient painted onto the
          disc, in the order you add them. Each swatch shows its hex code.
        </p>

        <canvas
          ref={canvasRef}
          className="color-wheel-canvas"
          onClick={handleWheelClick}
          style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}
        />

        <div className="value-slider-row">
          <label htmlFor="value-slider">Brightness</label>
          <input
            id="value-slider"
            type="range"
            min={0.05}
            max={1}
            step={0.01}
            value={value}
            onChange={(e) => setValue(parseFloat(e.target.value))}
          />
        </div>

        <div className="pending-swatch-row">
          <div className="pending-swatch" style={{ background: rgbToCss(pending) }} />
          <span className="hex-label">{rgbToHex(pending)}</span>
          <button
            className="add-color-button"
            disabled={!canAddMore}
            onClick={() => canAddMore && onAddColor(pending)}
          >
            {canAddMore ? "Add Color" : "Max 4 colors"}
          </button>
        </div>

        {colors.length > 0 && (
          <div className="stops-row">
            {colors.map((c, i) => (
              <div className="stop-item" key={i}>
                <div className="stop-swatch" style={{ background: rgbToCss(c) }}>
                  <button
                    className="stop-remove"
                    onClick={() => onRemoveColor(i)}
                    aria-label={`Remove color ${i + 1}`}
                  >
                    ×
                  </button>
                </div>
                <span className="hex-label">{rgbToHex(c)}</span>
              </div>
            ))}
          </div>
        )}

        <button className="done-button" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
