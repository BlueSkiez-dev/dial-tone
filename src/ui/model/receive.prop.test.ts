import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Frame } from "../../protocol/index";
import {
  canRelay,
  frameKey,
  hasSeen,
  makeFrames,
  splitPayload,
} from "../../protocol/index";
import {
  EMPTY_RECEIVE,
  PARTIAL_MAX,
  type ReceiveState,
  receiveFrame,
  SEEN_MAX,
} from "./receive";
import type { Slip } from "./tape";

const enc = new TextEncoder();

const idArb = fc.uint8Array({ minLength: 8, maxLength: 8 });
const textArb = fc.string({ minLength: 1, maxLength: 40, unit: "grapheme" });
// Printable text, so sanitizeText leaves it unchanged.
const printable = fc.stringMatching(/^[\x20-\x7e]{1,40}$/);

function single(
  id: Uint8Array,
  text: string,
  opts: { type?: number; encrypted?: boolean; hop?: number } = {},
): Frame {
  // A KEY_OFFER body starts with a 16-byte group key, so pad short text.
  const payload = opts.type === 4 ? text.padEnd(16, "k") : text;
  const bodies = splitPayload(enc.encode(payload), {
    encrypted: false,
    utf8Boundaries: true,
  });
  if (!bodies.ok) throw new Error("split failed");
  const body =
    opts.encrypted === true
      ? new Uint8Array([
          ...(bodies.value[0] as Uint8Array),
          ...new Array(16).fill(1),
        ])
      : (bodies.value[0] as Uint8Array);
  const made = makeFrames(
    {
      type: (opts.type ?? 0) as 0,
      encrypted: opts.encrypted ?? false,
      hop: opts.hop ?? 0,
      ttl: 3,
      messageId: id,
    },
    [body],
  );
  if (!made.ok) throw new Error(`makeFrames ${made.error.code}`);
  return made.value[0] as Frame;
}

function multi(id: Uint8Array, parts: string[]): Frame[] {
  const made = makeFrames(
    { type: 0, encrypted: false, hop: 1, ttl: 3, messageId: id },
    parts.map((p) => enc.encode(p)),
  );
  if (!made.ok) throw new Error(`makeFrames ${made.error.code}`);
  return made.value;
}

function feed(
  frames: readonly Frame[],
  rs: ReceiveState = EMPTY_RECEIVE,
): { rs: ReceiveState; slips: Slip[] } {
  const slips: Slip[] = [];
  let cur = rs;
  frames.forEach((frame, i) => {
    const r = receiveFrame(cur, { frame, ownEcho: false, atMs: i });
    cur = r.next;
    if (r.slip) slips.push(r.slip);
  });
  return { rs: cur, slips };
}

