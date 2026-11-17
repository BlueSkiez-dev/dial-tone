import { describe, expect, it } from "vitest";
import { MAX_FRAMES, VERSION } from "./budget";
import {
  type FrameTemplate,
  makeFrames,
  reassemble,
  splitPayload,
} from "./segment";
import type { Frame, MessageType } from "./types";

const enc = new TextEncoder();
const PLAIN = { encrypted: false, utf8Boundaries: false } as const;
const SEALED = { encrypted: true, utf8Boundaries: false } as const;

function bytes(n: number, fill = 0x61): Uint8Array {
  return new Uint8Array(n).fill(fill);
}

function lengths(chunks: Uint8Array[]): number[] {
  return chunks.map((c) => c.length);
}

function split(payload: Uint8Array, opts: typeof PLAIN | typeof SEALED) {
  const r = splitPayload(payload, opts);
  if (!r.ok) throw new Error(`split failed: ${r.error.code}`);
  return r.value;
}

describe("splitPayload", () => {
  it("returns one empty chunk for an empty payload", () => {
    const r = splitPayload(new Uint8Array(0), PLAIN);
    expect(r).toEqual({ ok: true, value: [new Uint8Array(0)] });
  });

  it("keeps a payload at the single-frame capacity in one chunk", () => {
    expect(lengths(split(bytes(128), PLAIN))).toEqual([128]);
    expect(lengths(split(bytes(112), SEALED))).toEqual([112]);
  });

  it("splits one byte over the single-frame capacity into two chunks", () => {
    expect(lengths(split(bytes(129), PLAIN))).toEqual([127, 2]);
    expect(lengths(split(bytes(113), SEALED))).toEqual([111, 2]);
  });

  it("returns copies, not views of the payload", () => {
    const payload = bytes(10);
    const chunks = split(payload, PLAIN);
    (chunks[0] as Uint8Array)[0] = 0;
    expect(payload[0]).toBe(0x61);
  });

  it("does not cut inside a 4-byte code point", () => {
    // 126 bytes + a 4-byte code point: the 127-byte cut lands inside it.
    const payload = new Uint8Array([...bytes(126), ...enc.encode("\u{1F600}")]);
    const r = splitPayload(payload, { encrypted: false, utf8Boundaries: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(lengths(r.value)).toEqual([126, 4]);
  });

  it("cuts mid code point when utf8Boundaries is off", () => {
    const payload = new Uint8Array([...bytes(128), ...enc.encode("\u{1F600}")]);
    expect(lengths(split(payload, PLAIN))).toEqual([127, 5]);
  });

  it("returns INVALID_UTF8 for bad UTF-8 with utf8Boundaries", () => {
    const opts = { encrypted: false, utf8Boundaries: true };
    for (const bad of [
      [0xff],
      [0x80],
      [0xc0, 0xaf],
      [0xed, 0xa0, 0x80],
      [0xe2, 0x82],
    ]) {
      expect(splitPayload(new Uint8Array(bad), opts)).toEqual({
        ok: false,
        error: { code: "INVALID_UTF8" },
      });
    }
  });

  it("accepts the same bytes when utf8Boundaries is off", () => {
    expect(split(new Uint8Array([0xff]), PLAIN)).toHaveLength(1);
  });

  it("accepts 16 full chunks and rejects one more byte", () => {
    expect(lengths(split(bytes(16 * 127), PLAIN))).toEqual(
      new Array(16).fill(127),
    );
    expect(lengths(split(bytes(16 * 111), SEALED))).toEqual(
      new Array(16).fill(111),
    );
    expect(splitPayload(bytes(16 * 127 + 1), PLAIN)).toEqual({
      ok: false,
      error: { code: "TOO_MANY_FRAMES" },
    });
    expect(splitPayload(bytes(16 * 111 + 1), SEALED)).toEqual({
      ok: false,
      error: { code: "TOO_MANY_FRAMES" },
    });
  });
});

const ID = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

function template(over: Partial<FrameTemplate> = {}): FrameTemplate {
  return {
    type: 0,
    encrypted: false,
    hop: 0,
    ttl: 7,
    messageId: ID,
    ...over,
  };
}

function codeOf(r: ReturnType<typeof makeFrames>): string | undefined {
  return r.ok ? undefined : r.error.code;
}

describe("makeFrames", () => {
  it("builds frames sharing message fields with indexes 0..n-1", () => {
    const bodies = [bytes(5, 1), bytes(6, 2), bytes(7, 3)];
    const r = makeFrames(template({ hop: 2, ttl: 9 }), bodies);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toHaveLength(3);
    r.value.forEach((f, i) => {
      expect(f.header).toEqual({
        version: VERSION,
        type: 0,
        encrypted: false,
        hop: 2,
        ttl: 9,
        messageId: ID,
        index: i,
        total: 3,
      });
      expect(f.body).toEqual(bodies[i]);
    });
  });

  it("builds a single frame with total 1", () => {
    const r = makeFrames(template(), [bytes(128)]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value[0]?.header.total).toBe(1);
  });

  it("copies the message ID and bodies", () => {
    const id = ID.slice();
    const body = bytes(4);
    const r = makeFrames(template({ messageId: id }), [body]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    id[0] = 99;
    body[0] = 99;
    expect(r.value[0]?.header.messageId[0]).toBe(1);
    expect(r.value[0]?.body[0]).toBe(0x61);
  });

  it("returns EMPTY_SET first, even with a bad template", () => {
    const bad = template({ messageId: new Uint8Array(7), hop: 16 });
    expect(codeOf(makeFrames(bad, []))).toBe("EMPTY_SET");
  });

  it("returns TOO_MANY_FRAMES before template errors", () => {
    const bodies = new Array(MAX_FRAMES + 1).fill(0).map(() => bytes(1));
    const bad = template({ messageId: new Uint8Array(7) });
    expect(codeOf(makeFrames(bad, bodies))).toBe("TOO_MANY_FRAMES");
  });

  it("returns BAD_ID_LENGTH before BAD_ROUTING", () => {
    const bad = template({ messageId: new Uint8Array(7), hop: 16 });
    expect(codeOf(makeFrames(bad, [bytes(1)]))).toBe("BAD_ID_LENGTH");
  });

  it("returns BAD_ROUTING before BAD_TYPE", () => {
    const bad = template({ hop: 16, type: 9 as MessageType });
    expect(codeOf(makeFrames(bad, [bytes(1)]))).toBe("BAD_ROUTING");
    expect(codeOf(makeFrames(template({ ttl: -1 }), [bytes(1)]))).toBe(
      "BAD_ROUTING",
    );
  });

  it("returns BAD_TYPE before KEY_OFFER rules and body checks", () => {
    const bad = template({ type: 9 as MessageType });
    expect(codeOf(makeFrames(bad, [bytes(500)]))).toBe("BAD_TYPE");
  });

  it("rejects an encrypted KEY_OFFER before the multi-frame check", () => {
    const t = template({ type: 4, encrypted: true });
    const bodies = [bytes(16), bytes(16)];
    expect(codeOf(makeFrames(t, bodies))).toBe("KEY_OFFER_ENCRYPTED");
  });

  it("rejects a KEY_OFFER with two bodies before body checks", () => {
    const t = template({ type: 4 });
    expect(codeOf(makeFrames(t, [bytes(1), bytes(500)]))).toBe(
      "KEY_OFFER_MULTIFRAME",
    );
  });

  it("accepts a single KEY_OFFER body of 16 bytes", () => {
    expect(makeFrames(template({ type: 4 }), [bytes(16)]).ok).toBe(true);
  });

  it("returns BODY_TOO_SHORT for an encrypted body under 16 bytes", () => {
    const t = template({ encrypted: true });
    expect(codeOf(makeFrames(t, [bytes(15)]))).toBe("BODY_TOO_SHORT");
    expect(codeOf(makeFrames(template({ type: 4 }), [bytes(15)]))).toBe(
      "BODY_TOO_SHORT",
    );
  });

  it("returns FRAME_TOO_LONG at capacity plus one", () => {
    expect(makeFrames(template(), [bytes(128)]).ok).toBe(true);
    expect(codeOf(makeFrames(template(), [bytes(129)]))).toBe("FRAME_TOO_LONG");
    // Two bodies use the multi-frame header: capacity 127.
    expect(makeFrames(template(), [bytes(127), bytes(127)]).ok).toBe(true);
    expect(codeOf(makeFrames(template(), [bytes(1), bytes(128)]))).toBe(
      "FRAME_TOO_LONG",
    );
  });

  it("reports the first failing body in index order", () => {
    const t = template({ encrypted: true });
    expect(codeOf(makeFrames(t, [bytes(15), bytes(200)]))).toBe(
      "BODY_TOO_SHORT",
    );
    expect(codeOf(makeFrames(t, [bytes(200), bytes(15)]))).toBe(
      "FRAME_TOO_LONG",
    );
  });
});

function frame(
  index: number,
  total: number,
  body: Uint8Array,
  over: {
    id?: Uint8Array;
    type?: number;
    encrypted?: boolean;
    hop?: number;
    ttl?: number;
  } = {},
): Frame {
  return {
    header: {
      version: VERSION,
      type: (over.type ?? 0) as MessageType,
      encrypted: over.encrypted ?? false,
      hop: over.hop ?? 0,
      ttl: over.ttl ?? 7,
      messageId: (over.id ?? ID).slice(),
      index,
      total,
    },
    body: body.slice(),
  };
}

const OTHER_ID = new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]);

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [
      item,
      ...rest,
    ]),
  );
}

