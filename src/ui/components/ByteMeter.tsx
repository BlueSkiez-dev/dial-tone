import type { MeterView } from "../model/meter";
import "./ByteMeter.css";
import { meterLabel, wellCopy } from "./message-well-copy";

export interface ByteMeterProps {
  view: MeterView;
  /** Optional airtime line shown under the label. */
  airtime?: string;
}

/** 24 segments plus the "41 / 128 B" label, or "Too long" with the bold count when over. */
export function ByteMeter({ view, airtime }: ByteMeterProps) {
  return (
    <div
      class="byte-meter"
      data-over={view.over ? "true" : "false"}
      role="img"
      aria-label={`${wellCopy.meterLabel}: ${meterLabel(view.bytes, view.limit)}`}
    >
      <div class="byte-meter-segments" aria-hidden="true">
        {view.segments.map((color, i) => (
          <span key={i} class="byte-meter-segment" data-color={color} />
        ))}
      </div>
      <div class="byte-meter-text">
        <p class="byte-meter-label" aria-hidden="true">
          {view.over ? (
            <>
              <b class="byte-meter-count">{view.bytes}</b> {wellCopy.tooLong}
            </>
          ) : (
            meterLabel(view.bytes, view.limit)
          )}
        </p>
        {airtime !== undefined && <p class="byte-meter-airtime">{airtime}</p>}
      </div>
    </div>
  );
}
