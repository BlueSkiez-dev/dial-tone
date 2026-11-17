import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { VERSION } from "./budget";
import { reassemble } from "./segment";
import type { Frame, MessageType } from "./types";

// Print the seed and path on failure so CI failures can be replayed.
const PARAMS = { verbose: true, numRuns: 200 } as const;

const MISMATCHED = { ok: false, error: { code: "MISMATCHED_FRAMES" } } as const;
const CONFLICT = {
  ok: false,
  error: { code: "CONFLICTING_DUPLICATE" },
} as const;

function mk(
  messageId: Uint8Array,
  type: number,
  encrypted: boolean,
  total: number,
  index: number,
  body: Uint8Array,
  hop = 0,
  ttl = 0,
): Frame {
  return {
    header: {
      version: VERSION,
      type: type as MessageType,
      encrypted,
      hop,
      ttl,
      messageId: messageId.slice(),
      index,
      total,
    },
    body: body.slice(),
  };
}

function withHeader(f: Frame, patch: Partial<Frame["header"]>): Frame {
  return { header: { ...f.header, ...patch }, body: f.body.slice() };
}

const idArb = fc.uint8Array({ minLength: 8, maxLength: 8 });
const typeArb = fc.integer({ min: 0, max: 5 });
const bodyArb = fc.uint8Array({ minLength: 0, maxLength: 24 });
const keysArb = fc.array(fc.integer(), { minLength: 24, maxLength: 24 });

/** A consistent, complete message of 2..8 frames. */
const messageArb = fc
  .record({
    id: idArb,
    type: typeArb,
    encrypted: fc.boolean(),
    bodies: fc.array(bodyArb, { minLength: 2, maxLength: 8 }),
  })
  .map(({ id, type, encrypted, bodies }) =>
    bodies.map((b, i) => mk(id, type, encrypted, bodies.length, i, b)),
  );

/** Deterministic permutation driven by generated keys (arrival order). */
function shuffle<T>(items: readonly T[], keys: readonly number[]): T[] {
  return items
    .map((item, i) => ({ item, k: keys[i % keys.length] as number, i }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((x) => x.item);
}

describe("Property 12: Reassembly rejects inconsistency", () => {
  /**
   * **Validates: Requirements 9.6**
   */
  it("empty set returns EMPTY_SET", () => {
    expect(reassemble([])).toEqual({ ok: false, error: { code: "EMPTY_SET" } });
  });

  /**
   * **Validates: Requirements 9.3, 9.8**
   */
  it("a frame differing in Message_ID, type, encrypted flag or total returns MISMATCHED_FRAMES in any order", () => {
    fc.assert(
      fc.property(
        messageArb,
        fc.constantFrom("id", "type", "encrypted", "total"),
        fc.nat(),
        keysArb,
        (frames, field, pick, keys) => {
          const at = pick % frames.length;
          const target = frames[at] as Frame;
          const h = target.header;
          let patch: Partial<Frame["header"]>;
          if (field === "id") {
            const id = h.messageId.slice();
            id[0] = (id[0] as number) ^ 0x01;
            patch = { messageId: id };
          } else if (field === "type") {
            patch = { type: ((h.type + 1) % 6) as MessageType };
          } else if (field === "encrypted") {
            patch = { encrypted: !h.encrypted };
          } else {
            patch = { total: h.total + 1 };
          }
          const mutated = frames.map((f, i) =>
            i === at ? withHeader(f, patch) : f,
          );
          expect(reassemble(shuffle(mutated, keys))).toEqual(MISMATCHED);
        },
      ),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 9.4**
   */
  it("the same index with different Bodies returns CONFLICTING_DUPLICATE in any order", () => {
    fc.assert(
      fc.property(
        messageArb,
        fc.nat(),
        fc.uint8Array({ minLength: 1, maxLength: 4 }),
        keysArb,
        (frames, pick, extra, keys) => {
          const orig = frames[pick % frames.length] as Frame;
          const other: Frame = {
            header: {
              ...orig.header,
              messageId: orig.header.messageId.slice(),
            },
            body: new Uint8Array([...orig.body, ...extra]),
          };
          expect(reassemble(shuffle([...frames, other], keys))).toEqual(
            CONFLICT,
          );
        },
      ),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 9.5**
   */
  it("missing indexes are reported ascending with the total, ignoring identical duplicates and order", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 16 }),
        fc.array(fc.boolean(), { minLength: 16, maxLength: 16 }),
        fc.nat(),
        idArb,
        typeArb,
        fc.boolean(),
        fc.array(bodyArb, { minLength: 16, maxLength: 16 }),
        keysArb,
        (total, mask, pivot, id, type, encrypted, bodies, keys) => {
          const present: boolean[] = mask.slice(0, total);
          present[pivot % total] = true; // at least one frame is present
          const frames: Frame[] = [];
          const missing: number[] = [];
          for (let i = 0; i < total; i++) {
            if (present[i]) {
              frames.push(
                mk(id, type, encrypted, total, i, bodies[i] as Uint8Array),
              );
            } else {
              missing.push(i);
            }
          }
          const dup = frames[0] as Frame;
          const input = shuffle(
            [
              ...frames,
              mk(id, type, encrypted, total, dup.header.index, dup.body, 3, 9),
            ],
            keys,
          );
          const r = reassemble(input);
          expect(r.ok).toBe(true);
          if (!r.ok) return;
          if (missing.length === 0) {
            expect(r.value.complete).toBe(true);
          } else {
            expect(r.value).toEqual({ complete: false, missing, total });
          }
        },
      ),
      PARAMS,
    );
  });

  /**
   * **Validates: Requirements 9.8**
   */
  it("when a mismatch and a conflicting duplicate are both present, the lower index decides, regardless of input order", () => {
    fc.assert(
      fc.property(
        messageArb,
        fc.nat(),
        fc.nat(),
        keysArb,
        (frames, a, b, keys) => {
          const n = frames.length;
          const m = a % n; // index of the mismatched extra frame
          const c = b % n; // index of the conflicting duplicate
          fc.pre(m !== c);
          const mFrame = frames[m] as Frame;
          const cFrame = frames[c] as Frame;
          const mismatch = withHeader(mFrame, {
            type: ((mFrame.header.type + 1) % 6) as MessageType,
          });
          const conflict: Frame = {
            header: {
              ...cFrame.header,
              messageId: cFrame.header.messageId.slice(),
            },
            body: new Uint8Array([...cFrame.body, 0xaa]),
          };
          const r = reassemble(shuffle([...frames, mismatch, conflict], keys));
          expect(r).toEqual(m < c ? MISMATCHED : CONFLICT);
        },
      ),
      PARAMS,
    );
  });
});
