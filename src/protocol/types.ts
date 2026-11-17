/** Shared types for the frame protocol. Pure types and two tiny helpers. No audio or UI imports. */

/** Error value returned for invalid data. Functions never throw on data errors. */
export interface ErrorOf<C extends string> {
  readonly code: C;
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

/** Builds a failed Result whose error is `{ code }`. */
export function err<C extends string>(
  code: C,
): { ok: false; error: ErrorOf<C> } {
  return { ok: false, error: { code } };
}

/** TEXT, LOCATION, SAFE, SOS, KEY_OFFER, RESEND_REQUEST. Values 6 and 7 are reserved. */
export type MessageType = 0 | 1 | 2 | 3 | 4 | 5;

export interface FrameHeader {
  readonly version: 1;
  readonly type: MessageType;
  readonly encrypted: boolean;
  /** 0..15 */
  readonly hop: number;
  /** 0..15 */
  readonly ttl: number;
  /** Exactly 8 bytes. */
  readonly messageId: Uint8Array;
  /** 0..total-1 */
  readonly index: number;
  /** 1..16 */
  readonly total: number;
}

export interface Frame {
  readonly header: FrameHeader;
  /** Plaintext payload, or ciphertext followed by the 16-byte tag when header.encrypted. */
  readonly body: Uint8Array;
}

/** Closed code sets (requirements 12.2, 12.4, 12.6). */
export type DecodeErrorCode =
  | "TOO_SHORT"
  | "TOO_LONG"
  | "BAD_CRC"
  | "BAD_VERSION"
  | "RESERVED_BITS"
  | "UNKNOWN_TYPE"
  | "BAD_FRAME_INDEX"
  | "NON_CANONICAL"
  | "BODY_TOO_SHORT"
  | "KEY_OFFER_ENCRYPTED"
  | "KEY_OFFER_MULTIFRAME";

export type EncodeErrorCode =
  | "BAD_ID_LENGTH"
  | "BAD_ROUTING"
  | "BAD_FRAME_INDEX"
  | "BAD_TYPE"
  | "BAD_VERSION"
  | "BODY_TOO_SHORT"
  | "KEY_OFFER_ENCRYPTED"
  | "KEY_OFFER_MULTIFRAME"
  | "FRAME_TOO_LONG";

/** `patchRouting` fails with BAD_ROUTING or any decode code. */
export type PatchRoutingErrorCode = "BAD_ROUTING" | DecodeErrorCode;

export type SegmentErrorCode = "INVALID_UTF8" | "TOO_MANY_FRAMES";

/** `makeFrames` codes: EMPTY_SET, TOO_MANY_FRAMES and a subset of the encode codes. */
export type MakeFramesErrorCode =
  | "EMPTY_SET"
  | "TOO_MANY_FRAMES"
  | EncodeErrorCode;

export type ReassembleErrorCode =
  | "EMPTY_SET"
  | "MISMATCHED_FRAMES"
  | "CONFLICTING_DUPLICATE";

export type CryptoInputErrorCode =
  | "BAD_ID_LENGTH"
  | "BAD_TYPE"
  | "BAD_FRAME_INDEX";

export type MessageIdErrorCode = "BAD_RNG";

/** Error objects, shaped `{ code }`. */
export type DecodeError = ErrorOf<DecodeErrorCode>;
export type EncodeError = ErrorOf<EncodeErrorCode>;
export type PatchRoutingError = ErrorOf<PatchRoutingErrorCode>;
export type SegmentError = ErrorOf<SegmentErrorCode>;
export type MakeFramesError = ErrorOf<MakeFramesErrorCode>;
export type ReassembleError = ErrorOf<ReassembleErrorCode>;
export type CryptoInputError = ErrorOf<CryptoInputErrorCode>;
export type MessageIdError = ErrorOf<MessageIdErrorCode>;