describe("reassemble", () => {
  const parts = [
    new Uint8Array([1, 2]),
    new Uint8Array([3]),
    new Uint8Array([4, 5, 6]),
  ];
  const full = [0, 1, 2].map((i) => frame(i, 3, parts[i] as Uint8Array));

  it("returns EMPTY_SET for no frames", () => {
    expect(reassemble([])).toEqual({
      ok: false,
      error: { code: "EMPTY_SET" },
    });
  });

  it("joins bodies in index order for every arrival order", () => {
    for (const order of permutations(full)) {
      expect(reassemble(order)).toEqual({
        ok: true,
        value: {
          complete: true,
          payload: new Uint8Array([1, 2, 3, 4, 5, 6]),
          message: { messageId: ID, type: 0, encrypted: false, total: 3 },
        },
      });
    }
  });

  it("completes a single-frame message", () => {
    const r = reassemble([frame(0, 1, new Uint8Array([7]))]);
    expect(r.ok && r.value.complete && r.value.payload).toEqual(
      new Uint8Array([7]),
    );
  });

  it("completes a message whose only body is empty", () => {
    const r = reassemble([frame(0, 1, new Uint8Array(0))]);
    expect(r.ok && r.value.complete && r.value.payload.length).toBe(0);
  });

  it("ignores identical duplicates", () => {
    const [f0, f1, f2] = full as [Frame, Frame, Frame];
    const r = reassemble([f1, f0, f1, f2, f0]);
    expect(r.ok && r.value.complete && r.value.payload).toEqual(
      new Uint8Array([1, 2, 3, 4, 5, 6]),
    );
  });

  it("ignores differing hop and ttl", () => {
    const frames = [
      frame(0, 3, parts[0] as Uint8Array, { hop: 0, ttl: 15 }),
      frame(1, 3, parts[1] as Uint8Array, { hop: 5, ttl: 2 }),
      frame(1, 3, parts[1] as Uint8Array, { hop: 9, ttl: 0 }),
      frame(2, 3, parts[2] as Uint8Array, { hop: 15, ttl: 1 }),
    ];
    const r = reassemble(frames);
    expect(r.ok && r.value.complete && r.value.payload).toEqual(
      new Uint8Array([1, 2, 3, 4, 5, 6]),
    );
    expect(r.ok && r.value.complete && "hop" in r.value.message).toBe(false);
  });

  it("lists missing indexes ascending with the total", () => {
    const r = reassemble([full[2], full[0]] as Frame[]);
    expect(r).toEqual({
      ok: true,
      value: { complete: false, missing: [1], total: 3 },
    });
    const sparse = reassemble([frame(3, 5, bytes(1))]);
    expect(sparse).toEqual({
      ok: true,
      value: { complete: false, missing: [0, 1, 2, 4], total: 5 },
    });
  });

  it("returns MISMATCHED_FRAMES when a shared field differs", () => {
    const base = frame(0, 2, bytes(1));
    const others = [
      frame(1, 2, bytes(1), { id: OTHER_ID }),
      frame(1, 2, bytes(1), { type: 1 }),
      frame(1, 2, bytes(1), { encrypted: true }),
      frame(1, 3, bytes(1)),
    ];
    for (const other of others) {
      expect(reassemble([base, other])).toEqual({
        ok: false,
        error: { code: "MISMATCHED_FRAMES" },
      });
    }
  });

  it("returns MISMATCHED_FRAMES when an index is out of range", () => {
    const r = reassemble([frame(0, 2, bytes(1)), frame(2, 2, bytes(1))]);
    expect(r).toEqual({ ok: false, error: { code: "MISMATCHED_FRAMES" } });
  });

  it("returns CONFLICTING_DUPLICATE for the same index with new bodies", () => {
    const r = reassemble([
      frame(0, 2, bytes(1, 1)),
      frame(0, 2, bytes(1, 2)),
      frame(1, 2, bytes(1)),
    ]);
    expect(r).toEqual({
      ok: false,
      error: { code: "CONFLICTING_DUPLICATE" },
    });
  });

  it("evaluates in index order (clause 9.8): lower index error wins", () => {
    // Index 1 is mismatched, index 2 holds a conflicting duplicate.
    const mismatchFirst = [
      frame(0, 3, bytes(1)),
      frame(1, 3, bytes(1), { id: OTHER_ID }),
      frame(2, 3, bytes(1, 1)),
      frame(2, 3, bytes(1, 2)),
    ];
    for (const order of permutations(mismatchFirst)) {
      expect(reassemble(order)).toEqual({
        ok: false,
        error: { code: "MISMATCHED_FRAMES" },
      });
    }
    // Index 1 holds a conflict, index 2 is mismatched.
    const conflictFirst = [
      frame(0, 3, bytes(1)),
      frame(1, 3, bytes(1, 1)),
      frame(1, 3, bytes(1, 2)),
      frame(2, 3, bytes(1), { type: 1 }),
    ];
    for (const order of permutations(conflictFirst)) {
      expect(reassemble(order)).toEqual({
        ok: false,
        error: { code: "CONFLICTING_DUPLICATE" },
      });
    }
  });

  it("does not mutate or alias its input", () => {
    const frames = [frame(0, 1, new Uint8Array([1, 2]))];
    const r = reassemble(frames);
    expect(r.ok && r.value.complete).toBe(true);
    if (!r.ok || !r.value.complete) return;
    r.value.payload[0] = 99;
    r.value.message.messageId[0] = 99;
    expect(frames[0]?.body[0]).toBe(1);
    expect(frames[0]?.header.messageId[0]).toBe(1);
  });
});
