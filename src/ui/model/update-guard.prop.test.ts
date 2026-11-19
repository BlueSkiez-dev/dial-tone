import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { UiState } from "./reducer";
import { canRestartNow } from "./update-guard";

type Guarded = Pick<UiState, "tx" | "connectUntil" | "carrier">;

const guarded: fc.Arbitrary<Guarded> = fc.record({
  tx: fc.record({
    phase: fc.constantFrom("idle" as const, "sending" as const),
    startedAt: fc.integer({ min: 0, max: 1_000_000 }),
    airtimeMs: fc.option(fc.integer({ min: 0, max: 20_000 }), { nil: null }),
  }),
  connectUntil: fc.integer({ min: 0, max: 1_000_000 }),
  carrier: fc.record({
    active: fc.boolean(),
    shownUntil: fc.integer({ min: 0, max: 1_000_000 }),
    lastOffAt: fc.option(fc.integer({ min: 0, max: 1_000_000 }), { nil: null }),
  }),
});
const clock = fc.integer({ min: 0, max: 1_000_000 });

describe("Property 13: Update guard", () => {
  /** **Validates: Requirements 2.7** */
  it("is false when sending, holding a connect or carrier active; true otherwise", () => {
    fc.assert(
      fc.property(guarded, clock, (s, now) => {
        const busy =
          s.tx.phase === "sending" || now < s.connectUntil || s.carrier.active;
        return canRestartNow(s, now) === !busy;
      }),
    );
  });
});

describe("canRestartNow examples", () => {
  const idle: Guarded = {
    tx: { phase: "idle", startedAt: 0, airtimeMs: null },
    connectUntil: 100,
    carrier: { active: false, shownUntil: 0, lastOffAt: null },
  };

  it("allows restart when idle and the connect hold has ended", () => {
    expect(canRestartNow(idle, 100)).toBe(true);
  });

  it("blocks during a connect hold", () => {
    expect(canRestartNow(idle, 99)).toBe(false);
  });

  it("blocks while sending", () => {
    const s = { ...idle, tx: { ...idle.tx, phase: "sending" as const } };
    expect(canRestartNow(s, 500)).toBe(false);
  });

  it("blocks while a carrier is active", () => {
    const s = { ...idle, carrier: { ...idle.carrier, active: true } };
    expect(canRestartNow(s, 500)).toBe(false);
  });
});
