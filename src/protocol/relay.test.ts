import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MESSAGE_ID_LEN, TAG_LEN } from "./budget";
import { decodeFrame, encodeFrame } from "./frame";
import * as protocol from "./index";
import { canRelay, checkRelay, relayWire, SEEN_MAX } from "./relay";
import type { Frame, MessageType } from "./types";

// The origin TTL of a sent message. It lives in src/ui/model/send.ts, which
// src/protocol must not import, so the test reads the source text instead and
// fails if the constant drifts from 3.
const SEND_TTL = 3;

function frame(fields: {
  type?: number;
  hop?: number;
  ttl?: number;
  body?: Uint8Array;
}): Frame {
  return {
    header: {
      version: 1,
      type: (fields.type ?? 0) as MessageType,
      encrypted: false,
      hop: fields.hop ?? 0,
      ttl: fields.ttl ?? SEND_TTL,
      messageId: Uint8Array.from({ length: MESSAGE_ID_LEN }, (_, i) => i + 1),
      index: 0,
      total: 1,
    },
    body: fields.body ?? new TextEncoder().encode("shelter 4 needs water"),
  };
}

function wireOf(f: Frame): Uint8Array {
  const encoded = encodeFrame(f);
  if (!encoded.ok) throw new Error(`encodeFrame failed: ${encoded.error.code}`);
  return encoded.value;
}

describe("relay examples", () => {
  it("SEND_TTL in src/ui/model/send.ts is 3", () => {
    const sendTs = readFileSync(
      fileURLToPath(new URL("../ui/model/send.ts", import.meta.url)),
      "utf8",
    );
    expect(sendTs).toMatch(/export const SEND_TTL = 3;/);
  });

  it("a message sent with SEND_TTL 3 is passed on exactly 3 times", () => {
    let wire = wireOf(frame({ hop: 0, ttl: SEND_TTL }));
    const seenHops: number[] = [];
    for (let pass = 1; pass <= SEND_TTL; pass++) {
      const next = relayWire(wire);
      expect(next.ok, `pass ${pass}`).toBe(true);
      if (!next.ok) return;
      wire = next.value;
      const decoded = decodeFrame(wire);
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) return;
      expect(decoded.value.header.hop).toBe(pass);
      expect(decoded.value.header.ttl).toBe(SEND_TTL - pass);
      seenHops.push(decoded.value.header.hop);
    }
    expect(seenHops).toEqual([1, 2, 3]);
    const fourth = relayWire(wire);
    expect(fourth).toEqual({ ok: false, error: { code: "NO_HOPS_LEFT" } });
  });

  it("hop 15 with ttl 3 is refused with HOP_LIMIT", () => {
    const f = frame({ hop: 15, ttl: 3 });
    expect(canRelay(f.header)).toBe(false);
    expect(checkRelay(f.header)).toEqual({
      ok: false,
      error: { code: "HOP_LIMIT" },
    });
    expect(relayWire(wireOf(f))).toEqual({
      ok: false,
      error: { code: "HOP_LIMIT" },
    });
  });

  it("a KEY_OFFER wire is refused with NOT_RELAYED_TYPE", () => {
    const f = frame({ type: 4, hop: 0, ttl: 3, body: new Uint8Array(TAG_LEN) });
    expect(canRelay(f.header)).toBe(false);
    expect(relayWire(wireOf(f))).toEqual({
      ok: false,
      error: { code: "NOT_RELAYED_TYPE" },
    });
  });

  it("the protocol index exports the relay API", () => {
    expect(protocol.canRelay).toBe(canRelay);
    expect(protocol.checkRelay).toBe(checkRelay);
    expect(protocol.relayWire).toBe(relayWire);
    expect(typeof protocol.hasSeen).toBe("function");
    expect(typeof protocol.markSeen).toBe("function");
    expect(protocol.SEEN_MAX).toBe(SEEN_MAX);
    expect(SEEN_MAX).toBe(256);
  });
});

describe("relay.ts source scan (body-blind)", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./relay.ts", import.meta.url)),
    "utf8",
  );
  // Scan code only, so prose in comments cannot hide or fake a match.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'])\/\/.*$/gm, "$1");

  it("reads the source", () => {
    expect(code).toMatch(/export function relayWire/);
  });

  it.each([
    ".body",
    ".encrypted",
    ".slice(",
    "subarray(",
    "encodeFrame",
    "splitPayload",
    "makeFrames",
    "newMessageId",
  ])("contains no %s", (needle) => {
    expect(code.includes(needle)).toBe(false);
  });

  it("reads .type only in the KEY_OFFER comparison", () => {
    const uses = [...code.matchAll(/\.type\b.*$/gm)].map((m) => m[0]);
    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatch(
      /^\.type === KEY_OFFER_TYPE\) return err\("NOT_RELAYED_TYPE"\);$/,
    );
    expect(code).toMatch(/const KEY_OFFER_TYPE = 4;/);
  });
});
