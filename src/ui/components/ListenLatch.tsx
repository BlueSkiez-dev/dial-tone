import type { ListenState } from "../model/status";
import "../styles/listen-latch.css";

export interface ListenLatchProps {
  state: ListenState;
  onTap?: () => void;
}

const TEXT: Record<ListenState, string> = {
  listening: "Listening",
  off: "Listen",
  "no-mic": "No mic",
  disabled: "Listen",
};

/** True when a tap does anything. */
export function latchTappable(state: ListenState): boolean {
  return state === "listening" || state === "off";
}

/**
 * Tape caption on the left, latching Listen button on the right. Figma component 213:413.
 * `state` comes from `listenState`, which ignores page visibility: a hidden page with a
 * live microphone still reads Listening.
 */
export function ListenLatch(props: ListenLatchProps) {
  const { state } = props;
  return (
    <div class="listen-latch" data-state={state}>
      <span class="listen-latch-caption">Tape</span>
      <button
        type="button"
        class="listen-latch-button"
        aria-pressed={state === "listening" ? "true" : "false"}
        aria-disabled={latchTappable(state) ? undefined : "true"}
        onClick={() => {
          if (latchTappable(state)) props.onTap?.();
        }}
      >
        <span class="listen-latch-light" aria-hidden="true" />
        <span class="listen-latch-text">{TEXT[state]}</span>
      </button>
    </div>
  );
}
