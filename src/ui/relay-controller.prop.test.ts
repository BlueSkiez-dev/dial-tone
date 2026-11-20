import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProfileId } from "../audio";
import {
  decodeFrame,
  encodeFrame,
  type Frame,
  type MessageType,
  patchRouting,
  relayWire,
  TAG_LEN,
  utf8ByteLength,
} from "../protocol";
import { type Clock, createController } from "./controller";
import { createFakeTransport } from "./fake-transport";
import { wellLimit } from "./model/meter";
import type { UiTransport } from "./transport-seam";

// Print the seed and path on failure so CI failures can be replayed.
const PARAMS = { verbose: true, numRuns: 25 } as const;

const KEY_OFFER = 4;
const FLAGS_KEY = "dialtone.v1.flags";

function manualClock(): Clock & { advance(ms: number): void } {
  let t = 1000;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => t,
    set(fn, ms) {
      const id = nextId++;
      timers.set(id, { at: t + ms, fn });
      return id;
    },
    clear(h) {
      timers.delete(h as number);
    },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, v]) => v.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        t = Math.max(t, due[1].at);
        due[1].fn();
      }
      t = end;
    },
  };
}

const settle = () => new Promise<void>((r) => setTimeout(r, 15));

/** Send result forced by a test instead of the fake's own `send`. */
type ForcedSend = "busy" | "modem-failed" | "throws";

/**
 * Controller on a fake transport whose `send` calls are recorded. With
 * `forced`, `send` records the wire and returns that outcome without sending.
 */
async function setup(forced?: ForcedSend) {
  const fake = createFakeTransport({ startDelayMs: 0 });
  const sent: Uint8Array[] = [];
  const counting: UiTransport = {
    ...fake,
    send: (wire) => {
      sent.push(wire);
      if (forced === "busy") {
        return Promise.resolve({ ok: false, error: { code: "BUSY" } });
      }
      if (forced === "modem-failed") {
        return Promise.resolve({
          ok: false,
          error: { code: "MODEM_FAILED" },
        });
      }
      if (forced === "throws") return Promise.reject(new Error("send"));
      return fake.send(wire);
    },
  };
  const clock = manualClock();
  const writes: [string, string][] = [];
  const data = new Map<string, string>([
    [
      FLAGS_KEY,
      JSON.stringify({
        onboarded: true,
        micWasGranted: false,
        firstPowerShown: true,
      }),
    ],
  ]);
  const c = createController({
    transport: counting,
    storage: {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => {
        writes.push([k, v]);
        data.set(k, v);
      },
    },
    clock,
    vibrate: null,
  });
  c.powerTap();
  await settle();
  clock.advance(600);
  await settle();
  // A valid draft keeps the Transmit state "default", which passOn also needs.
  c.setDraft("x");
  return { c, fake, sent, writes };
}

interface FrameSpec {
  readonly type: number;
  readonly encrypted: boolean;
  readonly total: number;
  readonly hop: number;
  readonly ttl: number;
  readonly body: Uint8Array;
}

const specArb = (types: readonly number[]): fc.Arbitrary<FrameSpec> =>
  fc.record({
    type: fc.constantFrom(...types),
    encrypted: fc.boolean(),
    total: fc.integer({ min: 1, max: 4 }),
    hop: fc.integer({ min: 0, max: 15 }),
    ttl: fc.integer({ min: 0, max: 15 }),
    body: fc
      .array(fc.integer({ min: 0x20, max: 0x7e }), {
        minLength: TAG_LEN,
        maxLength: 40,
      })
      .map((a) => Uint8Array.from(a)),
  });

/** Builds a Frame with a distinct message id per position. */
function toFrame(s: FrameSpec, n: number): Frame {
  const keyOffer = s.type === KEY_OFFER;
  const total = keyOffer ? 1 : s.total;
  const messageId = new Uint8Array(8);
  messageId[0] = n + 1;
  messageId[7] = 0xa5;
  return {
    header: {
      version: 1,
      type: s.type as MessageType,
      encrypted: keyOffer ? false : s.encrypted,
      hop: s.hop,
      ttl: s.ttl,
      messageId,
      index: 0,
      total,
    },
    body: s.body,
  };
}

