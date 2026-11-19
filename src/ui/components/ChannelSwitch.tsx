import { PROFILES, type ProfileId } from "../../audio/index";
import { formatKHz } from "../model/scope-map";
import { channelCopy, channelSwitchSendingName } from "./channel-copy";

const ORDER: readonly ProfileId[] = ["room", "call", "quiet"];

export interface ChannelSwitchProps {
  value: ProfileId;
  /** True while a transmission is in flight. Dims the switch and ignores input. */
  disabled?: boolean;
  onChange?: (next: ProfileId) => void;
}

function optionId(id: ProfileId): string {
  return `channel-switch-${id}`;
}

/**
 * Three-position slide switch (Figma 213:252). One radio group and one tab stop: the group
 * itself holds focus and points at the chosen position with `aria-activedescendant`, so no
 * element needs `tabindex="-1"`. While sending it stays focusable but ignores input.
 */
export function ChannelSwitch({
  value,
  disabled = false,
  onChange,
}: ChannelSwitchProps) {
  const change = (next: ProfileId) => {
    if (disabled || next === value) return;
    onChange?.(next);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;
    const at = ORDER.indexOf(value);
    let to = at;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        to = Math.min(at + 1, ORDER.length - 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        to = Math.max(at - 1, 0);
        break;
      case "Home":
        to = 0;
        break;
      case "End":
        to = ORDER.length - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    const next = ORDER[to];
    if (next) change(next);
  };

  return (
    <div
      class="channel-switch"
      role="radiogroup"
      tabIndex={0}
      aria-label={
        disabled ? channelSwitchSendingName(value) : channelCopy.switchLabel
      }
      aria-description={disabled ? undefined : channelCopy.switchHint}
      aria-disabled={disabled ? "true" : undefined}
      aria-activedescendant={optionId(value)}
      data-value={value}
      data-disabled={disabled ? "true" : undefined}
      onKeyDown={onKeyDown}
    >
      <span class="channel-thumb" aria-hidden="true" />
      {ORDER.map((id) => {
        const p = channelCopy.positions[id];
        return (
          // biome-ignore lint/a11y/useKeyWithClickEvents: keys are handled on the radiogroup
          // biome-ignore lint/a11y/useFocusableInteractive: the radiogroup holds focus (aria-activedescendant)
          // biome-ignore lint/a11y/useSemanticElements: a custom slide switch, not a native input
          <div
            key={id}
            id={optionId(id)}
            class="channel-position"
            role="radio"
            aria-checked={id === value ? "true" : "false"}
            data-on={id === value ? "true" : undefined}
            onClick={() => change(id)}
          >
            <span class="channel-name">{p.name}</span>
            <span class="channel-caption">{p.caption}</span>
          </div>
        );
      })}
    </div>
  );
}

/** The one-line note under the switch (Figma "Mode note"). */
export function ChannelModeNote({ value }: { value: ProfileId }) {
  return <p class="channel-note">{channelCopy.notes[value]}</p>;
}

/** "15–19.4 kHz" from the measured band, or null when the profile has none. */
export function quietBandLabel(): string | null {
  const band = PROFILES.quiet.carrierBandHz;
  return band ? `${formatKHz(band[0])}\u2013${formatKHz(band[1])} kHz` : null;
}

/** Amber notice shown while the channel is Quiet (State 10). Amber LED, never red. */
export function QuietNotice() {
  const band = quietBandLabel();
  return (
    <div class="quiet-notice" role="note">
      <span class="quiet-notice-led" aria-hidden="true" />
      <p>
        {channelCopy.quietNotice.before}
        {band ? <strong>{band}</strong> : null}
        {channelCopy.quietNotice.after}
      </p>
    </div>
  );
}
