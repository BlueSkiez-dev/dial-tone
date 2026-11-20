import type { Frame } from "../../protocol/index";
import {
  canRelay,
  frameKey,
  hasSeen,
  markSeen,
  reassemble,
  SEEN_MAX,
} from "../../protocol/index";
import { type RelayMeta, type Slip, sanitizeText } from "./tape";

export interface ReceiveState {
  /** frameKey values, newest last, capped at SEEN_MAX. */
  readonly seen: readonly string[];
  /** Frames of unfinished multi-frame messages by hex message id, capped at PARTIAL_MAX. */
  readonly partial: Readonly<Record<string, readonly Frame[]>>;
}

export { SEEN_MAX };
/** Design parameter. */
export const PARTIAL_MAX = 8;

export const EMPTY_RECEIVE: ReceiveState = { seen: [], partial: {} };

const TYPE_TEXT = 0;
const TYPE_KEY_OFFER = 4;

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
  relay: RelayMeta,
): Slip {
  return {
    kind: "heard",
    id,
    at: atMs,
    text: decodeText(payload),
    bytes: payload.length,
    hop: relay.hop,
    relay,
  };
}

/** Turns one transport frame event into at most one slip. Never throws. */
export function receiveFrame(
  rs: ReceiveState,
  ev: { frame: Frame; ownEcho: boolean; atMs: number },
): { next: ReceiveState; slip: Slip | null; holdsWire: boolean } {
  if (ev.ownEcho) return { next: rs, slip: null, holdsWire: false };
  const { frame, atMs } = ev;
  const key = frameKey(frame);
  if (hasSeen(rs.seen, key)) return { next: rs, slip: null, holdsWire: false };

  const seen = markSeen(rs.seen, key);
  const h = frame.header;
  const msgHex = hex(h.messageId);

  const single = h.total <= 1;

  if (h.type !== TYPE_TEXT || h.encrypted) {
    if (!single) {
      return {
        next: { seen, partial: rs.partial },
        slip: { kind: "system", id: key, at: atMs, noticeKey: "unsupported" },
        holdsWire: false,
      };
    }
    return {
      next: { seen, partial: rs.partial },
      slip: {
        kind: "system",
        id: key,
        at: atMs,
        noticeKey: "unreadable",
        relay: {
          hop: h.hop,
          ttl: h.ttl,
          multi: false,
          keyOffer: h.type === TYPE_KEY_OFFER,
        },
      },
      holdsWire: canRelay(h),
    };
  }

  if (single) {
    return {
      next: { seen, partial: rs.partial },
      slip: heard(key, atMs, frame.body, {
        hop: h.hop,
        ttl: h.ttl,
        multi: false,
        keyOffer: false,
      }),
      holdsWire: canRelay(h),
    };
  }

  const collected = [...(rs.partial[msgHex] ?? []), frame];
  const result = reassemble(collected);
  const { [msgHex]: _dropped, ...others } = rs.partial;

  if (result.ok && result.value.complete) {
    const hop = Math.max(...collected.map((f) => f.header.hop));
    return {
      next: { seen, partial: others },
      slip: heard(msgHex, atMs, result.value.payload, {
        hop,
        ttl: Math.min(...collected.map((f) => f.header.ttl)),
        multi: true,
        keyOffer: false,
      }),
      holdsWire: false,
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
  return { next: { seen, partial }, slip: null, holdsWire: false };
}
