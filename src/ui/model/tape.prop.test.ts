import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  pushSlip,
  type Slip,
  TAPE_COLLAPSED,
  TAPE_MAX,
  visibleSlips,
} from "./tape";

const slipArb = (i: number): Slip => ({
  kind: "update-ready",
  id: `s${i}`,
  at: i,
});

const lengthArb = fc.integer({ min: 0, max: TAPE_MAX * 2 });

function build(n: number): readonly Slip[] {
  let tape: readonly Slip[] = [];
  for (let i = 0; i < n; i++) tape = pushSlip(tape, slipArb(i));
  return tape;
}

describe("Property 7: Tape", () => {
  /** **Validates: Requirements 7.10, 7.11** */
  it("holds at most TAPE_MAX slips and keeps the newest in order", () => {
    fc.assert(
      fc.property(lengthArb, (n) => {
        const tape = build(n);
        expect(tape.length).toBe(Math.min(n, TAPE_MAX));
        if (n > 0) expect(tape[tape.length - 1]?.id).toBe(`s${n - 1}`);
        const ats = tape.map((s) => s.at);
        expect(ats).toEqual([...ats].sort((a, b) => a - b));
      }),
    );
  });

  it("collapsed shows the latest 3 newest first, expanded shows all", () => {
    fc.assert(
      fc.property(lengthArb, (n) => {
        const tape = build(n);
        const c = visibleSlips(tape, false);
        expect(c.slips).toEqual(tape.slice(-TAPE_COLLAPSED).reverse());
        expect(c.hidden).toBe(Math.max(0, tape.length - 3));
        const e = visibleSlips(tape, true);
        expect(e.slips).toEqual([...tape].reverse());
        expect(e.hidden).toBe(0);
      }),
    );
  });

  it("does not mutate its input", () => {
    const tape = Object.freeze(build(5));
    expect(() => {
      pushSlip(tape, slipArb(9));
      visibleSlips(tape, true);
    }).not.toThrow();
  });
});
