import { MESSAGE_ID_LEN } from "./budget";
import type { MessageIdError, Result } from "./types";
import { err, ok } from "./types";

/** Source of random bytes. Called with the number of bytes wanted. */
export type Rng = (n: number) => Uint8Array;

function defaultRng(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Returns a new 8-byte Message_ID. The default RNG is
 * `crypto.getRandomValues`. An injected RNG makes tests deterministic.
 * Returns `BAD_RNG` when the RNG returns an array that is not 8 bytes long.
 * The returned array is a copy, so it never aliases the RNG's output.
 */
export function newMessageId(
  rng: Rng = defaultRng,
): Result<Uint8Array, MessageIdError> {
  const bytes = rng(MESSAGE_ID_LEN);
  if (!(bytes instanceof Uint8Array) || bytes.length !== MESSAGE_ID_LEN) {
    return err("BAD_RNG");
  }
  return ok(bytes.slice());
}
