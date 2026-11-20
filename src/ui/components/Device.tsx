import type { ComponentChildren } from "preact";
import { copy } from "../copy";
import { BottomGrille, CornerScrews, PowerLabel, SideRail } from "./Chassis";
import { CircuitBoard } from "./CircuitBoard";

export interface DeviceProps {
  /** Power rocker, top right of the header. */
  power?: ComponentChildren;
  statusWindow?: ComponentChildren;
  scope?: ComponentChildren;
  channel?: ComponentChildren;
  /** Message label, well and meter. */
  messageWell?: ComponentChildren;
  /** Transmit key. The SOS slot sits beside it. */
  transmit?: ComponentChildren;
  /** Listen latch and the Tape. */
  tape?: ComponentChildren;
  /** Gallery only: fills the reserved slots. The live app leaves them empty. */
  groupKey?: ComponentChildren;
  quickKeys?: ComponentChildren;
  sos?: ComponentChildren;
  /** Direction of the raised signal line pulse. */
  signal?: "idle" | "up" | "down";
}

const BASE = import.meta.env.BASE_URL;

/** A slot with no content collapses to 0 x 0 (slot-empty). Content restores the Figma size. */
function slotClass(name: string, content: ComponentChildren): string {
  return content ? `slot ${name}` : `slot ${name} slot-empty`;
}

/**
 * The modem body: frosted shell over the circuit board, with the faceplate inside.
 * The three reserved slots (group key bar, quick keys, SOS) are empty containers that
 * collapse to 0 x 0 while empty and return to their Figma size when content is mounted.
 */
export function Device(props: DeviceProps) {
  const signal = props.signal ?? "idle";
  return (
    <div class="device">
      <div class="device-board">
        <CircuitBoard />
        <BottomGrille />
      </div>
      <div class="device-shell" aria-hidden="true" />
      {/* Above the shell: under its 6 px backdrop blur the 1.3 px rail strokes vanished, while the
          Figma_Screenshot of 182:5 shows them crisp (task 9.9). */}
      <SideRail />
      <div class="faceplate">
        <div class="faceplate-grain" aria-hidden="true" />
        <CornerScrews />
        <img
          class="signal-line"
          data-signal={signal}
          src={`${BASE}art/signal-line.svg`}
          alt=""
          aria-hidden="true"
        />
        <img
          class="signal-vias"
          src={`${BASE}art/signal-line-vias.svg`}
          alt=""
          aria-hidden="true"
        />
        <header class="faceplate-header">
          <div class="vent" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} class="vent-slot" />
            ))}
          </div>
          <div class="wordmark">
            <h1>{copy.deviceTitle}</h1>
            <p>{copy.tagline}</p>
          </div>
          <div class="power-slot">
            {props.power}
            <PowerLabel />
          </div>
        </header>
        <section class="part part-status">{props.statusWindow}</section>
        <section class="part part-scope">{props.scope}</section>
        <div class="part-channel-block">
          <p class="silk-label">{copy.labels.channel}</p>
          <section class="part part-channel">{props.channel}</section>
        </div>
        <div
          class={slotClass("slot-group-key", props.groupKey)}
          data-slot="group-key"
          role="presentation"
          aria-label={copy.slots.groupKey}
        >
          {props.groupKey}
        </div>
        <section class="message-block">
          <p class="silk-label">{copy.labels.message}</p>
          <div class="part-well">{props.messageWell}</div>
          <div
            class={slotClass("slot-quick-keys", props.quickKeys)}
            data-slot="quick-keys"
            role="presentation"
            aria-label={copy.slots.quickKeys}
          >
            {props.quickKeys}
          </div>
          <div
            class={props.sos ? "actions-row" : "actions-row actions-row-solo"}
          >
            <div class="part-transmit">{props.transmit}</div>
            <div
              class={slotClass("slot-sos", props.sos)}
              data-slot="sos"
              role="presentation"
              aria-label={copy.slots.sos}
            >
              {props.sos}
            </div>
          </div>
        </section>
        <section class="part part-tape">{props.tape}</section>
      </div>
    </div>
  );
}
