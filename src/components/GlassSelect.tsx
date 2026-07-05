/**
 * GlassSelect
 *
 * A custom dropdown replacing the native <select>. The native element's
 * closed state can be styled freely with CSS, but the *open* options
 * popup is rendered by the browser/OS as a separate native surface in
 * most browsers — its corners, shadow, and spacing can't be controlled
 * from CSS. That's exactly the "boxy corners at the top" problem this
 * replaces: a fully custom, div-based list gives complete control over
 * rounding, spacing, and the selected-item highlight.
 */

import { useEffect, useRef, useState } from "react";

interface GlassSelectOption<T extends string> {
  value: T;
  label: string;
}

interface GlassSelectProps<T extends string> {
  value: T;
  options: GlassSelectOption<T>[];
  onChange: (value: T) => void;
}

export function GlassSelect<T extends string>({ value, options, onChange }: GlassSelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="glass-select-root" ref={rootRef}>
      <button
        type="button"
        className="glass-select-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{selected?.label ?? ""}</span>
        <span className={`glass-select-arrow${isOpen ? " glass-select-arrow--open" : ""}`} />
      </button>

      {isOpen && (
        <div className="glass-select-list" role="listbox">
          {options.map((opt) => (
            <button
              type="button"
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={
                "glass-select-option" + (opt.value === value ? " glass-select-option--active" : "")
              }
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
