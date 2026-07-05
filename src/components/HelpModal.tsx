interface HelpModalProps {
  onClose: () => void;
}

const TIPS: string[] = [
  "Wave Speed and Frequency work together: wavelength = Speed ÷ Frequency. Very high Frequency paired with the default (moderate) Speed produces a wavelength too short for the grid to show clearly — turn Speed up too and the pattern comes back into focus.",
  "A source sitting exactly at the center (Source Offset = 0) can only produce plain concentric rings. Move Offset away from 0 to unlock richer, asymmetric patterns.",
  "Gain is a brightness multiplier on top of automatic exposure, not an absolute brightness value — 1.0 is neutral. If a pattern looks washed out or too dark, nudge Gain rather than Amplitude.",
  "Very low Damping lets energy build up over time, producing busier, more chaotic patterns. Higher Damping calms things down and settles into a steadier, simpler shape faster.",
  "Custom Colors: pick 2-4 colors from the wheel to build your own gradient. With just 1 color, it automatically blends black → your color → white.",
  "Click the Frequency number itself (not the slider) to type an exact value directly.",
  "While fullscreen, click anywhere on the dish (or press Escape) to exit.",
];

export function HelpModal({ onClose }: HelpModalProps) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Tips</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <ul className="tips-list">
          {TIPS.map((tip, i) => (
            <li key={i}>{tip}</li>
          ))}
        </ul>

        <button className="done-button" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
