/** Frame codec: encode a Frame to wire bytes. Pure, no audio or UI imports. */

import {
  CRC_LEN,
  frameOverhead,
  GGWAVE_MAX_PAYLOAD,
  headerLength,
  MAX_FRAMES,
  MAX_HOP,
  MAX_TTL,
  MESSAGE_ID_LEN,
  TAG_LEN,
  VERSION,
} from "./budget";
import { crc16 } from "./crc16";
import type {
  DecodeError,
  EncodeError,
  Frame,
  MessageType,
  Result,
} from "./types";
import { err, ok } from "./types";

/** Message type value of KEY_OFFER (clause 1.8). */
const TYPE_KEY_OFFER = 4;
/** Highest valid message type (RESEND_REQUEST). */
const MAX_TYPE = 5;
/** KEY_OFFER body starts with a 16-byte group key (clause 6.5). */
const KEY_OFFER_MIN_BODY = 16;

function isInt(value: unknown, min: number, max: number): boolean {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

/**
 * Encode a Frame as wire bytes. Checks run in the order of clause 2.10, so the
 * first failing check decides the error. Never throws on data, never aliases
 * the input, and rejects frames over GGWAVE_MAX_PAYLOAD before ggwave sees them.
 */
export function encodeFrame(frame: Frame): Result<Uint8Array, EncodeError> {
  const h = frame.header;
  const body = frame.body;

  if ((h.version as number) !== VERSION) return err("BAD_VERSION");
  if (h.messageId.length !== MESSAGE_ID_LEN) return err("BAD_ID_LENGTH");
  if (!isInt(h.hop, 0, MAX_HOP) || !isInt(h.ttl, 0, MAX_TTL)) {
    return err("BAD_ROUTING");
  }
  if (!isInt(h.total, 1, MAX_FRAMES) || !isInt(h.index, 0, h.total - 1)) {
    return err("BAD_FRAME_INDEX");
  }
  if (!isInt(h.type, 0, MAX_TYPE)) return err("BAD_TYPE");
  if (h.encrypted && body.length < TAG_LEN) return err("BODY_TOO_SHORT");
  if (h.type === TYPE_KEY_OFFER) {
    if (h.encrypted) return err("KEY_OFFER_ENCRYPTED");
    if (h.total > 1) return err("KEY_OFFER_MULTIFRAME");
    if (body.length < KEY_OFFER_MIN_BODY) return err("BODY_TOO_SHORT");
  }

  const multi = h.total > 1;
  const headerLen = headerLength(h.total);
  const length = frameOverhead(h.total) + body.length;
  if (length > GGWAVE_MAX_PAYLOAD) return err("FRAME_TOO_LONG");

  const out = new Uint8Array(length);
  out[0] =
    (VERSION << 6) |
    ((h.encrypted ? 1 : 0) << 5) |
    ((multi ? 1 : 0) << 4) |
    (h.type << 1);
  out[1] = (h.hop << 4) | h.ttl;
  out.set(h.messageId, 2);
  if (multi) out[MESSAGE_ID_LEN + 2] = (h.index << 4) | (h.total - 1);
  out.set(body, headerLen);
  const crc = crc16(out.subarray(0, length - CRC_LEN));
  out[length - 2] = crc >> 8;
  out[length - 1] = crc & 0xff;
  return ok(out);
}

/**
 * Decode wire bytes into a Frame. Checks run in the order of clause 3.13, so
 * the first failing check decides the error. The CRC trailer is verified
 * before any field is read. Never throws, accepts only the canonical form (so
 * encodeFrame(decoded) equals the input), and returns copies that do not
 * alias `bytes`. The Body excludes the CRC. Does not validate UTF-8 in bodies.
 */
export function decodeFrame(bytes: Uint8Array): Result<Frame, DecodeError> {
  const length = bytes.length;
  if (length < frameOverhead(1)) return err("TOO_SHORT");
  if (length > GGWAVE_MAX_PAYLOAD) return err("TOO_LONG");

  const crc = crc16(bytes.subarray(0, length - CRC_LEN));
  const hi = bytes[length - 2] ?? 0;
  const lo = bytes[length - 1] ?? 0;
  if (crc !== ((hi << 8) | lo)) return err("BAD_CRC");

  const b0 = bytes[0] ?? 0;
  if (b0 >> 6 !== VERSION) return err("BAD_VERSION");
  if ((b0 & 1) !== 0) return err("RESERVED_BITS");
  const encrypted = ((b0 >> 5) & 1) === 1;
  const multi = ((b0 >> 4) & 1) === 1;
  const type = (b0 >> 1) & 7;
  if (type > MAX_TYPE) return err("UNKNOWN_TYPE");
  if (type === TYPE_KEY_OFFER && encrypted) return err("KEY_OFFER_ENCRYPTED");
  if (type === TYPE_KEY_OFFER && multi) return err("KEY_OFFER_MULTIFRAME");

  let index = 0;
  let total = 1;
  if (multi) {
    if (length < frameOverhead(2)) return err("TOO_SHORT");
    const frameByte = bytes[MESSAGE_ID_LEN + 2] ?? 0;
    index = frameByte >> 4;
    total = (frameByte & 15) + 1;
    if (total < 2) return err("NON_CANONICAL");
    if (index >= total) return err("BAD_FRAME_INDEX");
  }

  const body = bytes.slice(headerLength(total), length - CRC_LEN);
  if (encrypted && body.length < TAG_LEN) return err("BODY_TOO_SHORT");
  if (type === TYPE_KEY_OFFER && body.length < KEY_OFFER_MIN_BODY) {
    return err("BODY_TOO_SHORT");
  }

  const routing = bytes[1] ?? 0;
  return ok({
    header: {
      version: VERSION,
      type: type as MessageType,
      encrypted,
      hop: routing >> 4,
      ttl: routing & 15,
      messageId: bytes.slice(2, 2 + MESSAGE_ID_LEN),
      index,
      total,
    },
    body,
  });
}

/** Dedupe key: lowercase hex Message_ID, a colon, the frame index in decimal. */
export function frameKey(frame: Frame): string {
  let hex = "";
  for (const byte of frame.header.messageId) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return `${hex}:${frame.header.index}`;
}

/**
 * Relay edit: replace hop and TTL (byte 1) and recompute the CRC trailer.
 * Runs decodeFrame first and returns its error unchanged, including BAD_CRC
 * (clause 10.6, 10.9), then checks the routing values (clause 10.4). Needs no
 * key. Returns a copy, never mutates `wire`.
 */
export function patchRouting(
  wire: Uint8Array,
  hop: number,
  ttl: number,
): Result<Uint8Array, EncodeError | DecodeError> {
  const decoded = decodeFrame(wire);
  if (!decoded.ok) return decoded;
  if (!isInt(hop, 0, MAX_HOP) || !isInt(ttl, 0, MAX_TTL)) {
    return err("BAD_ROUTING");
  }
  const out = wire.slice();
  out[1] = (hop << 4) | ttl;
  const crc = crc16(out.subarray(0, out.length - CRC_LEN));
  out[out.length - 2] = crc >> 8;
  out[out.length - 1] = crc & 0xff;
  return ok(out);
}
