import { useId, useState } from "react";
import type { CSSProperties } from "react";
import { Check } from "lucide-react";
export function WordsSlider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  change,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  change: (value: number) => void;
}) {
  const id = useId();
  const clamp = (n: number) =>
    Math.min(max, Math.max(min, Math.round((n - min) / step) * step + min));
  return (
    <div className="words-slider-control">
      <div className="words-control-label">
        <span id={id}>{label}</span>
        <output aria-hidden="true">
          {Math.round(value)}
          {unit}
        </output>
      </div>
      <div
        className="words-slider"
        role="slider"
        tabIndex={0}
        aria-labelledby={id}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${Math.round(value)}${unit}`}
        style={
          {
            "--slider-fill": `${((value - min) / (max - min)) * 100}%`,
          } as CSSProperties
        }
        onKeyDown={(event) => {
          const keys: Record<string, number> = {
            ArrowLeft: value - step,
            ArrowDown: value - step,
            ArrowRight: value + step,
            ArrowUp: value + step,
            PageDown: value - step * 10,
            PageUp: value + step * 10,
            Home: min,
            End: max,
          };
          if (event.key in keys) {
            event.preventDefault();
            change(clamp(keys[event.key]));
          }
        }}
        onPointerDown={(event) => {
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          const rect = event.currentTarget.getBoundingClientRect();
          change(
            clamp(
              min + ((event.clientX - rect.left) / rect.width) * (max - min),
            ),
          );
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            const rect = event.currentTarget.getBoundingClientRect();
            change(
              clamp(
                min + ((event.clientX - rect.left) / rect.width) * (max - min),
              ),
            );
          }
        }}
      >
        <span className="words-slider-thumb" />
      </div>
    </div>
  );
}
export function WordsSwitch({
  label,
  checked,
  change,
}: {
  label: string;
  checked: boolean;
  change: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="words-switch"
      role="switch"
      aria-checked={checked}
      onClick={() => change(!checked)}
    >
      <span>{label}</span>
      <span className="words-switch-track" aria-hidden="true">
        <span>{checked && <Check size={12} />}</span>
      </span>
    </button>
  );
}
export const textSwatches = [
  "#ffffff",
  "#111519",
  "#f2e6c9",
  "#f1d68a",
  "#da704e",
  "#adc8af",
  "#8ac9df",
  "#d9b8df",
];
export function WordsColors({
  label,
  value,
  change,
  colors = textSwatches,
}: {
  label: string;
  value: string;
  change: (value: string) => void;
  colors?: string[];
}) {
  const [custom, setCustom] = useState(false);
  const [hex, setHex] = useState(value);
  const invalid = !/^#[0-9a-f]{6}$/i.test(hex);
  return (
    <div className="words-color-control">
      <span className="words-control-label">{label}</span>
      <div className="words-swatches" role="group" aria-label={label}>
        {colors.map((color) => (
          <button
            type="button"
            key={color}
            aria-label={`${label} ${color}`}
            aria-pressed={color.toLowerCase() === value.toLowerCase()}
            style={{ "--swatch": color } as CSSProperties}
            onClick={() => change(color)}
          >
            {color.toLowerCase() === value.toLowerCase() && (
              <span
                aria-hidden="true"
                style={{
                  color: [
                    "#ffffff",
                    "#f2e6c9",
                    "#f1d68a",
                    "#adc8af",
                    "#8ac9df",
                    "#d9b8df",
                  ].includes(color)
                    ? "#111519"
                    : "#ffffff",
                }}
              >
                <Check size={16} />
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          className="words-custom-color"
          aria-label={`Custom ${label.toLowerCase()}`}
          aria-expanded={custom}
          onClick={() => {
            setHex(value);
            setCustom(!custom);
          }}
        >
          #
        </button>
      </div>
      {custom && (
        <label className="field words-hex">
          {`Custom ${label.toLowerCase()}`}
          <input
            type="text"
            value={hex}
            maxLength={7}
            spellCheck={false}
            aria-invalid={invalid}
            onChange={(event) => {
              setHex(event.target.value);
              if (/^#[0-9a-f]{6}$/i.test(event.target.value))
                change(event.target.value);
            }}
          />
          {invalid && (
            <small>Use a six-digit hex color, such as #183247.</small>
          )}
        </label>
      )}
    </div>
  );
}
