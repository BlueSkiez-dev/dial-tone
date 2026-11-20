/**
 * Relay rules: which heard frames may be passed on, and the wire to replay.
 * Pure and body-blind. Decisions use only the header fields type, total, hop
 * and ttl. `type` is compared with KEY_OFFER and used for nothing else.
 */

import { decodeFrame, patchRouting } from "./frame";
import type { DecodeErrorCode, FrameHeader, Result } from "./types";
import { err, ok } from "./types";

/** Design parameter: cap of the Relay_State (Message_Keys, newest last). */
export const SEEN_MAX = 256;

/** Message type value of KEY_OFFER, read from the header only. */
const KEY_OFFER_TYPE = 4;

/** Highest hop count that can still be passed on (hop is 4 bits). */
const HOP_LIMIT_VALUE = 15;

export type RelayRefusal =
  | "MULTI_FRAME"
  | "NOT_RELAYED_TYPE"
  | "NO_HOPS_LEFT"
  | "HOP_LIMIT";
export type RelayErrorCode = RelayRefusal | DecodeErrorCode | "BAD_ROUTING";
export type RelayError = { readonly code: RelayErrorCode };

/** The only header fields the relay may read. A Frame header is assignable. */
export type RelayView = Pick<FrameHeader, "type" | "hop" | "ttl" | "total">;

/**
 * Result form of the rule. Reason order: MULTI_FRAME, NOT_RELAYED_TYPE,
 * NO_HOPS_LEFT, HOP_LIMIT.
 */
export function checkRelay(
  view: RelayView,
): Result<true, { readonly code: RelayRefusal }> {
  if (view.total > 1) return err("MULTI_FRAME");
  if (view.type === KEY_OFFER_TYPE) return err("NOT_RELAYED_TYPE");
  if (view.ttl < 1) return err("NO_HOPS_LEFT");
  if (view.hop >= HOP_LIMIT_VALUE) return err("HOP_LIMIT");
  return ok(true);
}

/** true iff total = 1, type is not KEY_OFFER, ttl >= 1 and hop < 15. */
export function canRelay(view: RelayView): boolean {
  return checkRelay(view).ok;
}

/**
 * decodeFrame, then checkRelay, then patchRouting(wire, hop + 1, ttl - 1).
 * Returns the patched wire, a refusal, or the decode error (including BAD_CRC).
 * Never throws.
 */
export function relayWire(wire: Uint8Array): Result<Uint8Array, RelayError> {
  const decoded = decodeFrame(wire);
  if (!decoded.ok) return decoded;
  const { header } = decoded.value;
  const verdict = checkRelay(header);
  if (!verdict.ok) return verdict;
  const patched = patchRouting(wire, header.hop + 1, header.ttl - 1);
  if (!patched.ok) return err("BAD_ROUTING");
  return patched;
}

/** True when the Message_Key is in the Relay_State. */
export function hasSeen(seen: readonly string[], key: string): boolean {
  return seen.includes(key);
}

/**
 * Appends a new key and drops the oldest beyond SEEN_MAX. A key already held
 * leaves the list unchanged (same array returned).
 */
export function markSeen(
  seen: readonly string[],
  key: string,
): readonly string[] {
  if (seen.includes(key)) return seen;
  const next = [...seen, key];
  return next.length > SEEN_MAX ? next.splice(next.length - SEEN_MAX) : next;
}
