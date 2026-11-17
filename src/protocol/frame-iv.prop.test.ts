import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { IV_LEN, MESSAGE_ID_LEN } from "./budget";
import { ivFor } from "./frame-crypto-inputs";

// Print the seed and path on failure so CI failures can be replayed.
const PARAMS = { verbose: true, numRuns: 500 } as const;

const messageIdArb = fc.uint8Array({
  minLength: MESSAGE_ID_LEN,
  maxLength: MESSAGE_ID_LEN,
});
const indexArb = fc.integer({ min: 0, max: 15 });

function iv(id: Uint8Array, index: number): Uint8Array {
  const r = ivFor(id, index);
  if (!r.ok) throw new Error(`ivFor failed: ${r.error.code}`);
  return r.value;
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

describe("Property 11: IVs never repeat", () => {
  /**
   * **Validates: Requirements 11.4, 11.5**
   */
  it("two IVs are equal if and only if Message_ID and index are both equal", () => {
    fc.assert(
      fc.property(
        messageIdArb,
        indexArb,
        messageIdArb,
        indexArb,
        (idA, iA, idB, iB) => {
          const a = iv(idA, iA);
          const b = iv(idB, iB);
          expect(a.length).toBe(IV_LEN);
          expect(b.length).toBe(IV_LEN);
          const sameInputs = equalBytes(idA, idB) && iA === iB;
          expect(equalBytes(a, b)).toBe(sameInputs);
        },
      ),
      PARAMS,
    );
  });

  /**
   * Same Message_ID with distinct indexes, and same index with distinct
   * Message_IDs, are the cases random pairs rarely hit.
   */
  it("same ID with different index, and same index with different ID, never collide", () => {
    fc.assert(
      fc.property(
        messageIdArb,
        messageIdArb,
        indexArb,
        indexArb,
        (idA, idB, iA, iB) => {
          fc.pre(iA !== iB);
          expect(equalBytes(iv(idA, iA), iv(idA, iB))).toBe(false);

          fc.pre(!equalBytes(idA, idB));
          expect(equalBytes(iv(idA, iA), iv(idB, iA))).toBe(false);
        },
      ),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 11.4**
   */
  it("layout is Message_ID followed by the index as 4-byte big-endian", () => {
    fc.assert(
      fc.property(messageIdArb, indexArb, (id, index) => {
        const out = iv(id, index);
        expect(Array.from(out.subarray(0, MESSAGE_ID_LEN))).toEqual(
          Array.from(id),
        );
        const tail = out.subarray(MESSAGE_ID_LEN);
        expect(tail.length).toBe(4);
        expect(Array.from(tail)).toEqual([0, 0, 0, index]);
        expect(
          new DataView(out.buffer, out.byteOffset, out.byteLength).getUint32(
            MESSAGE_ID_LEN,
            false,
          ),
        ).toBe(index);
      }),
      PARAMS,
    );
  });
});
