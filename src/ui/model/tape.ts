import type { ProfileId } from "../../audio/index";

/** Keys resolved to text in copy.ts. */
export type NoticeKey =
  | "unsupported"
  | "mic-again"
  | "listening-open"
  | "unreadable"
  | "relay-failed";

/** Routing facts of a heard frame, kept in memory only and never persisted. */
export interface RelayMeta {
  readonly hop: number;
  readonly ttl: number;
  readonly multi: boolean;
  readonly keyOffer: boolean;
}

export type Slip =
  | {
      readonly kind: "sent";
      readonly id: string;
      readonly at: number;
      readonly text: string;
      readonly bytes: number;
      readonly mode: ProfileId;
      readonly airtimeMs: number;
    }
  | {
      readonly kind: "heard";
      readonly id: string;
      readonly at: number;
      readonly text: string;
      readonly bytes: number;
      readonly hop: number;
      readonly relay?: RelayMeta;
      readonly passedOn?: true;
    }
  | {
      readonly kind: "system";
      readonly id: string;
      readonly at: number;
      readonly noticeKey: NoticeKey;
      readonly relay?: RelayMeta;
      readonly passedOn?: true;
    }
  | { readonly kind: "update-ready"; readonly id: string; readonly at: number };

/** Gallery-only slip kinds, rendered by the Slip component but never created by the live app. */
export interface GallerySlip {
  readonly kind:
    | "relayed"
    | "sos"
    | "locked"
    | "locked-no-key"
    | "location"
    | "safe";
  readonly id: string;
  readonly at: number;
  readonly text?: string;
  readonly hop?: number;
  readonly mode?: ProfileId;
}

export const TAPE_COLLAPSED = 3;
/** Design parameter. Oldest slips are dropped first. */
export const TAPE_MAX = 50;
/** Design parameter (requirement 7.12): longest slip text. */
export const SLIP_TEXT_MAX = 1024;

/** Appends a slip (the tape is oldest first) and drops the oldest beyond TAPE_MAX. */
export function pushSlip(tape: readonly Slip[], slip: Slip): readonly Slip[] {
  const next = [...tape, slip];
  return next.length > TAPE_MAX ? next.slice(next.length - TAPE_MAX) : next;
}

/** Newest first. Collapsed shows the latest TAPE_COLLAPSED slips. */
export function visibleSlips(
  tape: readonly Slip[],
  expanded: boolean,
): { slips: readonly Slip[]; hidden: number } {
  const newestFirst = tape.slice().reverse();
  if (expanded) return { slips: newestFirst, hidden: 0 };
  return {
    slips: newestFirst.slice(0, TAPE_COLLAPSED),
    hidden: Math.max(0, tape.length - TAPE_COLLAPSED),
  };
}

/** Strips control characters (C0, DEL, C1) and caps at SLIP_TEXT_MAX characters. */
export function sanitizeText(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping controls is the purpose
  const clean = text.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
  if (clean.length <= SLIP_TEXT_MAX) return clean;
  return Array.from(clean).slice(0, SLIP_TEXT_MAX).join("");
}
