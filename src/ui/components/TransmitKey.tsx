import type { TransmitState } from "../model/status";
import "../styles/transmit-key.css";

export interface TransmitKeyProps {
  state: TransmitState;
  /** Encoder airtime of the current draft; null while unknown. */
  airtimeMs: number | null;
  /** Strip fill while sending, 0 to 1. Values outside the range are clamped. */
  progress?: number;
  /** Brief BUSY flash (from `busyUntil`), separate from Sending and Disabled. */
  flash?: boolean;
  onTap?: () => void;
}

/** "ATDT · 2.2 s", or a dash while the airtime is unknown. */
export function transmitSubLabel(airtimeMs: number | null): string {
  if (airtimeMs === null || !Number.isFinite(airtimeMs)) return "ATDT · —";
  return `ATDT · ${(airtimeMs / 1000).toFixed(1)} s`;
}

export function clampProgress(p: number | undefined): number {
  if (p === undefined || !Number.isFinite(p)) return 0;
  return Math.min(1, Math.max(0, p));
}

/** Primary dark keycap. Figma component 213:343. */
export function TransmitKey(props: TransmitKeyProps) {
  const { state } = props;
  const disabled = state === "disabled";
  const sending = state === "sending";
  const flash = props.flash === true && state === "default";
  const label = sending ? "Sending" : flash ? "Busy" : "Transmit";
  const fill = sending ? clampProgress(props.progress) : 0;
  return (
    <button
      type="button"
      class="transmit-key"
      data-state={state}
      data-flash={flash ? "true" : undefined}
      disabled={disabled}
      aria-busy={sending ? "true" : undefined}
      onClick={() => {
        if (!disabled && !sending) props.onTap?.();
      }}
    >
      <span class="transmit-key-label">{label}</span>
      <span class="transmit-key-sub">{transmitSubLabel(props.airtimeMs)}</span>
      <span class="transmit-key-strip" aria-hidden="true">
        <span
          class="transmit-key-fill"
          style={{ width: `${(fill * 100).toFixed(1)}%` }}
        />
      </span>
    </button>
  );
}
