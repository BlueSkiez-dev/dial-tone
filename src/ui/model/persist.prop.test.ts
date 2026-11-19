import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { utf8ByteLength } from "../../protocol/index";
import {
  createStore,
  parseSaved,
  type SavedState,
  type StorageLike,
  serialize,
} from "./persist";
import { SLIP_TEXT_MAX, type Slip, sanitizeText, TAPE_MAX } from "./tape";

const modeArb = fc.constantFrom("room", "call", "quiet" as const);
const idArb = fc.string({ minLength: 1, maxLength: 12 });
const atArb = fc.integer({ min: 0, max: 2_000_000_000_000 });
const textArb = fc
  .string({ maxLength: 80, unit: "grapheme" })
  .map((t) => sanitizeText(t));

const slipArb: fc.Arbitrary<Slip> = fc.oneof(
  fc
    .record({
      id: idArb,
      at: atArb,
      text: textArb,
      mode: modeArb,
      airtimeMs: fc.integer({ min: 0, max: 20000 }),
    })
    .map(
      (r): Slip => ({
        kind: "sent",
        ...r,
        mode: r.mode as "room" | "call" | "quiet",
        bytes: utf8ByteLength(r.text),
      }),
    ),
  fc
    .record({
      id: idArb,
      at: atArb,
      text: textArb,
      hop: fc.integer({ min: 0, max: 15 }),
    })
    .map((r): Slip => ({ kind: "heard", ...r, bytes: utf8ByteLength(r.text) })),
  fc
    .record({
      id: idArb,
      at: atArb,
      noticeKey: fc.constantFrom("unsupported", "mic-again" as const),
    })
    .map((r): Slip => ({ kind: "system", ...r })),
  fc
    .record({ id: idArb, at: atArb })
    .map((r): Slip => ({ kind: "update-ready", ...r })),
);

const stateArb: fc.Arbitrary<SavedState> = fc.record({
  tape: fc.array(slipArb, { maxLength: TAPE_MAX }),
  draft: textArb,
  channel: modeArb.map((m) => m as "room" | "call" | "quiet"),
  flags: fc.record({
    onboarded: fc.boolean(),
    micWasGranted: fc.boolean(),
    firstPowerShown: fc.boolean(),
  }),
});

const timer = {
  set: () => 1,
  clear: () => {},
};

describe("Property 8: Persistence", () => {
  /** **Validates: Requirements 16.1, 16.2, 16.3** */
  it("parseSaved(serialize(s)) equals s for valid states", () => {
    fc.assert(
      fc.property(stateArb, (s) => {
        expect(parseSaved(serialize(s))).toEqual(s);
      }),
    );
  });

  it("never throws on arbitrary strings and stays within the caps", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 200 }), (raw) => {
        const s = parseSaved(raw);
        if (s !== null) {
          expect(s.tape.length).toBeLessThanOrEqual(TAPE_MAX);
          expect(Array.from(s.draft).length).toBeLessThanOrEqual(SLIP_TEXT_MAX);
        }
      }),
    );
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        const s = parseSaved(JSON.stringify({ v: 1, tape: v, draft: v }));
        expect(s === null || s.tape.length <= TAPE_MAX).toBe(true);
      }),
    );
  });

  it("with persistence off, tape and draft are never written", () => {
    fc.assert(
      fc.property(stateArb, (s) => {
        const keys: string[] = [];
        const storage: StorageLike = {
          getItem: () => null,
          setItem: (k) => {
            keys.push(k);
          },
        };
        const store = createStore(storage, { timer, enabled: false });
        store.save(s);
        store.flush();
        expect(keys.some((k) => /tape|draft/.test(k))).toBe(false);
        expect(keys.some((k) => k.endsWith("flags"))).toBe(true);
      }),
    );
  });

  it("a throwing storage never throws out of the store", () => {
    fc.assert(
      fc.property(stateArb, fc.boolean(), (s, enabled) => {
        const storage: StorageLike = {
          getItem: () => {
            throw new Error("x");
          },
          setItem: () => {
            throw new Error("x");
          },
        };
        const store = createStore(storage, { timer, enabled });
        expect(() => {
          store.load();
          store.save(s);
          store.flush();
          store.load();
        }).not.toThrow();
      }),
    );
  });
});