describe("Property 6: Receive path", () => {
  /** **Validates: Requirements 7.1, 7.2, 7.3, 7.5, 7.6, 7.13** */
  it("ownEcho never yields a slip and never changes seen", () => {
    fc.assert(
      fc.property(idArb, printable, (id, text) => {
        const frame = single(id, text);
        const r = receiveFrame(EMPTY_RECEIVE, {
          frame,
          ownEcho: true,
          atMs: 1,
        });
        expect(r.slip).toBeNull();
        expect(r.next.seen).toEqual([]);
        // The same frame heard later is still new.
        const later = receiveFrame(r.next, { frame, ownEcho: false, atMs: 2 });
        expect(later.slip).not.toBeNull();
      }),
    );
  });

  it("a repeated frameKey never yields a second slip", () => {
    fc.assert(
      fc.property(
        idArb,
        printable,
        fc.integer({ min: 1, max: 4 }),
        (id, text, n) => {
          const frame = single(id, text);
          const { slips } = feed(Array.from({ length: n + 1 }, () => frame));
          expect(slips).toHaveLength(1);
        },
      ),
    );
  });

  it("a TEXT single frame yields one heard slip with the decoded text and hop", () => {
    fc.assert(
      fc.property(
        idArb,
        printable,
        fc.integer({ min: 0, max: 15 }),
        (id, text, hop) => {
          const { slips } = feed([single(id, text, { hop })]);
          expect(slips).toHaveLength(1);
          const s = slips[0] as Slip;
          expect(s.kind).toBe("heard");
          if (s.kind === "heard") {
            expect(s.text).toBe(text);
            expect(s.hop).toBe(hop);
            expect(s.bytes).toBe(enc.encode(text).length);
          }
        },
      ),
    );
  });

  it("single-frame non-TEXT or encrypted frames yield an unreadable system slip with relay meta", () => {
    /** **Validates: Requirements 3.1, 4.1, 4.3, 4.13, 4.14** */
    fc.assert(
      fc.property(
        idArb,
        printable,
        fc.constantFrom("sos", "safe", "enc", "key"),
        fc.integer({ min: 0, max: 15 }),
        (id, text, which, hop) => {
          const frame =
            which === "enc"
              ? single(id, text, { encrypted: true, hop })
              : single(id, text, {
                  type: which === "sos" ? 3 : which === "safe" ? 2 : 4,
                  hop,
                });
          const r = receiveFrame(EMPTY_RECEIVE, {
            frame,
            ownEcho: false,
            atMs: 0,
          });
          const s = r.slip as Slip;
          expect(s.kind).toBe("system");
          if (s.kind === "system") {
            expect(s.noticeKey).toBe("unreadable");
            expect(s.relay).toEqual({
              hop,
              ttl: 3,
              multi: false,
              keyOffer: which === "key",
            });
            expect(s).not.toHaveProperty("text");
          }
          expect(r.holdsWire).toBe(which !== "key" && hop < 15);
          expect(hasSeen(r.next.seen, frameKey(frame))).toBe(true);
        },
      ),
    );
  });

  it("a KEY_OFFER never holds a wire, even with hops left", () => {
    /** **Validates: Requirements 4.1, 4.14** */
    const id = new Uint8Array(8).fill(7);
    const r = receiveFrame(EMPTY_RECEIVE, {
      frame: single(id, "k", { type: 4 }),
      ownEcho: false,
      atMs: 0,
    });
    expect(r.holdsWire).toBe(false);
    const s = r.slip as Slip;
    if (s.kind === "system") expect(s.relay?.keyOffer).toBe(true);
  });

  it("a TEXT single frame holds a wire only while it can be relayed", () => {
    /** **Validates: Requirements 4.1** */
    fc.assert(
      fc.property(
        idArb,
        printable,
        fc.integer({ min: 0, max: 15 }),
        (id, text, hop) => {
          const r = receiveFrame(EMPTY_RECEIVE, {
            frame: single(id, text, { hop }),
            ownEcho: false,
            atMs: 0,
          });
          expect(r.holdsWire).toBe(hop < 15);
          const s = r.slip as Slip;
          if (s.kind === "heard") {
            expect(s.relay).toEqual({
              hop,
              ttl: 3,
              multi: false,
              keyOffer: false,
            });
          }
        },
      ),
    );
  });

  it("an unreadable multi-frame frame still prints unsupported and holds no wire", () => {
    /** **Validates: Requirements 3.1, 4.3** */
    fc.assert(
      fc.property(idArb, printable, (id, text) => {
        const made = makeFrames(
          { type: 3, encrypted: false, hop: 0, ttl: 3, messageId: id },
          [enc.encode(text), enc.encode(text)],
        );
        if (!made.ok) throw new Error("makeFrames failed");
        const r = receiveFrame(EMPTY_RECEIVE, {
          frame: made.value[0] as Frame,
          ownEcho: false,
          atMs: 0,
        });
        const s = r.slip as Slip;
        expect(s.kind).toBe("system");
        if (s.kind === "system") expect(s.noticeKey).toBe("unsupported");
        expect(r.holdsWire).toBe(false);
      }),
    );
  });

  const multiArb = fc
    .tuple(idArb, fc.array(printable, { minLength: 2, maxLength: 6 }))
    .map(([id, parts]) => ({ id, parts, frames: multi(id, parts) }));

  it("a multi-frame message yields one slip, only after the last frame, in any order", () => {
    fc.assert(
      fc.property(
        multiArb.chain((m) =>
          fc.tuple(
            fc.constant(m),
            fc.shuffledSubarray(m.frames, {
              minLength: m.frames.length,
              maxLength: m.frames.length,
            }),
            fc.array(fc.nat({ max: m.frames.length - 1 }), { maxLength: 5 }),
          ),
        ),
        ([m, order, dupIdx]) => {
          const dups = dupIdx.map((i) => m.frames[i] as Frame);
          // Duplicates are only inserted before the final distinct frame.
          const seq = [
            ...order.slice(0, -1),
            ...dups,
            order[order.length - 1] as Frame,
          ];
          const { slips } = feed(seq);
          // dups may include the last distinct frame early, so count must still be 1 after all.
          expect(slips).toHaveLength(1);
          const s = slips[0] as Slip;
          expect(s.kind).toBe("heard");
          if (s.kind === "heard") expect(s.text).toBe(m.parts.join(""));
        },
      ),
    );
  });

  it("no slip for any proper subset of the frames", () => {
    fc.assert(
      fc.property(
        multiArb.chain((m) =>
          fc.tuple(
            fc.constant(m),
            fc.shuffledSubarray(m.frames, {
              minLength: 0,
              maxLength: m.frames.length - 1,
            }),
          ),
        ),
        ([, subset]) => {
          expect(feed(subset).slips).toHaveLength(0);
        },
      ),
    );
  });

  it("seen and partial stay within their caps and nothing throws", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(idArb, textArb, fc.boolean()), { maxLength: 40 }),
        (items) => {
          let rs = EMPTY_RECEIVE;
          for (const [id, text, asPart] of items) {
            const t = text.replace(/[^\x20-\x7e]/g, "a");
            const frames = asPart
              ? multi(id, [t, t]).slice(0, 1)
              : [single(id, t)];
            for (const frame of frames) {
              rs = receiveFrame(rs, { frame, ownEcho: false, atMs: 0 }).next;
            }
          }
          expect(rs.seen.length).toBeLessThanOrEqual(SEEN_MAX);
          expect(Object.keys(rs.partial).length).toBeLessThanOrEqual(
            PARTIAL_MAX,
          );
        },
      ),
    );
  });

  it("seen is capped at SEEN_MAX with the newest kept", () => {
    let rs = EMPTY_RECEIVE;
    let last: Frame | undefined;
    for (let i = 0; i < SEEN_MAX + 20; i++) {
      const id = new Uint8Array(8);
      new DataView(id.buffer).setUint32(0, i);
      last = single(id, "x");
      rs = receiveFrame(rs, { frame: last, ownEcho: false, atMs: i }).next;
    }
    expect(rs.seen).toHaveLength(SEEN_MAX);
    expect(rs.seen[SEEN_MAX - 1]).toBe(frameKey(last as Frame));
  });
});

