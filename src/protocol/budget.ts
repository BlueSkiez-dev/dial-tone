/** Byte constants and capacity math for the frame protocol. No other file hard-codes a size. */

export const GGWAVE_MAX_PAYLOAD = 140;
export const VERSION = 1;
export const MESSAGE_ID_LEN = 8;
export const TAG_LEN = 16;
export const IV_LEN = 12;
export const HEADER_LEN_SINGLE = 10;
export const HEADER_LEN_MULTI = 11;
export const CRC_LEN = 2;
export const MAX_FRAMES = 16;
export const MAX_HOP = 15;
export const MAX_TTL = 15;

/** Header bytes for a message with `total` frames: 10 for one frame, 11 for more. */
export function headerLength(total: number): 10 | 11 {
  return total > 1 ? HEADER_LEN_MULTI : HEADER_LEN_SINGLE;
}

/** Header plus CRC trailer bytes for a message with `total` frames: 12 for one frame, 13 for more. */
export function frameOverhead(total: number): number {
  return headerLength(total) + CRC_LEN;
}

/**
 * Max body bytes on the wire: 140 minus header and CRC trailer
 * (128 single frame, 127 multi frame). The encrypted flag is irrelevant.
 */
export function wireBodyCapacity(opts: { multi: boolean }): number {
  return GGWAVE_MAX_PAYLOAD - frameOverhead(opts.multi ? 2 : 1);
}

/** Max plaintext bytes per frame: wire capacity minus the GCM tag when encrypted. */
export function plaintextCapacity(opts: {
  encrypted: boolean;
  multi: boolean;
}): number {
  const wire = wireBodyCapacity({ multi: opts.multi });
  return opts.encrypted ? wire - TAG_LEN : wire;
}

/** UTF-8 byte count, never character count. Unpaired surrogates count as 3 bytes (U+FFFD). */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
