import type { MeterView } from "../model/meter";
import { ByteMeter } from "./ByteMeter";
import "./MessageWell.css";
import { airtimeLabel, wellCopy } from "./message-well-copy";

export interface MessageWellProps {
  value: string;
  onInput: (text: string) => void;
  meter: MeterView;
  /** Airtime in ms for the current frame length, or null while unknown. */
  airtimeMs: number | null;
  /** True while the power is off. */
  disabled?: boolean;
}

/** The recessed text field, the byte meter and the airtime line. Never limits typing. */
export function MessageWell(props: MessageWellProps) {
  return (
    <div class="message-well" data-over={props.meter.over ? "true" : "false"}>
      <textarea
        class="message-well-field"
        value={props.value}
        disabled={props.disabled}
        placeholder={wellCopy.placeholder}
        aria-label={wellCopy.fieldLabel}
        spellcheck={false}
        onInput={(e) =>
          props.onInput((e.currentTarget as HTMLTextAreaElement).value)
        }
      />
      <ByteMeter view={props.meter} airtime={airtimeLabel(props.airtimeMs)} />
    </div>
  );
}
