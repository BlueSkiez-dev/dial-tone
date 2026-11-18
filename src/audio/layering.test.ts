import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const audioDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const protocolDir = resolve(audioDir, "..", "protocol");

const GGWAVE_MODEM = "ggwave-modem.ts";
const GLUE_FILES = [
  "capture-worklet.ts",
  "decode-worker.ts",
  "mic.ts",
  "player.ts",
  "transport.ts",
];
const GLUE_MAX_LINES = 200;

function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

function listSources(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...listSources(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      found.push(full);
    }
  }
  return found;
}

interface Source {
  /** Path relative to src/audio, with forward slashes. */
  name: string;
  path: string;
  raw: string;
  code: string;
}

const sources: Source[] = listSources(audioDir).map((path) => {
  const raw = readFileSync(path, "utf8");
  return {
    name: relative(audioDir, path).split("\\").join("/"),
    path,
    raw,
    code: stripComments(raw),
  };
});

const isGlue = (s: Source) => GLUE_FILES.includes(s.name);
const pureModules = sources.filter((s) => !isGlue(s));

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

function interfaceBody(code: string, name: string): string {
  const start = code.search(new RegExp(`\\binterface\\s+${name}\\b[^{]*\\{`));
  expect(start, `interface ${name} exists`).toBeGreaterThanOrEqual(0);
  const open = code.indexOf("{", start);
  const close = code.indexOf("\n}", open);
  return code.slice(open + 1, close);
}

/** Names of the members declared at the top level of an interface body. */
function memberNames(body: string): string[] {
  const names: string[] = [];
  for (const match of body.matchAll(/^ {2}(?:readonly\s+)?(\w+)\s*[(:?<]/gm)) {
    if (match[1] !== undefined) names.push(match[1]);
  }
  return names;
}

describe("src/audio layering and purity", () => {
  it("scans the non-test source files, including testing/", () => {
    const names = sources.map((s) => s.name);
    expect(names).toContain("modem.ts");
    expect(names).toContain("profiles.ts");
    expect(names).toContain(GGWAVE_MODEM);
    expect(names).toContain("testing/fake-modem.ts");
    expect(names.some((n) => n.endsWith(".test.ts"))).toBe(false);
  });

  it("keeps ggwave tokens and vendor imports inside ggwave-modem.ts", () => {
    const tokens = [
      "ggwave_factory",
      "rxToggleProtocol",
      "GGWAVE_PROTOCOL",
      "ALL_GGWAVE_PROTOCOLS",
    ];
    for (const { name, code } of sources) {
      if (name === GGWAVE_MODEM) continue;
      for (const token of tokens) {
        expect(code.includes(token), `${name} contains ${token}`).toBe(false);
      }
      for (const spec of importSpecifiers(code)) {
        expect(spec, `${name} imports ${spec}`).not.toMatch(/vendor/);
      }
    }
  });

  it("uses no browser global in the pure modules", () => {
    const forbidden = [
      /\bwindow\b/,
      /\bdocument\b/,
      /\bnavigator\b/,
      /\bAudioContext\b/,
      /\bAudioWorkletNode\b/,
      /\bWorker\b/,
      /\bMediaStream\b/,
      /\bimportScripts\b/,
    ];
    for (const { name, code } of pureModules) {
      for (const pattern of forbidden) {
        expect(code, `${name} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("imports from outside src/audio only from src/protocol", () => {
    for (const { name, path, code } of sources) {
      for (const spec of importSpecifiers(code)) {
        const outside = !spec.startsWith(".")
          ? true
          : !`${resolve(dirname(path), spec)}/`.startsWith(`${audioDir}/`) &&
            !`${resolve(dirname(path), spec)}/`.startsWith(`${audioDir}\\`);
        if (!outside) continue;
        if (!spec.startsWith(".")) {
          expect.fail(`${name} imports bare specifier ${spec}`);
        }
        const target = resolve(dirname(path), spec).replace(/[\\/]index$/, "");
        expect(target, `${name} imports ${spec}`).toBe(protocolDir);
      }
    }
  });

  it("mentions neither SharedArrayBuffer nor ScriptProcessor outside comments", () => {
    for (const { name, code } of sources) {
      expect(code, name).not.toMatch(/SharedArrayBuffer/);
      expect(code, name).not.toMatch(/ScriptProcessor/);
    }
  });

  it("keeps ggwave types out of Modem and ModemDecoder", () => {
    const modem = sources.find((s) => s.name === "modem.ts");
    expect(modem).toBeDefined();
    const code = modem?.code ?? "";
    expect(code).not.toMatch(/ggwave/i);
    for (const name of ["Modem", "ModemDecoder"]) {
      expect(interfaceBody(code, name), name).not.toMatch(/ggwave/i);
    }
  });

  it("gives neither interface a way to change a live decoder's protocol set", () => {
    const modem = sources.find((s) => s.name === "modem.ts");
    const code = modem?.code ?? "";
    expect(memberNames(interfaceBody(code, "ModemDecoder")).sort()).toEqual([
      "dispose",
      "feed",
      "protocols",
      "reset",
    ]);
    expect(memberNames(interfaceBody(code, "Modem")).sort()).toEqual([
      "createDecoders",
      "dispose",
      "modulate",
      "rxSampleRate",
      "txSampleRate",
    ]);
    // `protocols` on the decoder is read-only.
    expect(interfaceBody(code, "ModemDecoder")).toMatch(
      /readonly\s+protocols\b/,
    );
  });

  it("keeps the browser glue files thin", () => {
    for (const source of sources.filter(isGlue)) {
      const lines = source.raw.split(/\r?\n/).length;
      expect(lines, `${source.name} has ${lines} lines`).toBeLessThan(
        GLUE_MAX_LINES,
      );
    }
  });
});
