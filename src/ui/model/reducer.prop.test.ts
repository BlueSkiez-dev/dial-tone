import fc from "fast-check";
import { describe, it } from "vitest";
import type { MicState, ProfileId } from "../../audio/index";
import { initialState, reduce, type SheetId, type UiEvent } from "./reducer";
import type { Slip } from "./tape";

const mics: readonly MicState[] = [
  "idle",
  "requesting",
  "live",
  "muted",
  "lost",
  "denied",
  "no_device",
  "busy",
  "insecure",
  "error",
];
const channels: readonly ProfileId[] = ["room", "call", "quiet"];
const sheets: readonly SheetId[] = [
  "onboarding-1",
  "onboarding-2",
  "onboarding-3",
  "mic-denied",
  "mic-reset",
  "mic-error",
  "install",
];

const now = fc.integer({ min: 0, max: 100_000 });
const mic = fc.constantFrom(...mics);
const channel = fc.constantFrom(...channels);
const slip: fc.Arbitrary<Slip> = fc.oneof(
  fc.record({
    kind: fc.constant("heard" as const),
    id: fc.string({ minLength: 1, maxLength: 6 }),
    at: now,
    text: fc.string({ maxLength: 20 }),
    bytes: fc.nat(100),
    hop: fc.integer({ min: 0, max: 15 }),
  }),
  fc.record({
    kind: fc.constant("system" as const),
    id: fc.string({ minLength: 1, maxLength: 6 }),
    at: now,
    noticeKey: fc.constantFrom("unsupported" as const, "mic-again" as const),
  }),
);

const event: fc.Arbitrary<UiEvent> = fc.oneof(
  fc.record({ type: fc.constant("power-tap" as const), now }),
  fc.record({ type: fc.constant("started" as const), now, mic }),
  fc.record({
    type: fc.constant("start-failed" as const),
    code: fc.constantFrom(
      "MODEM_LOAD_FAILED" as const,
      "NO_AUDIO_CONTEXT" as const,
      "SEND_UNAVAILABLE" as const,
    ),
  }),
  fc.record({ type: fc.constant("send-busy" as const), now }),
  fc.record({ type: fc.constant("self-test-done" as const), now }),
  fc.record({ type: fc.constant("mic" as const), mic }),
  fc.constant({ type: "latch-tap" as const }),
  fc.record({ type: fc.constant("channel" as const), channel }),
  fc.record({
    type: fc.constant("draft" as const),
    text: fc.string({ maxLength: 20 }),
  }),
  fc.record({ type: fc.constant("transmit" as const), now }),
  fc.record({
    type: fc.constant("tx-start" as const),
    now,
    airtimeMs: fc.integer({ min: 0, max: 20_000 }),
  }),
  fc.record({
    type: fc.constant("tx-end" as const),
    now,
    ok: fc.boolean(),
    slip: fc.option(slip, { nil: null }),
  }),
  fc.record({
    type: fc.constant("airtime" as const),
    wireLength: fc.integer({ min: 1, max: 140 }),
    ms: fc.integer({ min: 0, max: 20_000 }),
    channel,
  }),
  fc.record({
    type: fc.constant("carrier" as const),
    active: fc.boolean(),
    now,
  }),
  fc.record({ type: fc.constant("slip" as const), slip, now }),
  fc.constant({ type: "tape-toggle" as const }),
  fc.constant({ type: "legend-toggle" as const }),
  fc.record({
    type: fc.constant("sheet-open" as const),
    sheet: fc.constantFrom(...sheets),
  }),
  fc.constant({ type: "sheet-close" as const }),
  fc.constant({ type: "onboarding-next" as const }),
  fc.constant({ type: "onboarding-skip" as const }),
  fc.constant({ type: "onboarding-done" as const }),
  fc.record({
    type: fc.constant("foreground" as const),
    visible: fc.boolean(),
  }),
  fc.record({
    type: fc.constant("install-available" as const),
    available: fc.boolean(),
  }),
  fc.constant({ type: "update-ready" as const }),
);

function deepFreeze<T>(v: T): T {
  if (typeof v === "object" && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v))
      deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}

describe("Property 4: Reducer invariants", () => {
  /** **Validates: Requirements 8.1, 8.2, 10.4, 11.1** */
  it("never throws or mutates, and keeps the power, latch and channel rules", () => {
    fc.assert(
      fc.property(fc.array(event, { maxLength: 60 }), (events) => {
        let s = deepFreeze(initialState(null));
        for (const e of events) {
          const before = s;
          // Strict mode: any write to a frozen state throws.
          const after = deepFreeze(reduce(before, deepFreeze({ ...e })));
          if (before.power !== "on" && after.power === "on") {
            if (before.power !== "selftest" || e.type !== "self-test-done") {
              return false;
            }
          }
          if (after.tx.phase === "sending" && after.power !== "on")
            return false;
          if (
            e.type === "latch-tap" &&
            !(before.power === "on" && before.mic === "live") &&
            after !== before
          ) {
            return false;
          }
          if (
            e.type === "channel" &&
            before.tx.phase === "sending" &&
            after.channel !== before.channel
          ) {
            return false;
          }
          s = after;
        }
        return true;
      }),
    );
  });
});