const ANY_TYPES = [0, 1, 2, 3, 4, 5] as const;

describe("Property 17: Held wires never outlive their slip", () => {
  /**
   * **Validates: Requirements 8.4**
   */
  it("after more than 50 relayable frames, a wire is held iff its slip is on the tape", async () => {
    const relayable = specArb([0, 1, 2, 3]).map(
      (s): FrameSpec => ({
        ...s,
        total: 1,
        hop: Math.min(s.hop, 14),
        ttl: Math.max(s.ttl, 1),
      }),
    );
    await fc.assert(
      fc.asyncProperty(
        fc.array(relayable, { minLength: 51, maxLength: 70 }),
        async (specs) => {
          const { c, fake } = await setup();
          const everSeen = new Set<string>();
          specs.forEach((s, n) => {
            fake.injectFrame(toFrame(s, n), false);
            for (const slip of c.getState().tape) everSeen.add(slip.id);
          });
          const onTape = new Set(c.getState().tape.map((s) => s.id));
          expect(onTape.size).toBeLessThanOrEqual(50);
          for (const id of everSeen) {
            expect(c.holdsWire(id)).toBe(onTape.has(id));
          }
          const heldCount = [...everSeen].filter((id) =>
            c.holdsWire(id),
          ).length;
          expect(heldCount).toBeLessThanOrEqual(50);
          c.dispose();
        },
      ),
      PARAMS,
    );
  }, 60000);
});

describe("Property 16: Hearing never sends, a tap sends once, KEY_OFFER never sends", () => {
  /**
   * **Validates: Requirements 6.1, 6.2**
   */
  it("hearing frames of any type, hop and ttl makes no send call", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(specArb(ANY_TYPES), { minLength: 1, maxLength: 8 }),
        async (specs) => {
          const { c, fake, sent } = await setup();
          specs.forEach((s, n) => {
            fake.injectFrame(toFrame(s, n), false);
          });
          await settle();
          expect(sent).toHaveLength(0);
          c.dispose();
        },
      ),
      PARAMS,
    );
  }, 60000);

  /**
   * **Validates: Requirements 6.1, 6.4**
   */
  it("one tap on a relayable held slip sends exactly relayWire(heldWire) once", async () => {
    const relayable = specArb([0, 1, 2, 3]).map(
      (s): FrameSpec => ({
        ...s,
        total: 1,
        hop: Math.min(s.hop, 14),
        ttl: Math.max(s.ttl, 1),
      }),
    );
    await fc.assert(
      fc.asyncProperty(
        relayable,
        fc.integer({ min: 1, max: 4 }),
        async (spec, taps) => {
          const { c, fake, sent } = await setup();
          const frame = toFrame(spec, 0);
          const wire = encodeFrame(frame);
          if (!wire.ok) throw new Error("encode");
          const expected = relayWire(wire.value);
          if (!expected.ok) throw new Error("relayWire");
          fake.injectFrame(frame, false);
          const held = c.getState().tape.filter((s) => c.holdsWire(s.id));
          expect(held).toHaveLength(1);
          const id = held[0]?.id ?? "";
          expect(sent).toHaveLength(0);
          for (let i = 0; i < taps; i++) c.passOn(id);
          await settle();
          expect(sent).toHaveLength(1);
          expect(Array.from(sent[0] ?? [])).toEqual(Array.from(expected.value));
          c.dispose();
        },
      ),
      PARAMS,
    );
  }, 60000);

  /**
   * **Validates: Requirements 6.9**
   */
  it("a heard KEY_OFFER never sends, however often it is tapped", async () => {
    await fc.assert(
      fc.asyncProperty(
        specArb([KEY_OFFER]),
        fc.integer({ min: 1, max: 5 }),
        async (spec, taps) => {
          const { c, fake, sent } = await setup();
          fake.injectFrame(toFrame(spec, 0), false);
          for (const slip of c.getState().tape) {
            expect(c.holdsWire(slip.id)).toBe(false);
            for (let i = 0; i < taps; i++) c.passOn(slip.id);
          }
          await settle();
          expect(sent).toHaveLength(0);
          c.dispose();
        },
      ),
      PARAMS,
    );
  }, 60000);
});

