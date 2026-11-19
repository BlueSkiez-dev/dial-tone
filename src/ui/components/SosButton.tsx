import "./SosButton.css";

export type SosButtonState = "default" | "holding" | "disabled";

export interface SosButtonProps {
  state: SosButtonState;
  /** Ring fill while holding, 0 to 1 (2 s hold). Clamped. Data only. */
  progress?: number;
  onHoldStart?: () => void;
  onHoldEnd?: () => void;
}

const BASE = import.meta.env.BASE_URL;
const RADIUS = 36.5;
export const SOS_RING_CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function sosRingFill(p: number | undefined): number {
  if (p === undefined || !Number.isFinite(p)) return 0;
  return Math.min(1, Math.max(0, p));
}

/** Gallery-only. Hold-to-send SOS in a recessed collar. Figma 213:377. */
export function SosButton(props: SosButtonProps) {
  const { state } = props;
  const disabled = state === "disabled";
  const holding = state === "holding";
  const fill = holding ? sosRingFill(props.progress) : 0;
  const dash = (SOS_RING_CIRCUMFERENCE * fill).toFixed(2);
  return (
    <div class="sos-wrap">
      <button
        type="button"
        class="sos-button"
        data-state={state}
        disabled={disabled}
        aria-label="SOS, hold to send"
        onPointerDown={() => {
          if (!disabled) props.onHoldStart?.();
        }}
        onPointerUp={() => props.onHoldEnd?.()}
        onPointerCancel={() => props.onHoldEnd?.()}
      >
        <img
          class="sos-collar"
          src={`${BASE}art/sos-ring.svg`}
          alt=""
          aria-hidden="true"
        />
        <span class="sos-cap">SOS</span>
        <svg
          class="sos-progress"
          viewBox="0 0 78 78"
          aria-hidden="true"
          data-fill={fill.toFixed(3)}
        >
          <circle
            cx="39"
            cy="39"
            r={RADIUS}
            fill="none"
            stroke-width="3.4"
            stroke-linecap="round"
            stroke-dasharray={`${dash} ${SOS_RING_CIRCUMFERENCE.toFixed(2)}`}
            transform="rotate(-90 39 39)"
          />
        </svg>
      </button>
      <span class="sos-label">Hold 2 s</span>
    </div>
  );
}
