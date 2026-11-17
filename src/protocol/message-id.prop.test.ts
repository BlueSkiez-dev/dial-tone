import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { MESSAGE_ID_LEN } from "./budget";
import { newMessageId } from "./message-id";

// On failure fast-check's error message includes the seed and path.
// Replay with: fc.assert(property, { seed, path }).
const RUNS = { numRuns: 200 };

const badLength = fc
  .integer({ min: 0, max: 32 })
  .filter((n) => n !== MESSAGE_ID_LEN);

describe("Property 13: Message IDs", () => {
  /**
   * **Validates: Requirements 7.2**
   * An injected RNG that returns exactly 8 bytes yields those bytes.
   */
  test("injected RNG with 8 bytes is returned unchanged, as a copy", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: MESSAGE_ID_LEN, maxLength: MESSAGE_ID_LEN }),
        (bytes) => {
          const source = bytes.slice();
          let askedFor = -1;
          const result = newMessageId((n) => {
            askedFor = n;
            return source;
          });
          expect(askedFor).toBe(MESSAGE_ID_LEN);
          expect(result.ok).toBe(true);
          if (!result.ok) return;
          expect(Array.from(result.value)).toEqual(Array.from(bytes));
          // The result must not alias the RNG output.
          source.fill(0xaa);
          expect(Array.from(result.value)).toEqual(Array.from(bytes));
        },
      ),
      RUNS,
    );
  });

  /**
   * **Validates: Requirements 7.1, 7.6**
   * Any other length (0 to 32, excluding 8) gives BAD_RNG.
   */
  test("injected RNG with any length other than 8 gives BAD_RNG", () => {
    fc.assert(
      fc.property(
        badLength.chain((n) => fc.uint8Array({ minLength: n, maxLength: n })),
        (bytes) => {
          const result = newMessageId(() => bytes);
          expect(result.ok).toBe(false);
          if (result.ok) return;
          expect(result.error.code).toBe("BAD_RNG");
        },
      ),
      RUNS,
    );
  });

  /**
   * **Validates: Requirements 7.1, 7.3**
   * The default RNG always returns 8 bytes.
   */
  test("default RNG always returns 8 bytes", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const result = newMessageId();
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value).toBeInstanceOf(Uint8Array);
        expect(result.value.length).toBe(MESSAGE_ID_LEN);
      }),
      RUNS,
    );
  });

  /**
   * **Validates: Requirements 7.4**
   * Sanity check, not a statistical test: 1,000 calls give 1,000 distinct IDs.
   */
  test("1,000 default-RNG calls give 1,000 distinct IDs", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const result = newMessageId();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      seen.add(Buffer.from(result.value).toString("hex"));
    }
    expect(seen.size).toBe(1000);
  });
});
