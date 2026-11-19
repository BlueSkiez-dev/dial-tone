import { copy } from "../copy";
import { type Slip as SlipModel, visibleSlips } from "../model/tape";
import { Slip } from "./Slip";
import "./Tape.css";

export interface TapeProps {
  /** The tape, oldest first (as the model keeps it). Shown newest first. */
  slips: readonly SlipModel[];
  expanded: boolean;
  onToggle?: () => void;
  /** Id of the slip that was just added: it prints line by line, and Heard text resolves. */
  freshId?: string | null;
  /** Hop for "Pass it on" on Heard slips. Omit for no button (the live app until relay exists). */
  passOn?: (slip: SlipModel) => number | undefined;
  onLater?: () => void;
  onRestart?: () => void;
}

/** The thermal-printer list of slips. Figma State 14 (284:2). */
export function Tape(props: TapeProps) {
  const { slips, expanded } = props;
  if (slips.length === 0) {
    return (
      <section class="tape" aria-label={copy.tape.label}>
        <div class="tape-slot" aria-hidden="true" />
        <p class="tape-empty">{copy.tape.empty}</p>
      </section>
    );
  }
  const view = visibleSlips(slips, expanded);
  const canToggle = expanded || view.hidden > 0;
  return (
    <section class="tape" aria-label={copy.tape.label}>
      <div class="tape-slot" aria-hidden="true" />
      <div class="tape-slips" role="log" aria-live="polite">
        {view.slips.map((slip) => (
          <Slip
            key={slip.id}
            slip={slip}
            fresh={props.freshId === slip.id}
            passOn={slip.kind === "heard" ? props.passOn?.(slip) : undefined}
            onLater={props.onLater}
            onRestart={props.onRestart}
          />
        ))}
      </div>
      {canToggle ? (
        <button
          type="button"
          class="tape-toggle"
          aria-expanded={expanded ? "true" : "false"}
          onClick={() => props.onToggle?.()}
        >
          {expanded ? copy.tape.showLess : copy.tape.seeMore}
        </button>
      ) : null}
    </section>
  );
}
