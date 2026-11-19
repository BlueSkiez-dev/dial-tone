import "./GroupKeyBar.css";

export type GroupKeyBarProps =
  | { state: "open"; onKey?: () => void }
  | {
      state: "locked";
      groupName: string;
      /** Four check words shown as chips. */
      checkWords: readonly string[];
      onShare?: () => void;
    };

const BASE = import.meta.env.BASE_URL;

/** Gallery-only, data props only, no key logic. Figma 270:376. */
export function GroupKeyBar(props: GroupKeyBarProps) {
  if (props.state === "open") {
    return (
      <div class="group-key-bar" data-state="open">
        <div class="group-key-display">
          <img
            src={`${BASE}art/icon-padlock-open.svg`}
            alt=""
            aria-hidden="true"
          />
          <span class="group-key-text">
            <span class="group-key-title">Open channel</span>
            <span class="group-key-status">Anyone nearby can read</span>
          </span>
        </div>
        <button type="button" class="group-key-button" onClick={props.onKey}>
          Key
        </button>
      </div>
    );
  }
  return (
    <div class="group-key-bar" data-state="locked">
      <div class="group-key-display">
        <img
          src={`${BASE}art/icon-padlock-closed.svg`}
          alt=""
          aria-hidden="true"
        />
        <span class="group-key-text">
          <span class="group-key-name">{props.groupName}</span>
          <span class="group-key-words">
            {props.checkWords.slice(0, 4).map((w) => (
              <span class="group-key-word">{w}</span>
            ))}
          </span>
        </span>
      </div>
      <button type="button" class="group-key-button" onClick={props.onShare}>
        Share
      </button>
    </div>
  );
}
