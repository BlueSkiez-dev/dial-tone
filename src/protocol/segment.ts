/** Payload segmentation, frame building and reassembly. Pure logic, no audio or UI imports. */

import { MAX_FRAMES, plaintextCapacity, TAG_LEN, VERSION } from "./budget";
import { encodeFrame } from "./frame";
import {
  err,
  type Frame,
  type MakeFramesError,
  type MessageType,
  ok,
  type ReassembleError,
  type Result,
  type SegmentError,
} from "./types";

/** Message type value of KEY_OFFER (clause 1.8). */
const TYPE_KEY_OFFER = 4;

export interface SplitOptions {
  readonly encrypted: boolean;
  /** true for TEXT: never cut inside a UTF-8 sequence, so each chunk is valid UTF-8. */
  readonly utf8Boundaries: boolean;
}

/**
 * Strict UTF-8 validation: rejects overlong forms, surrogates (U+D800..U+DFFF),
 * code points above U+10FFFF, stray continuation bytes and truncated sequences.
 * Hand-written so `src/protocol` needs no `TextDecoder`.
 */
function isValidUtf8(bytes: Uint8Array): boolean {
  const n = bytes.length;
  let i = 0;
  while (i < n) {
    const b0 = bytes[i] as number;
    if (b0 < 0x80) {
      i += 1;
      continue;
    }
    let need: number;
    let min: number;
    let cp: number;
    if (b0 >= 0xc2 && b0 <= 0xdf) {
      need = 1;
      min = 0x80;
      cp = b0 & 0x1f;
    } else if (b0 >= 0xe0 && b0 <= 0xef) {
      need = 2;
      min = 0x800;
      cp = b0 & 0x0f;
    } else if (b0 >= 0xf0 && b0 <= 0xf4) {
      need = 3;
      min = 0x10000;
      cp = b0 & 0x07;
    } else {
      return false; // 0x80..0xC1 (stray continuation or overlong lead), 0xF5..0xFF
    }
    if (i + need >= n) return false; // truncated sequence
    for (let k = 1; k <= need; k++) {
      const b = bytes[i + k] as number;
      if ((b & 0xc0) !== 0x80) return false;
      cp = (cp << 6) | (b & 0x3f);
    }
    if (cp < min) return false; // overlong
    if (cp > 0x10ffff) return false;
    if (cp >= 0xd800 && cp <= 0xdfff) return false;
    i += need + 1;
  }
  return true;
}

/**
 * Splits a payload into per-frame chunks.
 * - Invalid UTF-8 with `utf8Boundaries` returns INVALID_UTF8 first.
 * - Payload within the single-frame plaintext capacity yields one chunk (empty payload: one empty chunk).
 * - Otherwise greedy chunks of at most the multi-frame plaintext capacity, cut only between
 *   UTF-8 sequences when `utf8Boundaries` is set.
 * - TOO_MANY_FRAMES when more than 16 chunks would be needed (greedy is minimal).
 * Returned chunks are copies.
 */
export function splitPayload(
  payload: Uint8Array,
  opts: SplitOptions,
): Result<Uint8Array[], SegmentError> {
  if (opts.utf8Boundaries && !isValidUtf8(payload)) {
    return err("INVALID_UTF8");
  }

  const single = plaintextCapacity({ encrypted: opts.encrypted, multi: false });
  if (payload.length <= single) {
    return ok([payload.slice()]);
  }

  const cap = plaintextCapacity({ encrypted: opts.encrypted, multi: true });
  const chunks: Uint8Array[] = [];
  let pos = 0;
  while (pos < payload.length) {
    // Invariant: chunks joined equal payload[0..pos), each chunk within cap.
    let end = Math.min(pos + cap, payload.length);
    if (opts.utf8Boundaries && end < payload.length) {
      // payload[end] is a continuation byte: back up to the start of its sequence.
      while (end > pos && ((payload[end] as number) & 0xc0) === 0x80) {
        end--;
      }
    }
    chunks.push(payload.slice(pos, end));
    pos = end;
    if (chunks.length > MAX_FRAMES) {
      return err("TOO_MANY_FRAMES");
    }
  }
  return ok(chunks);
}

/** Message-level fields shared by every frame of one message. */
export interface FrameTemplate {
  readonly type: MessageType;
  readonly encrypted: boolean;
  readonly hop: number;
  readonly ttl: number;
  readonly messageId: Uint8Array;
}

/**
 * Builds n frames from n final bodies (already sealed when encrypted).
 * Returns exactly one error, first failing check wins (clause 8.9):
 * EMPTY_SET, TOO_MANY_FRAMES, BAD_ID_LENGTH, BAD_ROUTING, BAD_TYPE,
 * KEY_OFFER_ENCRYPTED, KEY_OFFER_MULTIFRAME, then per body in index order
 * BODY_TOO_SHORT and FRAME_TOO_LONG. Validation is delegated to `encodeFrame`.
 * Returned frames hold copies of the template ID and the bodies.
 */
