import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as protocol from "./index";

const dir = fileURLToPath(new URL(".", import.meta.url));

const sources = readdirSync(dir)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .map((name) => ({
    name,
    code: stripComments(readFileSync(join(dir, name), "utf8")),
  }));

function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

function importSpecifiers(code: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) {
      if (match[1] !== undefined) found.push(match[1]);
    }
  }
  return found;
}

describe("src/protocol layering and purity", () => {
  it("scans the non-test source files", () => {
    const names = sources.map((s) => s.name);
    expect(names).toContain("index.ts");
    expect(names).toContain("frame.ts");
    expect(names).toContain("segment.ts");
    expect(names).toContain("crc16.ts");
  });

  it("imports only sibling modules", () => {
    for (const { name, code } of sources) {
      for (const spec of importSpecifiers(code)) {
        expect(spec, `${name} imports ${spec}`).toMatch(/^\.\/[\w-]+$/);
        expect(spec).not.toMatch(/audio|ui|vendor|ggwave|node:/);
      }
    }
  });

  it("uses no forbidden runtime facility", () => {
    const forbidden = [
      /\bfetch\b/,
      /\bwindow\b/,
      /\bdocument\b/,
      /\bsubtle\b/,
      /\bXMLHttpRequest\b/,
      /\bWebSocket\b/,
      /\bprocess\b/,
      /\bBuffer\b/,
      /\bTextDecoder\b/,
    ];
    for (const { name, code } of sources) {
      for (const pattern of forbidden) {
        expect(code, `${name} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("calls only crypto.getRandomValues on crypto", () => {
    for (const { name, code } of sources) {
      for (const match of code.matchAll(/\bcrypto\.(\w+)/g)) {
        expect(match[1], `${name} uses crypto.${match[1]}`).toBe(
          "getRandomValues",
        );
      }
    }
  });
});

describe("Protocol_Index", () => {
  it("exports every function named in clause 14.5", () => {
    const functions = [
      "encodeFrame",
      "decodeFrame",
      "patchRouting",
      "frameKey",
      "splitPayload",
      "makeFrames",
      "reassemble",
      "aadFor",
      "ivFor",
      "newMessageId",
      "headerLength",
      "wireBodyCapacity",
      "plaintextCapacity",
      "utf8ByteLength",
      "frameOverhead",
    ];
    const api: Record<string, unknown> = { ...protocol };
    for (const name of functions) {
      expect(typeof api[name], name).toBe("function");
    }
    expect(typeof api.CRC_LEN).toBe("number");
  });

  it("does not export crc16 from the index", () => {
    const api: Record<string, unknown> = { ...protocol };
    expect("crc16" in api).toBe(false);
  });

  it("exports the budget constants with the clause 5.1 values", () => {
    expect({
      GGWAVE_MAX_PAYLOAD: protocol.GGWAVE_MAX_PAYLOAD,
      VERSION: protocol.VERSION,
      MESSAGE_ID_LEN: protocol.MESSAGE_ID_LEN,
      TAG_LEN: protocol.TAG_LEN,
      IV_LEN: protocol.IV_LEN,
      HEADER_LEN_SINGLE: protocol.HEADER_LEN_SINGLE,
      HEADER_LEN_MULTI: protocol.HEADER_LEN_MULTI,
      CRC_LEN: protocol.CRC_LEN,
      MAX_FRAMES: protocol.MAX_FRAMES,
      MAX_HOP: protocol.MAX_HOP,
      MAX_TTL: protocol.MAX_TTL,
    }).toEqual({
      GGWAVE_MAX_PAYLOAD: 140,
      VERSION: 1,
      MESSAGE_ID_LEN: 8,
      TAG_LEN: 16,
      IV_LEN: 12,
      HEADER_LEN_SINGLE: 10,
      HEADER_LEN_MULTI: 11,
      CRC_LEN: 2,
      MAX_FRAMES: 16,
      MAX_HOP: 15,
      MAX_TTL: 15,
    });
  });
});
