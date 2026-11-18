import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { createOwnEcho, OWN_ECHO_RING, OWN_ECHO_WINDOW_MS } from "./own-echo";

// On failure fast-check's error message includes the seed and path.
const RUNS = { numRuns: 200, verbose: true };

const RATE = 48_000;
const WINDOW = (OWN_ECHO_WINDOW_MS / 1000) * RATE;

const wire = fc.uint8Array({ minLength: 1, maxLength: 140 });
const start = fc.integer({ min: 0, max: 10_000_000 });

describe("Property 7: Own-echo flag is exact", () => {
  /** **Validates: Requirements 7.4, 7.5** */
  test("equal payload inside the window is an echo", () => {
    fc.assert(
      fc.property(
        wire,
        start,
        fc.integer({ min: 0, max: WINDOW }),
        (w, s, d) => {
          const echo = createOwnEcho(RATE);
          echo.note(w, s);
          expect(echo.isEcho(w.slice(), s + d)).toBe(true);
        },
      ),
      RUNS,
    );
  });

  /** **Validates: Requirements 7.4, 7.5** */
  test("payload with one changed byte is not an echo", () => {
    fc.assert(
      fc.property(
        wire,
        start,
        fc.nat(),
        fc.integer({ min: 1, max: 255 }),
        (w, s, idx, xor) => {
          const echo = createOwnEcho(RATE);
          echo.note(w, s);
          const changed = w.slice();
          const i = idx % changed.length;
          changed[i] = (changed[i] ?? 0) ^ xor;
          expect(echo.isEcho(changed, s + 1)).toBe(false);
        },
      ),
      RUNS,
    );
  });

  /** **Validates: Requirements 7.4, 7.5** */
  test("equal payload outside the window is not an echo", () => {
    fc.assert(
      fc.property(
        wire,
        start,
        fc.integer({ min: 1, max: 1_000_000 }),
        (w, s, extra) => {
          const echo = createOwnEcho(RATE);
          echo.note(w, s);
          expect(echo.isEcho(w, s + WINDOW + extra)).toBe(false);
        },
      ),
      RUNS,
    );
  });

  /** **Validates: Requirements 7.4** */
  test("only the last OWN_ECHO_RING wires are remembered", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: OWN_ECHO_RING + 1, max: 20 }),
        start,
        (n, s) => {
          const echo = createOwnEcho(RATE);
          // Distinct wires: the index is the payload.
          const wires = Array.from(
            { length: n },
            (_, i) => new Uint8Array([i, 7]),
          );
          for (const w of wires) echo.note(w, s);
          wires.forEach((w, i) => {
            expect(echo.isEcho(w, s + 1)).toBe(i >= n - OWN_ECHO_RING);
          });
        },
      ),
      RUNS,
    );
  });

  /** **Validates: Requirements 7.4** */
  test("isEcho does not modify its argument, and later changes to the noted array do not matter", () => {
    fc.assert(
      fc.property(wire, start, (w, s) => {
        const echo = createOwnEcho(RATE);
        const sent = w.slice();
        echo.note(sent, s);
        sent.fill(0xff ^ (sent[0] ?? 0)); // mutate the caller's array after note
        const probe = w.slice();
        const before = probe.slice();
        expect(echo.isEcho(probe, s + 1)).toBe(true);
        expect(probe).toEqual(before);
      }),
      RUNS,
    );
  });
});