describe("Property 19: No wire or key list is ever stored", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * **Validates: Requirements 3.8, 3.11, 9.15**
   */
  it("hearing and passing on writes no wire bytes, no key list, and no other storage API is touched", async () => {
    const relayable = specArb([0, 1, 2, 3]).map(
      (s): FrameSpec => ({
        ...s,
        total: 1,
        hop: Math.min(s.hop, 14),
        ttl: Math.max(s.ttl, 1),
      }),
    );
    const calls: string[] = [];
    const trap = (name: string) =>
      new Proxy(
        {},
        {
          get: (_t, p) => {
            calls.push(`${name}.${String(p)}`);
            return () => undefined;
          },
        },
      );
    vi.stubGlobal("localStorage", trap("localStorage"));
    vi.stubGlobal("indexedDB", trap("indexedDB"));
    vi.stubGlobal("caches", trap("caches"));

    const ALLOWED = [
      "dialtone.v1.tape",
      "dialtone.v1.draft",
      "dialtone.v1.channel",
      "dialtone.v1.flags",
    ];
    await fc.assert(
      fc.asyncProperty(
        fc.array(relayable, { minLength: 1, maxLength: 6 }),
        async (specs) => {
          const { c, fake, writes } = await setup();
          const wires: Uint8Array[] = [];
          specs.forEach((s, n) => {
            const frame = toFrame(s, n);
            const w = encodeFrame(frame);
            if (!w.ok) throw new Error("encode");
            wires.push(w.value);
            fake.injectFrame(frame, false);
          });
          for (const slip of c.getState().tape) {
            c.passOn(slip.id);
            await settle();
          }
          const ids = c.getState().tape.map((s) => s.id);
          expect(writes.length).toBeGreaterThan(0);
          for (const [k, v] of writes) {
            expect(ALLOWED).toContain(k);
            // No byte array in JSON form, and no wire as hex or base64.
            for (const w of wires) {
              expect(v).not.toContain(JSON.stringify(Array.from(w)));
              expect(v).not.toContain(Buffer.from(w).toString("hex"));
              expect(v).not.toContain(Buffer.from(w).toString("base64"));
            }
            const parsed: unknown = JSON.parse(v);
            if (k.endsWith(".tape")) {
              for (const slip of parsed as Record<string, unknown>[]) {
                expect(slip).not.toHaveProperty("relay");
                expect(slip).not.toHaveProperty("wire");
                expect(slip).not.toHaveProperty("seen");
                if ("passedOn" in slip) expect(slip.passedOn).toBe(true);
              }
            } else {
              // A Message_Key list belongs nowhere but the (id-only) tape.
              for (const id of ids) expect(v).not.toContain(id);
            }
          }
          c.dispose();
        },
      ),
      PARAMS,
    );
    expect(calls).toEqual([]);
  }, 60000);
});