export function makeFrames(
  template: FrameTemplate,
  bodies: readonly Uint8Array[],
): Result<Frame[], MakeFramesError> {
  const total = bodies.length;
  if (total === 0) return err("EMPTY_SET");
  if (total > MAX_FRAMES) return err("TOO_MANY_FRAMES");

  const build = (index: number, body: Uint8Array): Frame => ({
    header: {
      version: VERSION,
      type: template.type,
      encrypted: template.encrypted,
      hop: template.hop,
      ttl: template.ttl,
      messageId: template.messageId.slice(),
      index,
      total,
    },
    body: body.slice(),
  });

  // Template checks: a probe body of TAG_LEN bytes (also the KEY_OFFER minimum)
  // passes every body-length check, and total 1 skips the multi-frame check,
  // so only template errors can come back, in the order of clause 2.10.
  const probe = encodeFrame({
    header: { ...build(0, new Uint8Array(TAG_LEN)).header, total: 1 },
    body: new Uint8Array(TAG_LEN),
  });
  if (!probe.ok) return err(probe.error.code);
  if (template.type === TYPE_KEY_OFFER && total > 1) {
    return err("KEY_OFFER_MULTIFRAME");
  }

  const frames: Frame[] = [];
  for (let i = 0; i < total; i++) {
    const frame = build(i, bodies[i] as Uint8Array);
    const encoded = encodeFrame(frame);
    if (!encoded.ok) return err(encoded.error.code);
    frames.push(frame);
  }
  return ok(frames);
}

/** Message-level fields only. No hop or ttl, so the result does not depend on arrival order. */
export interface MessageInfo {
  readonly messageId: Uint8Array;
  readonly type: MessageType;
  readonly encrypted: boolean;
  readonly total: number;
}

export type Reassembly =
  | { complete: true; payload: Uint8Array; message: MessageInfo }
  | { complete: false; missing: number[]; total: number };

/** Lexicographic byte comparison; a shorter prefix sorts first. */
function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = (a[i] as number) - (b[i] as number);
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

function compareFrames(a: Frame, b: Frame): number {
  const ha = a.header;
  const hb = b.header;
  return (
    ha.index - hb.index ||
    compareBytes(ha.messageId, hb.messageId) ||
    ha.type - hb.type ||
    Number(ha.encrypted) - Number(hb.encrypted) ||
    ha.total - hb.total ||
    compareBytes(a.body, b.body)
  );
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return compareBytes(a, b) === 0;
}

/**
 * Joins frame bodies in index order. Byte-agnostic and never decrypts: for encrypted
 * messages the caller passes frames whose body is the opened plaintext chunk.
 * Frames are evaluated in ascending index order (equal indexes ordered by message ID,
 * type, encrypted, total, body), so the error does not depend on arrival order (clause 9.8).
 * Hop and ttl are ignored. Identical duplicates are ignored.
 */
export function reassemble(
  frames: readonly Frame[],
): Result<Reassembly, ReassembleError> {
  if (frames.length === 0) return err("EMPTY_SET");

  const sorted = frames.slice().sort(compareFrames);
  const first = sorted[0] as Frame;
  const fh = first.header;

  const bodies = new Map<number, Uint8Array>();
  for (const frame of sorted) {
    const h = frame.header;
    if (
      !bytesEqual(h.messageId, fh.messageId) ||
      h.type !== fh.type ||
      h.encrypted !== fh.encrypted ||
      h.total !== fh.total ||
      h.index < 0 ||
      h.index >= fh.total
    ) {
      return err("MISMATCHED_FRAMES");
    }
    const seen = bodies.get(h.index);
    if (seen === undefined) {
      bodies.set(h.index, frame.body);
    } else if (!bytesEqual(seen, frame.body)) {
      return err("CONFLICTING_DUPLICATE");
    }
  }

  const missing: number[] = [];
  for (let i = 0; i < fh.total; i++) {
    if (!bodies.has(i)) missing.push(i);
  }
  if (missing.length > 0) {
    return ok({ complete: false, missing, total: fh.total });
  }

  let length = 0;
  for (let i = 0; i < fh.total; i++)
    length += (bodies.get(i) as Uint8Array).length;
  const payload = new Uint8Array(length);
  let pos = 0;
  for (let i = 0; i < fh.total; i++) {
    const body = bodies.get(i) as Uint8Array;
    payload.set(body, pos);
    pos += body.length;
  }

  return ok({
    complete: true,
    payload,
    message: {
      messageId: fh.messageId.slice(),
      type: fh.type,
      encrypted: fh.encrypted,
      total: fh.total,
    },
  });
}
