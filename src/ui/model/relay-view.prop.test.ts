import fc from "fast-check";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { Slip as SlipView } from "../components/Slip";
import { copy } from "../copy";
import { initialState, reduce } from "./reducer";
import { relayView, type SlipRelayView } from "./relay-view";
import type { NoticeKey, RelayMeta, Slip } from "./tape";

const SEED = Number(process.env.FC_SEED ?? Date.now());
const params = { numRuns: 500, seed: SEED, verbose: true };

const metaArb: fc.Arbitrary<RelayMeta> = fc.record({
  hop: fc.integer({ min: 0, max: 15 }),
  ttl: fc.integer({ min: 0, max: 15 }),
  multi: fc.boolean(),
  keyOffer: fc.boolean(),
});

const flagsArb = fc.record({
  relay: fc.option(metaArb, { nil: undefined }),
  passedOn: fc.option(fc.constant(true as const), { nil: undefined }),
});

const heardArb: fc.Arbitrary<Slip> = flagsArb.map(
  ({ relay, passedOn }): Slip => ({
    kind: "heard",
    id: "a:0",
    at: 1,
    text: "hi",
    bytes: 2,
    hop: relay?.hop ?? 0,
    ...(relay ? { relay } : {}),
    ...(passedOn ? { passedOn } : {}),
  }),
);

const unreadableArb: fc.Arbitrary<Slip> = flagsArb.map(
  ({ relay, passedOn }): Slip => ({
    kind: "system",
    id: "a:0",
    at: 1,
    noticeKey: "unreadable",
    ...(relay ? { relay } : {}),
    ...(passedOn ? { passedOn } : {}),
  }),
);

const otherNotices: NoticeKey[] = [
  "unsupported",
  "mic-again",
  "listening-open",
  "relay-failed",
];

const otherArb: fc.Arbitrary<Slip> = fc.oneof(
  fc.constantFrom(...otherNotices).chain((noticeKey) =>
    flagsArb.map(
      ({ relay, passedOn }): Slip => ({
        kind: "system",
        id: "s",
        at: 1,
        noticeKey,
        ...(relay ? { relay } : {}),
        ...(passedOn ? { passedOn } : {}),
      }),
    ),
  ),
  fc.constant<Slip>({ kind: "update-ready", id: "u", at: 1 }),
  fc.constant<Slip>({
    kind: "sent",
    id: "t",
    at: 1,
    text: "x",
    bytes: 1,
    mode: "room" as never,
    airtimeMs: 100,
  }),
);

/** Every reason line and the Passed on text, as rendered (HTML-escaped forms are identical). */
const REASON_LINES = [
  copy.relay.endNoHops,
  copy.relay.endHopLimit,
  copy.relay.endMulti,
  copy.relay.endKeyOffer,
  copy.relay.passedOn,
];

const ctxArb = fc.record({ held: fc.boolean(), canSendNow: fc.boolean() });

/** Independent oracle: the first matching row of the design table. */
function expected(
  slip: Slip,
  ctx: { held: boolean; canSendNow: boolean },
): SlipRelayView {
  if (slip.kind !== "heard" && slip.kind !== "system") return { kind: "none" };
  if (slip.kind === "system" && slip.noticeKey !== "unreadable")
    return { kind: "none" };
  const r = slip.relay;
  if (slip.passedOn === true) return { kind: "passed" };
  if (!r) return { kind: "none" };
  if (r.multi) return { kind: "reason", key: "multi" };
  if (r.keyOffer) return { kind: "reason", key: "key-offer" };
  if (r.ttl === 0) return { kind: "reason", key: "no-hops" };
  if (r.hop === 15) return { kind: "reason", key: "hop-limit" };
  if (!ctx.held) return { kind: "none" };
  return { kind: "action", hop: r.hop + 1, disabled: !ctx.canSendNow };
}

describe("relayView decision table (Property 14)", () => {
  it("matches the first-match decision table for Heard and unreadable slips", () => {
    // **Validates: Requirements 3.9, 4.2, 4.4, 4.5, 4.6, 4.7, 4.8, 4.10, 4.12, 4.14, 4.15, 4.17**
    fc.assert(
      fc.property(fc.oneof(heardArb, unreadableArb), ctxArb, (slip, ctx) => {
        const v = relayView(slip, ctx);
        expect(v).toEqual(expected(slip, ctx));
        if (v.kind === "none") {
          // The restart case: no action and no reason line (4.6).
          const html = renderToString(h(SlipView, { slip, relay: v }));
          expect(html).not.toContain("<button");
          expect(html).not.toContain("slip-note");
          for (const line of REASON_LINES) expect(html).not.toContain(line);
        }
      }),
      params,
    );
  });

  it("returns none for any other slip", () => {
    // **Validates: Requirements 4.12**
    fc.assert(
      fc.property(otherArb, ctxArb, (slip, ctx) => {
        expect(relayView(slip, ctx)).toEqual({ kind: "none" });
      }),
      params,
    );
  });

  it("offers the action only when relayable, and never with ttl 0 (4.15, 4.16)", () => {
    // **Validates: Requirements 4.15, 4.16**
    fc.assert(
      fc.property(fc.oneof(heardArb, unreadableArb), ctxArb, (slip, ctx) => {
        const v = relayView(slip, ctx);
        const r =
          slip.kind === "heard" || slip.kind === "system"
            ? slip.relay
            : undefined;
        if (v.kind === "action") {
          expect(r).toBeDefined();
          expect(r?.ttl).toBeGreaterThanOrEqual(1);
          expect(r?.hop).toBeLessThan(15);
          expect(r?.keyOffer).toBe(false);
          expect(r?.multi).toBe(false);
          expect(ctx.held).toBe(true);
        }
        if (r && r.ttl === 0 && !r.multi && !r.keyOffer) {
          const passed =
            (slip.kind === "heard" || slip.kind === "system") &&
            slip.passedOn === true;
          expect(v).toEqual(
            passed ? { kind: "passed" } : { kind: "reason", key: "no-hops" },
          );
        }
      }),
      params,
    );
  });
});

/** The "via" meta text a Heard slip shows, as Slip.tsx renders it. */
const viaText = (hop: number) => (hop > 0 ? copy.relay.via(hop) : "");

describe("hop text (Property 15)", () => {
  it("is empty at 0, 'via 1 hop' at 1 and 'via n hops' above 1", () => {
    // **Validates: Requirements 5.1, 5.2, 5.3**
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 15 }), (hop) => {
        const expectedText =
          hop === 0 ? "" : hop === 1 ? "via 1 hop" : `via ${hop} hops`;
        expect(viaText(hop)).toBe(expectedText);
      }),
      params,
    );
  });

  it("a pass-on leaves the hop of the slip unchanged (5.4)", () => {
    // **Validates: Requirements 5.4**
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 15 }),
        fc.integer({ min: 0, max: 15 }),
        (hop, ttl) => {
          const slip: Slip = {
            kind: "heard",
            id: "a:0",
            at: 1,
            text: "hi",
            bytes: 2,
            hop,
            relay: { hop, ttl, multi: false, keyOffer: false },
          };
          const s = reduce(initialState(null), { type: "slip", slip, now: 1 });
          const next = reduce(s, { type: "passed-on", id: slip.id });
          const after = next.tape.find((x) => x.id === slip.id);
          expect(after).toMatchObject({ kind: "heard", hop, passedOn: true });
          expect(viaText(hop)).toBe(
            viaText(after?.kind === "heard" ? after.hop : -1),
          );
        },
      ),
      params,
    );
  });
});
