import type { ComponentChildren } from "preact";
import { copy } from "../copy";

/** "02:31 PM" from a millisecond timestamp. */
export function formatSlipTime(at: number): string {
  return new Date(at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface MetaItemProps {
  tone?: "meta" | "hop" | "ink";
  children: ComponentChildren;
}

/** One word of the meta line. */
export function MetaItem(props: MetaItemProps) {
  return (
    <span class="slip-meta-item" data-tone={props.tone ?? "meta"}>
      {props.children}
    </span>
  );
}

export interface SlipButtonProps {
  label: string;
  onTap?: () => void;
}

/** Outlined slip button ("Pass it on", "Later", "Restart now"). */
export function SlipButton(props: SlipButtonProps) {
  return (
    <button type="button" class="slip-button" onClick={() => props.onTap?.()}>
      {props.label}
    </button>
  );
}

export interface PassOnProps {
  hop: number;
  onTap?: () => void;
}

/** "Pass it on → hop N". Rendered only when a caller gives a hop. */
export function PassOn(props: PassOnProps) {
  return (
    <div class="slip-actions">
      <SlipButton label={copy.slip.passOn(props.hop)} onTap={props.onTap} />
    </div>
  );
}
