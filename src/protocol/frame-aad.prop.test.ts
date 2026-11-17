import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decodeFrame, encodeFrame, patchRouting } from "./frame";
import { aadFor } from "./frame-crypto-inputs";
import type { Frame, FrameHeader, MessageType } from "./types";

/**
 * Property 10: Relay can't forge the AAD.
 *
 * **Validates: Requirements 11.1, 11.2, 11.3**
 *
 * On failure fast-check reports `seed` and `path`. Replay with
 * `fc.assert(prop, { seed, path })`. `verbose: 2` also prints every
 * counterexample on the shrink path.
 */
const PARAMS = { numRuns: 500, verbose: 2 } as const;

const messageIdArb = fc.uint8Array({ minLength: 8, maxLength: 8 });
const typeArb = fc.integer({ min: 0, max: 5 }).map((t) => t as MessageType);
const totalArb = fc.integer({ min: 1, max: 16 });

/** Fields the AAD must ignore. `index` is bounded by `total`, so it is built per total. */
const volatileArb = (total: number) =>
  fc.record({
    hop: fc.integer({ min: 0, max: 15 }),
    ttl: fc.integer({ min: 0, max: 15 }),
    index: fc.integer({ min: 0, max: total - 1 }),
    encrypted: fc.boolean(),
  });

function header(
  messageId: Uint8Array,
  type: MessageType,
  total: number,
  v: { hop: number; ttl: number; index: number; encrypted: boolean },
): FrameHeader {
  return { version: 1, messageId, type, total, ...v };
}

function aad(h: Pick<FrameHeader, "messageId" | "type" | "total">): Uint8Array {
  const r = aadFor(h);
  if (!r.ok) throw new Error(`aadFor failed: ${r.error.code}`);
  return r.value;
}

describe("Property 10: AAD isolation", () => {
  it("is 10 bytes laid out as id || type || total-1", () => {
    fc.assert(
      fc.property(messageIdArb, typeArb, totalArb, (id, type, total) => {
        const out = aad({ messageId: id, type, total });
        expect(out.length).toBe(10);
        expect(Array.from(out.slice(0, 8))).toEqual(Array.from(id));
        expect(out[8]).toBe(type);
        expect(out[9]).toBe(total - 1);
      }),
      PARAMS,
    );
  });

  it("does not depend on hop, ttl, index, encrypted flag, multi flag or body", () => {
    // The multi flag is `total > 1`, so it is covered by holding total fixed
    // while the other fields vary. The body is not an input to aadFor at all;
    // frames that differ only in body therefore share one header and one AAD.
    fc.assert(
      fc.property(
        messageIdArb,
        typeArb,
        totalArb,
        fc.nat(),
        fc.nat(),
        (id, type, total, s1, s2) => {
          const pick = (seed: number) =>
            fc.sample(volatileArb(total), { seed, numRuns: 1 })[0];
          const a = pick(s1);
          const b = pick(s2);
          if (!a || !b) throw new Error("sampling failed");
          const ha = header(id, type, total, a);
          const hb = header(id, type, total, b);
          // Pass the full headers: extra fields must be ignored.
          expect(Array.from(aad(ha))).toEqual(Array.from(aad(hb)));
        },
      ),
      PARAMS,
    );
  });

  it("is equal for a frame and its patchRouting output", () => {
    // Relays rewrite hop, ttl and the CRC trailer. None of them is AAD input.
    // Type 4 (key offer) is skipped: it needs total 1 and a 16-byte body.
    fc.assert(
      fc.property(
        messageIdArb,
        fc.constantFrom(0, 1, 2, 3, 5),
        totalArb,
        fc.nat(),
        fc.boolean(),
        fc.uint8Array({ minLength: 16, maxLength: 100 }),
        fc.integer({ min: 0, max: 15 }),
        fc.integer({ min: 0, max: 15 }),
        (id, type, total, indexSeed, encrypted, body, hop, ttl) => {
          const frame: Frame = {
            header: {
              version: 1,
              type: type as MessageType,
              encrypted,
              hop: 0,
              ttl: 15,
              messageId: id,
              index: indexSeed % total,
              total,
            },
            body,
          };
          const wire = encodeFrame(frame);
          if (!wire.ok) throw new Error(`encodeFrame: ${wire.error.code}`);
          const patched = patchRouting(wire.value, hop, ttl);
          if (!patched.ok)
            throw new Error(`patchRouting: ${patched.error.code}`);
          const after = decodeFrame(patched.value);
          if (!after.ok) throw new Error(`decodeFrame: ${after.error.code}`);
          expect(Array.from(aad(after.value.header))).toEqual(
            Array.from(aad(frame.header)),
          );
        },
      ),
      PARAMS,
    );
  });

  it("changes when messageId, type or total changes", () => {
    fc.assert(
      fc.property(
        messageIdArb,
        typeArb,
        totalArb,
        messageIdArb,
        typeArb,
        totalArb,
        (idA, typeA, totalA, idB, typeB, totalB) => {
          const a = aad({ messageId: idA, type: typeA, total: totalA });
          const b = aad({ messageId: idB, type: typeB, total: totalB });
          const sameInputs =
            typeA === typeB &&
            totalA === totalB &&
            idA.length === idB.length &&
            idA.every((byte, i) => byte === idB[i]);
          expect(Array.from(a).every((byte, i) => byte === b[i])).toBe(
            sameInputs,
          );
        },
      ),
      PARAMS,
    );
  });

  it("changes when exactly one of messageId, type or total changes", () => {
    fc.assert(
      fc.property(
        messageIdArb,
        typeArb,
        totalArb,
        fc.integer({ min: 0, max: 7 }),
        fc.integer({ min: 1, max: 255 }),
        (id, type, total, byteIdx, xor) => {
          const base = aad({ messageId: id, type, total });

          const id2 = id.slice();
          id2[byteIdx] = (id2[byteIdx] ?? 0) ^ xor;
          expect(aad({ messageId: id2, type, total })).not.toEqual(base);

          const type2 = ((type + 1) % 6) as MessageType;
          expect(aad({ messageId: id, type: type2, total })).not.toEqual(base);

          const total2 = (total % 16) + 1;
          expect(aad({ messageId: id, type, total: total2 })).not.toEqual(base);
        },
      ),
      PARAMS,
    );
  });
});
