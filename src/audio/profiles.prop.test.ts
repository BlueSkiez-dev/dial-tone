import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  allRxProtocols,
  type ChannelProfile,
  PROFILES,
  protocolFor,
  rxProtocols,
  speedFor,
} from "./profiles";

const profiles: ChannelProfile[] = Object.values(PROFILES);
const profileArb = fc.constantFrom(...profiles);
const attemptArb = fc.oneof(
  fc.integer(),
  fc.double({ noNaN: false }),
  fc.constantFrom(
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    0,
    -0,
    1,
  ),
);
const FAMILY_BY_ID = { room: "AUDIBLE", call: "DT", quiet: "ULTRASOUND" };

function run(prop: () => fc.IPropertyWithHooks<unknown[]>) {
  fc.assert(prop() as never, { numRuns: 200, verbose: true });
}

describe("Property 9: profile speed and receive set", () => {
  /** **Validates: Requirements 1.2, 1.3, 1.4** */
  it("speedFor gives first speed for <=0 or non-integers, retry for integers >= 1, never NORMAL", () => {
    run(() =>
      fc.property(profileArb, attemptArb, (p, a) => {
        const s = speedFor(p, a);
        const expected =
          Number.isInteger(a) && a >= 1 ? p.retrySpeed : p.firstSpeed;
        expect(s).toBe(expected);
        expect(["FASTEST", "FAST"]).toContain(s);
        expect(protocolFor(p, a)).not.toContain("NORMAL");
      }),
    );
  });

  /** **Validates: Requirements 1.1** */
  it("each profile's family matches its mode", () => {
    run(() =>
      fc.property(profileArb, attemptArb, (p, a) => {
        expect(p.family).toBe(FAMILY_BY_ID[p.id]);
        expect(protocolFor(p, a).startsWith(`${p.family}_`)).toBe(true);
      }),
    );
  });

  /** **Validates: Requirements 1.5, 1.4** */
  it("allRxProtocols covers every sendable protocol, has no duplicates, nothing extra, no NORMAL", () => {
    const all = allRxProtocols();
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) expect(id).not.toContain("NORMAL");
    run(() =>
      fc.property(profileArb, attemptArb, (p, a) => {
        expect(all).toContain(protocolFor(p, a));
      }),
    );
    // Nothing that no profile can send.
    const sendable = new Set(
      profiles.flatMap((p) => [protocolFor(p, 0), protocolFor(p, 1)]),
    );
    for (const id of all) expect(sendable.has(id)).toBe(true);
  });

  /** **Validates: Requirements 1.5, 1.10** */
  it("rxProtocols(p) is a deduplicated subset of allRxProtocols()", () => {
    const all = allRxProtocols();
    run(() =>
      fc.property(profileArb, (p) => {
        const rx = rxProtocols(p);
        expect(new Set(rx).size).toBe(rx.length);
        for (const id of rx) expect(all).toContain(id);
      }),
    );
  });
});
