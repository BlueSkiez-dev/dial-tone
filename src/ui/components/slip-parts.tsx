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
  /**
   * `outline` (default): the Figma outline on white paper ("Pass it on").
   * `later` and `restart`: filled and raised, for the Update ready slip on the grey system paper.
   */
  look?: "outline" | "later" | "restart";
}

/** Slip button ("Pass it on", "Later", "Restart now"). */
export function SlipButton(props: SlipButtonProps) {
  const look = props.look ?? "outline";
  const cls =
    look === "outline"
      ? "slip-button"
      : `slip-button slip-button-filled slip-button-${look}`;
  return (
    <button type="button" class={cls} onClick={() => props.onTap?.()}>
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
