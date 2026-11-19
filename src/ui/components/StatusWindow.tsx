import { copy } from "../copy";
import type { LedId, StatusView } from "../model/status";
import { Led, type LedColor } from "./Led";
import "./StatusWindow.css";

export interface StatusWindowProps {
  view: StatusView;
  /** Drives the LED sweep. */
  power: "off" | "selftest" | "on";
  legendOpen: boolean;
  /** Tapping the LEDs toggles the light legend (State 15). */
  onLedTap?: () => void;
}

const LED_ORDER: readonly LedId[] = ["MR", "AA", "CD", "OH", "RD", "SD"];
const AMBER: readonly LedId[] = ["CD", "OH"];
const LEGEND_ID = "light-legend";

export function ledColor(id: LedId): LedColor {
  return AMBER.includes(id) ? "amber" : "green";
}

/** "ATDT" plus the airtime while sending, for example "ATDT · 2.2 s". */
export function codeText(view: StatusView): string {
  if (view.code === "ATDT" && view.airtimeMs !== null) {
    return `ATDT · ${(view.airtimeMs / 1000).toFixed(1)} s`;
  }
  return view.code;
}

/**
 * Status window (Figma 213:195): smoked glass, six LEDs, the result code in phosphor
 * and a plain-language hint. The light legend (State 15) opens as a panel below.
 */
export function StatusWindow({
  view,
  power,
  legendOpen,
  onLedTap,
}: StatusWindowProps) {
  return (
    <div class="status-window" data-power={power}>
      <button
        type="button"
        class="status-leds"
        aria-label={copy.status.lightsLabel}
        aria-expanded={legendOpen}
        aria-controls={LEGEND_ID}
        onClick={() => onLedTap?.()}
      >
        {LED_ORDER.map((id, i) => (
          <Led
            key={id}
            label={id}
            color={ledColor(id)}
            on={view.leds[id]}
            sweepIndex={power === "selftest" ? i : undefined}
          />
        ))}
      </button>
      <div class="status-readout" role="status" aria-live="polite">
        <span class="status-code">{codeText(view)}</span>
        <span class="status-hint">{copy.status.hints[view.hintKey]}</span>
      </div>
      {legendOpen ? (
        <ul class="status-legend" id={LEGEND_ID} aria-label="Light legend">
          {copy.status.legend.map((row) => (
            <li key={row.id}>
              <span class="legend-id">{row.id}</span>
              <span class="legend-meaning">{row.meaning}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div class="status-reflection" aria-hidden="true" />
    </div>
  );
}
