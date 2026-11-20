import type { Result } from "../../protocol/index";
import {
  encodeFrame,
  GGWAVE_MAX_PAYLOAD,
  makeFrames,
  newMessageId,
  splitPayload,
} from "../../protocol/index";
import { wellLimit } from "./meter";

/**
 * Number of pass-ons a sent message survives. A message sent with TTL 3 can be
 * relayed three times and no more. The 4-bit field allows 0..15. The relay
 * spec owns the rule.
 */
export const SEND_TTL = 3;

export type BuildError = "EMPTY" | "TOO_LONG" | "ID_FAILED" | "FRAME_FAILED";

type Rng = Parameters<typeof newMessageId>[0];

export interface BuiltWire {
  readonly wire: Uint8Array;
  readonly messageId: Uint8Array;
  readonly bytes: number;
}

function fail(code: BuildError): { ok: false; error: { code: BuildError } } {
  return { ok: false, error: { code } };
}

/**
 * Builds the single-frame, unencrypted TEXT wire for a draft.
 * Empty and over-limit text is rejected before any protocol call.
 */
export function buildWire(
  text: string,
  rng?: Rng,
): Result<BuiltWire, { code: BuildError }> {
  const payload = new TextEncoder().encode(text);
  if (payload.length === 0) return fail("EMPTY");
  if (payload.length > wellLimit()) return fail("TOO_LONG");

  const parts = splitPayload(payload, {
    encrypted: false,
    utf8Boundaries: true,
  });
  if (!parts.ok || parts.value.length !== 1) return fail("TOO_LONG");

  const id = newMessageId(rng);
  if (!id.ok) return fail("ID_FAILED");

  const frames = makeFrames(
    {
      type: 0,
      encrypted: false,
      hop: 0,
      ttl: SEND_TTL,
      messageId: id.value,
    },
    parts.value,
  );
  if (!frames.ok || frames.value.length !== 1 || !frames.value[0]) {
    return fail("FRAME_FAILED");
  }

  const wire = encodeFrame(frames.value[0]);
  if (!wire.ok || wire.value.length > GGWAVE_MAX_PAYLOAD) {
    return fail("FRAME_FAILED");
  }
  return {
    ok: true,
    value: { wire: wire.value, messageId: id.value, bytes: payload.length },
  };
}
