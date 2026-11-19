import "./QuickKeys.css";

export interface QuickKeysProps {
  disabled?: boolean;
  onSafe?: () => void;
  onLocation?: () => void;
}

const BASE = import.meta.env.BASE_URL;

/** Gallery-only. Two mini keys under the message well. Figma 270:389. */
export function QuickKeys(props: QuickKeysProps) {
  const disabled = props.disabled === true;
  return (
    <div class="quick-keys">
      <button
        type="button"
        class="quick-key"
        disabled={disabled}
        onClick={() => props.onSafe?.()}
      >
        <img src={`${BASE}art/icon-check.svg`} alt="" aria-hidden="true" />
        <span>I'm safe</span>
      </button>
      <button
        type="button"
        class="quick-key"
        disabled={disabled}
        onClick={() => props.onLocation?.()}
      >
        <img src={`${BASE}art/icon-pin.svg`} alt="" aria-hidden="true" />
        <span>Location</span>
      </button>
    </div>
  );
}
