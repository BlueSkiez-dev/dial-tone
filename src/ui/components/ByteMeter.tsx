import type { MeterView } from "../model/meter";
import "./ByteMeter.css";
import { meterLabel, wellCopy } from "./message-well-copy";

export interface ByteMeterProps {
  view: MeterView;
  /** Optional airtime line shown under the label. */
  airtime?: string;
}

/** 24 segments and the airtime (or "Too long" when over) in the meter row. The "41 / 128 B" count sits in the MESSAGE caption row above the well (Figma 182:135). */
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
      <p class="byte-meter-count-row" aria-hidden="true">
        {view.over ? (
          <>
            <b class="byte-meter-count">{view.bytes}</b> / {view.limit} B
          </>
        ) : (
          meterLabel(view.bytes, view.limit)
        )}
      </p>
      {view.over ? (
        <p class="byte-meter-label" aria-hidden="true">
          {wellCopy.tooLong}
        </p>
      ) : (
        airtime !== undefined && <p class="byte-meter-airtime">{airtime}</p>
      )}
    </div>
  );
}
