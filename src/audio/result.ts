/**
 * Local `ok` and `err` helpers. `src/protocol/index.ts` exports the `Result` type
 * but not these helpers, so src/audio keeps its own copies.
 */

import type { Result } from "../protocol";

export type { Result };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err<C extends string>(
  code: C,
): { ok: false; error: { code: C } } {
  return { ok: false, error: { code } };
}
