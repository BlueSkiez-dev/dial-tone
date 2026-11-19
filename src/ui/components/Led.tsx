import "./Led.css";

export type LedColor = "green" | "amber";

export interface LedProps {
  /** Silkscreen label, for example "MR". */
  label: string;
  color: LedColor;
  on: boolean;
  /** Position in the power-on sweep. Set only during the self-test. */
  sweepIndex?: number;
}

/**
 * LED (Figma 213:40): domed lens over a label. Four variants: on or off, green or amber.
 * The label lights with the lens. The lens holds no text, so the label is the only text.
 */
export function Led({ label, color, on, sweepIndex }: LedProps) {
  const sweeping = sweepIndex !== undefined;
  return (
    <span
      class="led"
      data-led={label}
      data-color={color}
      data-on={on ? "true" : "false"}
      data-sweep={sweeping ? "true" : undefined}
      style={sweeping ? { "--i": String(sweepIndex) } : undefined}
    >
      <span class="led-lens" aria-hidden="true">
        <span class="led-glint" />
      </span>
      <span class="led-label">{label}</span>
      <span class="led-sr">{on ? " on" : " off"}</span>
    </span>
  );
}
