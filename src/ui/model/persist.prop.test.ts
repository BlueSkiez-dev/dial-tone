import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { utf8ByteLength } from "../../protocol/index";
import {
  createStore,
  parseSaved,
  type SavedState,
  type StorageLike,
  serialize,
  storedSlip,
} from "./persist";
import { relayView } from "./relay-view";
import { SLIP_TEXT_MAX, type Slip, sanitizeText, TAPE_MAX } from "./tape";

const modeArb = fc.constantFrom("room", "call", "quiet" as const);
const idArb = fc.string({ minLength: 1, maxLength: 12 });
const atArb = fc.integer({ min: 0, max: 2_000_000_000_000 });
const textArb = fc
  .string({ maxLength: 80, unit: "grapheme" })
  .map((t) => sanitizeText(t));

const relayArb = fc.record({
  hop: fc.integer({ min: 0, max: 15 }),
  ttl: fc.integer({ min: 0, max: 15 }),
  multi: fc.boolean(),
  keyOffer: fc.boolean(),
});

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
      passedOn: fc.option(fc.constant(true as const), { nil: undefined }),
      relay: fc.option(relayArb, { nil: undefined }),
    })
    .map(
      (r): Slip => ({
        kind: "heard",
        ...r,
        bytes: utf8ByteLength(r.text),
      }),
    ),
  fc
    .record({
      id: idArb,
      at: atArb,
      noticeKey: fc.constantFrom(
        "unsupported",
        "mic-again",
        "listening-open",
        "unreadable",
        "relay-failed" as const,
      ),
      passedOn: fc.option(fc.constant(true as const), { nil: undefined }),
      relay: fc.option(relayArb, { nil: undefined }),
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

const relaySlipArb: fc.Arbitrary<Slip> = slipArb.filter(
  (s) => s.kind === "heard" || s.kind === "system",
);

describe("Property 18: passedOn survives a save and load, relay data does not", () => {
  /** **Validates: Requirements 3.10, 3.11, 4.17** */
  it("keeps passedOn exactly when it was true, drops relay, and shows passed", () => {
    fc.assert(
      fc.property(
        stateArb,
        fc.array(relaySlipArb, { maxLength: TAPE_MAX }),
        fc.boolean(),
        (base, tape, held) => {
          const loaded = parseSaved(serialize({ ...base, tape }));
          expect(loaded).not.toBeNull();
          const out = loaded?.tape ?? [];
          expect(out.length).toBe(tape.length);
          tape.forEach((orig, i) => {
            const got = out[i];
            if (
              got === undefined ||
              (orig.kind !== "heard" && orig.kind !== "system") ||
              (got.kind !== "heard" && got.kind !== "system")
            ) {
              throw new Error("unexpected slip kind");
            }
            expect(got.passedOn === true).toBe(orig.passedOn === true);
            expect("relay" in got).toBe(false);
            const relayable =
              got.kind === "heard" || got.noticeKey === "unreadable";
            if (orig.passedOn === true && relayable) {
              expect(relayView(got, { held, canSendNow: true }).kind).toBe(
                "passed",
              );
            }
          });
        },
      ),
      { verbose: true },
    );
  });

  /** **Validates: Requirements 3.10, 4.17** */
  it("treats a stored passedOn that is not boolean true as absent without dropping the slip", () => {
    const badArb = fc.oneof(
      fc.string(),
      fc.integer(),
      fc.constant(false),
      fc.constant(null),
      fc.constant("true"),
      fc.constant(1),
    );
    fc.assert(
      fc.property(relaySlipArb, badArb, (slip, bad) => {
        const raw = JSON.stringify({
          v: 1,
          tape: [{ ...storedSlip(slip), passedOn: bad }],
        });
        const loaded = parseSaved(raw);
        expect(loaded?.tape.length).toBe(1);
        const got = loaded?.tape[0];
        expect(got).toBeDefined();
        expect(got !== undefined && "passedOn" in got).toBe(false);
      }),
      { verbose: true },
    );
  });
});

describe("Property 8: Persistence", () => {
  /** **Validates: Requirements 16.1, 16.2, 16.3** */
  it("parseSaved(serialize(s)) equals the stored shape of s", () => {
    fc.assert(
      fc.property(stateArb, (s) => {
        expect(parseSaved(serialize(s))).toEqual({
          ...s,
          tape: s.tape.map(storedSlip),
        });
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