describe("Property 20: A sender ignores passed-on copies of its own message", () => {
  const LIMIT = wellLimit();
  // Mixed 1-, 2-, 3- and 4-byte UTF-8 so bytes and characters differ.
  const textArb = fc
    .array(fc.constantFrom("a", "Z", "5", " ", ".", "é", "ß", "✓", "→", "😀"), {
      maxLength: 30,
    })
    .map((cs) => `m${cs.join("")}`)
    .filter((t) => utf8ByteLength(t) <= LIMIT);
  const channelArb = fc.constantFrom<ProfileId>("room", "call", "quiet");

  type CopyWay =
    | { readonly way: "patch"; readonly hop: number; readonly ttl: number }
    | { readonly way: "relay"; readonly passes: number };
  const copyArb: fc.Arbitrary<CopyWay> = fc.oneof(
    fc.record({
      way: fc.constant("patch" as const),
      hop: fc.integer({ min: 0, max: 15 }),
      ttl: fc.integer({ min: 0, max: 15 }),
    }),
    fc.record({
      way: fc.constant("relay" as const),
      passes: fc.integer({ min: 1, max: 4 }),
    }),
  );

  /** A copy of `wire` as another phone would pass it on, or null if refused. */
  function copyOf(wire: Uint8Array, c: CopyWay): Frame | null {
    let out = wire;
    if (c.way === "patch") {
      const p = patchRouting(wire, c.hop, c.ttl);
      if (!p.ok) throw new Error(`patchRouting ${p.error.code}`);
      out = p.value;
    } else {
      for (let i = 0; i < c.passes; i++) {
        const r = relayWire(out);
        if (!r.ok) break; // TTL or hop ran out: the last copy stays
        out = r.value;
      }
    }
    const d = decodeFrame(out);
    if (!d.ok) throw new Error(`decodeFrame ${d.error.code}`);
    return d.value;
  }

  const heardCount = (tape: readonly { kind: string }[]): number =>
    tape.filter((s) => s.kind === "heard").length;

  /**
   * **Validates: Requirements 3.1, 3.2, 3.5, 3.12, 9.20**
   */
  it("after an ok transmit, copies with any hop and ttl and ownEcho false print no slip", async () => {
    await fc.assert(
      fc.asyncProperty(
        textArb,
        channelArb,
        fc.array(copyArb, { minLength: 1, maxLength: 4 }),
        async (text, channel, copies) => {
          const { c, fake, sent } = await setup();
          c.setChannel(channel);
          c.setDraft(text);
          c.transmit();
          await settle();
          expect(sent).toHaveLength(1);
          const wire = sent[0] ?? new Uint8Array();
          const tapeAfterSend = c.getState().tape;
          expect(tapeAfterSend.filter((s) => s.kind === "sent")).toHaveLength(
            1,
          );
          for (const copy of copies) {
            const frame = copyOf(wire, copy);
            if (frame) fake.injectFrame(frame, false);
            // No slip is added, by this copy or any earlier one.
            expect(c.getState().tape).toBe(tapeAfterSend);
          }
          // The dedupe is for this message only: a different message still prints.
          const other = toFrame(
            {
              type: 0,
              encrypted: false,
              total: 1,
              hop: 0,
              ttl: 3,
              body: Uint8Array.from([0x68, 0x69]),
            },
            0,
          );
          fake.injectFrame(other, false);
          expect(heardCount(c.getState().tape)).toBe(1);
          expect(sent).toHaveLength(1);
          c.dispose();
        },
      ),
      PARAMS,
    );
  }, 60000);

  /**
   * **Validates: Requirements 3.12, 9.20**
   */
  it("after a BUSY or failed transmit, no key is recorded, so a copy prints as heard", async () => {
    await fc.assert(
      fc.asyncProperty(
        textArb,
        channelArb,
        fc.constantFrom<ForcedSend>("busy", "modem-failed", "throws"),
        copyArb,
        async (text, channel, forced, copy) => {
          const { c, fake, sent } = await setup(forced);
          c.setChannel(channel);
          c.setDraft(text);
          const heardBefore = heardCount(c.getState().tape);
          c.transmit();
          await settle();
          expect(sent).toHaveLength(1);
          const wire = sent[0] ?? new Uint8Array();
          expect(c.getState().tape.some((s) => s.kind === "sent")).toBe(false);
          // Seen was empty before the send. If the send had recorded the key,
          // this copy would be dropped as a duplicate.
          const frame = copyOf(wire, copy);
          if (frame === null) throw new Error("copy");
          fake.injectFrame(frame, false);
          expect(heardCount(c.getState().tape)).toBe(heardBefore + 1);
          c.dispose();
        },
      ),
      PARAMS,
    );
  }, 60000);
});