describe("Property 11: Each message is shown once", () => {
  /** **Validates: Requirements 3.1, 3.2, 3.4, 3.5, 9.14** */
  const evArb = fc.record({
    idx: fc.integer({ min: 0, max: 3 }),
    hop: fc.integer({ min: 0, max: 15 }),
    ttl: fc.integer({ min: 0, max: 15 }),
    ownEcho: fc.boolean(),
  });

  function frameOf(idx: number, hop: number, ttl: number): Frame {
    const id = new Uint8Array(8).fill(idx + 1);
    const made = makeFrames(
      { type: 0, encrypted: false, hop, ttl, messageId: id },
      [enc.encode("hello")],
    );
    if (!made.ok) throw new Error(`makeFrames ${made.error.code}`);
    return made.value[0] as Frame;
  }

  it("prints at most one slip per key, ignores echoes and other hop/ttl copies, and holds every heard key", () => {
    fc.assert(
      fc.property(fc.array(evArb, { maxLength: 30 }), (events) => {
        let rs: ReceiveState = EMPTY_RECEIVE;
        const heard = new Set<string>();
        const printed = new Map<string, number>();
        events.forEach((e, i) => {
          const frame = frameOf(e.idx, e.hop, e.ttl);
          const key = frameKey(frame);
          const r = receiveFrame(rs, {
            frame,
            ownEcho: e.ownEcho,
            atMs: i,
          });
          if (e.ownEcho) {
            expect(r.slip).toBeNull();
            expect(r.next).toEqual(rs);
          } else if (heard.has(key)) {
            expect(r.slip).toBeNull();
            expect(r.next.seen).toEqual(rs.seen);
          } else {
            expect(r.slip).not.toBeNull();
            heard.add(key);
          }
          if (r.slip) printed.set(key, (printed.get(key) ?? 0) + 1);
          rs = r.next;
        });
        for (const n of printed.values()) expect(n).toBe(1);
        for (const key of heard) expect(hasSeen(rs.seen, key)).toBe(true);
        expect(rs.seen.length).toBe(heard.size);
      }),
      { verbose: true },
    );
  });
});

describe("Property 13: Held wires and unreadable notices", () => {
  /** **Validates: Requirements 4.1, 4.3, 4.13, 4.14** */
  const anyFrameArb = fc
    .record({
      type: fc.constantFrom(0, 1, 2, 3, 4, 5),
      encrypted: fc.boolean(),
      hop: fc.integer({ min: 0, max: 15 }),
      ttl: fc.integer({ min: 0, max: 15 }),
      id: idArb,
      body: fc.uint8Array({ minLength: 16, maxLength: 100 }),
    })
    .map((r) => ({ ...r, encrypted: r.type === 4 ? false : r.encrypted }));

  it("holdsWire iff canRelay accepts the header; non-TEXT or encrypted frames print a bare unreadable notice", () => {
    fc.assert(
      fc.property(anyFrameArb, (r) => {
        const made = makeFrames(
          {
            type: r.type as 0,
            encrypted: r.encrypted,
            hop: r.hop,
            ttl: r.ttl,
            messageId: r.id,
          },
          [r.body],
        );
        if (!made.ok) throw new Error(`makeFrames ${made.error.code}`);
        const frame = made.value[0] as Frame;
        const res = receiveFrame(EMPTY_RECEIVE, {
          frame,
          ownEcho: false,
          atMs: 0,
        });
        expect(res.slip).not.toBeNull();
        expect(res.holdsWire).toBe(canRelay(frame.header));
        if (r.type === 4) expect(res.holdsWire).toBe(false);

        const s = res.slip as Slip;
        if (r.type === 0 && !r.encrypted) {
          expect(s.kind).toBe("heard");
        } else {
          expect(s.kind).toBe("system");
          if (s.kind === "system") {
            expect(s.noticeKey).toBe("unreadable");
            expect(s.relay?.keyOffer).toBe(r.type === 4);
            expect(Object.keys(s).sort()).toEqual(
              ["at", "id", "kind", "noticeKey", "relay"].sort(),
            );
          }
        }
      }),
      { verbose: true },
    );
  });
});
