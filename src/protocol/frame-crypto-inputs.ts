/**
 * Inputs the `crypto` spec feeds to AES-GCM: the AAD and the derived IV.
 * No WebCrypto calls here. Pure byte construction.
 */

import { IV_LEN, MAX_FRAMES, MESSAGE_ID_LEN } from "./budget";
import type { FrameHeader } from "./types";
import { type CryptoInputError, err, ok, type Result } from "./types";

/** AAD length: Message_ID (8) + type (1) + total minus 1 (1). */
const AAD_LEN = MESSAGE_ID_LEN + 2;

/** Length of the big-endian frame index appended to the Message_ID in the IV. */
const IV_INDEX_LEN = IV_LEN - MESSAGE_ID_LEN;

function isIntInRange(n: unknown, min: number, max: number): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
}

/**
 * AAD = messageId (8) || type (1) || total-1 (1). 10 bytes.
 * Excludes hop, ttl, index, encrypted flag, multi flag and body, so relays
 * can patch routing without breaking authentication.
 *
 * PROVISIONAL: this layout (including `total`) awaits confirmation by the
 * `crypto` spec. See design open item 1.
 *
 * Errors, in order: BAD_ID_LENGTH, BAD_TYPE (outside 0..5),
 * BAD_FRAME_INDEX (total not an integer 1..16).
 */
export function aadFor(
  h: Pick<FrameHeader, "messageId" | "type" | "total">,
): Result<Uint8Array, CryptoInputError> {
  if (
    !(h.messageId instanceof Uint8Array) ||
    h.messageId.length !== MESSAGE_ID_LEN
  ) {
    return err("BAD_ID_LENGTH");
  }
  if (!isIntInRange(h.type, 0, 5)) return err("BAD_TYPE");
  if (!isIntInRange(h.total, 1, MAX_FRAMES)) return err("BAD_FRAME_INDEX");

  const out = new Uint8Array(AAD_LEN);
  out.set(h.messageId, 0);
  out[MESSAGE_ID_LEN] = h.type;
  out[MESSAGE_ID_LEN + 1] = h.total - 1;
  return ok(out);
}

/**
 * IV = messageId (8) || index as uint32 big-endian (4). 12 bytes.
 * Errors, in order: BAD_ID_LENGTH, BAD_FRAME_INDEX (index not an integer 0..15).
 */
export function ivFor(
  messageId: Uint8Array,
  index: number,
): Result<Uint8Array, CryptoInputError> {
  if (
    !(messageId instanceof Uint8Array) ||
    messageId.length !== MESSAGE_ID_LEN
  ) {
    return err("BAD_ID_LENGTH");
  }
  if (!isIntInRange(index, 0, MAX_FRAMES - 1)) return err("BAD_FRAME_INDEX");

  const out = new Uint8Array(IV_LEN);
  out.set(messageId, 0);
  new DataView(out.buffer).setUint32(IV_LEN - IV_INDEX_LEN, index, false);
  return ok(out);
}
