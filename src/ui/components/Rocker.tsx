import { copy } from "../copy";
import "./Rocker.css";

export interface RockerProps {
  on: boolean;
  /** Amber pulse until the first tap (requirement 12.3). */
  pulseAmber?: boolean;
  onTap?: () => void;
}

/**
 * Power rocker (Figma 213:13). A native button, so Space and Enter work.
 * When on, the "I" glows green.
 */
export function Rocker({ on, pulseAmber = false, onTap }: RockerProps) {
  return (
    <button
      type="button"
      class="rocker"
      role="switch"
      aria-checked={on}
      aria-label={copy.rocker.label}
      data-on={on ? "true" : "false"}
      data-pulse={pulseAmber ? "amber" : undefined}
      onClick={() => onTap?.()}
    >
      <span class="rocker-thumb" aria-hidden="true">
        <span class="rocker-i">{copy.rocker.on}</span>
        <span class="rocker-o">{copy.rocker.off}</span>
      </span>
    </button>
  );
}
