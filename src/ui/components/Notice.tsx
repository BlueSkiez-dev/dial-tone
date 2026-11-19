import { sheetCopy } from "./sheet-copy";
import "./Notice.css";

export interface NoticeProps {
  /** Shows the mini key when given. A tap opens the Install sheet. */
  onKey?: () => void;
}

/**
 * The Install notice plate (Figma 270:401): amber LED, copy, optional mini key.
 * Amber only. Red stays reserved for SOS.
 */
export function Notice({ onKey }: NoticeProps) {
  const c = sheetCopy.notice;
  return (
    <aside class="notice" aria-label={sheetCopy.noticeLabel}>
      <span class="notice-led" aria-hidden="true" />
      <p class="notice-text">
        <strong>{c.strong}</strong>
        {c.rest}
      </p>
      {onKey ? (
        <button type="button" class="notice-key" onClick={() => onKey()}>
          {c.key}
        </button>
      ) : null}
    </aside>
  );
}
