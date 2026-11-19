import type { Frame } from "../../protocol/index";
import { frameKey, reassemble } from "../../protocol/index";
import { type Slip, sanitizeText } from "./tape";

export interface ReceiveState {
  /** frameKey values, newest last, capped at SEEN_MAX. */
  readonly seen: readonly string[];
  /** Frames of unfinished multi-frame messages by hex message id, capped at PARTIAL_MAX. */
  readonly partial: Readonly<Record<string, readonly Frame[]>>;
}

/** Design parameter. */
export const SEEN_MAX = 256;
/** Design parameter. */
export const PARTIAL_MAX = 8;

export const EMPTY_RECEIVE: ReceiveState = { seen: [], partial: {} };

const TYPE_TEXT = 0;

function hex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

function decodeText(bytes: Uint8Array): string {
  return sanitizeText(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
}

function heard(
  id: string,
  atMs: number,
  payload: Uint8Array,
  hop: number,
): Slip {
  return {
    kind: "heard",
    id,
    at: atMs,
    text: decodeText(payload),
    bytes: payload.length,
    hop,
  };
}

/** Turns one transport frame event into at most one slip. Never throws. */
export function receiveFrame(
  rs: ReceiveState,
  ev: { frame: Frame; ownEcho: boolean; atMs: number },
): { next: ReceiveState; slip: Slip | null } {
  if (ev.ownEcho) return { next: rs, slip: null };
  const { frame, atMs } = ev;
  const key = frameKey(frame);
  if (rs.seen.includes(key)) return { next: rs, slip: null };

  const seenAll = [...rs.seen, key];
  const seen =
    seenAll.length > SEEN_MAX
      ? seenAll.slice(seenAll.length - SEEN_MAX)
      : seenAll;
  const h = frame.header;
  const msgHex = hex(h.messageId);

  if (h.type !== TYPE_TEXT || h.encrypted) {
    return {
      next: { seen, partial: rs.partial },
      slip: { kind: "system", id: key, at: atMs, noticeKey: "unsupported" },
    };
  }

  if (h.total <= 1) {
    return {
      next: { seen, partial: rs.partial },
      slip: heard(key, atMs, frame.body, h.hop),
    };
  }

  const collected = [...(rs.partial[msgHex] ?? []), frame];
  const result = reassemble(collected);
  const { [msgHex]: _dropped, ...others } = rs.partial;

  if (result.ok && result.value.complete) {
    const hop = Math.max(...collected.map((f) => f.header.hop));
    return {
      next: { seen, partial: others },
      slip: heard(msgHex, atMs, result.value.payload, hop),
    };
  }

  // Incomplete, or inconsistent frames: restart this message from the newest frame.
  const kept = result.ok ? collected : [frame];
  const partial: Record<string, readonly Frame[]> = {
    ...others,
    [msgHex]: kept,
  };
  const keys = Object.keys(partial);
  for (let i = 0; keys.length - i > PARTIAL_MAX; i++) {
    delete partial[keys[i] as string];
  }
  return { next: { seen, partial }, slip: null };
}
