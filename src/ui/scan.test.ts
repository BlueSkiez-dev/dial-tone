/**
 * Source-scan enforcement for src/ui (Property 10) and the layering rules.
 * Reads files as text in Node, like src/audio/layering.test.ts.
 *
 * Feature: ui-shell, Property 10: Tokens and red
 * **Validates: Requirements 3.2, 3.3, 3.4, 2.3, 2.8, 20.1, 20.2, 20.5**
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { copy } from "./copy";

const uiDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const srcDir = resolve(uiDir, "..");
const rootDir = resolve(srcDir, "..");
const protocolDir = join(srcDir, "protocol");
const audioDir = join(srcDir, "audio");

function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'])\/\/.*$/gm, "$1");
}

function listFiles(dir: string, exts: string[]): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(full, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) found.push(full);
  }
  return found;
}

interface Source {
  /** Path relative to src/ui, forward slashes. */
  name: string;
  /** File name only. */
  base: string;
  path: string;
  code: string;
}

function load(dir: string, exts: string[], from: string): Source[] {
  return listFiles(dir, exts).map((path) => ({
    name: relative(from, path).split("\\").join("/"),
    base: path.split(/[\\/]/).pop() ?? path,
    path,
    code: stripComments(readFileSync(path, "utf8")),
  }));
}

const isTest = (s: Source) => /\.test\.ts$/.test(s.base);
const uiAll = load(uiDir, [".ts", ".tsx", ".css"], uiDir);
/** Production sources: no tests. */
const ui = uiAll.filter((s) => !isTest(s));
const uiCode = ui.filter((s) => !s.base.endsWith(".css"));
const modelCode = uiCode.filter((s) => s.name.startsWith("model/"));

function importSpecifiers(code: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) {
      if (match[1] !== undefined) found.push(match[1]);
    }
  }
  return found;
}

/** Counts matches of a global regex. */
const count = (code: string, re: RegExp) => (code.match(re) ?? []).length;

/** Network facilities and HTML injection (ui-shell 20.5). */
const FORBIDDEN: [RegExp, string][] = [
  [/https?:\/\//, "remote URL"],
  [/@import\s+url\(\s*["']?https?/, "@import url(http"],
  [/\bfetch\s*\(/, "fetch("],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\bWebSocket\b/, "WebSocket"],
  [/\bEventSource\b/, "EventSource"],
  [/\bsendBeacon\b/, "sendBeacon"],
  [/\binnerHTML\b/, "innerHTML"],
  [/\bdangerouslySetInnerHTML\b/, "dangerouslySetInnerHTML"],
];

/** Resolves a relative import to an existing .ts or .tsx file, or null. */
function resolveImport(fromPath: string, spec: string): string | null {
  const base = resolve(dirname(fromPath), spec);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
  ]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate)) return candidate;
  }
  return null;
}

/** The file and every file it reaches through relative imports. */
function importClosure(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const path = queue.pop();
    if (path === undefined || seen.has(path)) continue;
    seen.add(path);
    const code = stripComments(readFileSync(path, "utf8"));
    for (const spec of importSpecifiers(code)) {
      if (!spec.startsWith(".")) continue;
      const target = resolveImport(path, spec);
      if (target !== null) queue.push(target);
    }
  }
  return [...seen];
}

/** Every string in a copy object; functions are called with 1 and 2. */
function copyStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") {
    const fn = value as (n: number) => unknown;
    return [...copyStrings(fn(1)), ...copyStrings(fn(2))];
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(copyStrings);
  }
  return [];
}

describe("src/ui source scan (Property 10)", () => {
  it("finds the expected files", () => {
    const names = ui.map((s) => s.name);
    expect(names).toContain("styles/tokens.css");
    expect(names).toContain("components/SosButton.css");
    expect(names).toContain("model/reducer.ts");
    expect(names).toContain("transport-seam.ts");
    expect(names.some((n) => n.endsWith(".test.ts"))).toBe(false);
  });

  describe("colour literals", () => {
    // Existing shadow and gradient recipes written as rgba() in component CSS.
    // The count per file is pinned so no new literal can slip in; new colours
    // go into tokens.css. Requirement 3.2 allows Token aliases, so shrinking
    // these numbers (by moving a recipe into tokens.css) is always fine.
    const RGBA_PINNED: Record<string, number> = {
      "components/GroupKeyBar.css": 1,
      "components/Sheet.css": 1,
      "components/Slip.css": 2,
      "styles/channel-switch.css": 8,
      "styles/device.css": 15,
      "styles/listen-latch.css": 5,
      "styles/transmit-key.css": 5,
    };

    it("has no hex colour except #040504 outside tokens.css", () => {
      for (const s of ui) {
        if (s.name === "styles/tokens.css") continue;
        const hexes = (s.code.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).filter(
          (h) => h.toLowerCase() !== "#040504",
        );
        expect(hexes, s.name).toEqual([]);
      }
    });

    it("has no rgb( or hsl( literal outside tokens.css", () => {
      for (const s of ui) {
        if (s.name === "styles/tokens.css") continue;
        expect(s.code, s.name).not.toMatch(/\b(rgb|hsl|hsla)\(/);
      }
    });

    it("keeps rgba( literals to the pinned per-file counts", () => {
      for (const s of ui) {
        if (s.name === "styles/tokens.css") continue;
        const n = count(s.code, /\brgba\(/g);
        expect(n, `${s.name} has ${n} rgba( literals`).toBeLessThanOrEqual(
          RGBA_PINNED[s.name] ?? 0,
        );
      }
    });
  });

  describe("red and phosphor", () => {
    const RED = /--(sos|sos-hi|sos-lo|sos-edge|print-sos|ink-on-sos)\b/;
    const RED_FILES = new Set([
      "styles/tokens.css",
      "components/SosButton.css",
      "components/SosButton.tsx",
      "components/SosSlip.css",
      "components/SosSlip.tsx",
    ]);
    // Glass only: the Status_Window readout, the Scope, the group key display
    // and check-word chips. Sheet.css holds the onboarding art, which is drawn
    // on a glass panel (.sheet-art).
    const PHOSPHOR_FILES = new Set([
      "styles/tokens.css",
      "components/StatusWindow.css",
      "components/StatusWindow.tsx",
      "components/Scope.tsx",
      "components/scope-draw.ts",
      "styles/scope.css",
      "components/GroupKeyBar.css",
      "components/GroupKeyBar.tsx",
      "components/Sheet.css",
    ]);

    it("references the red Tokens only in the SOS button, ring and slip files", () => {
      const users = ui.filter((s) => RED.test(s.code)).map((s) => s.name);
      expect(users.length).toBeGreaterThan(0);
      for (const name of users) {
        expect(RED_FILES.has(name), `${name} uses a red Token`).toBe(true);
      }
    });

    it("references --phosphor only inside glass files", () => {
      const users = ui
        .filter((s) => /--phosphor\b/.test(s.code))
        .map((s) => s.name);
      expect(users.length).toBeGreaterThan(0);
      for (const name of users) {
        expect(PHOSPHOR_FILES.has(name), `${name} uses --phosphor`).toBe(true);
      }
    });
  });

  describe("no network and no HTML injection", () => {
    it("has no remote URL, remote import or network API", () => {
      for (const s of ui) {
        for (const [re, label] of FORBIDDEN) {
          expect(re.test(s.code), `${s.name} contains ${label}`).toBe(false);
        }
      }
    });
  });

  describe("layering", () => {
    it("keeps src/ui/model free of DOM globals and preact", () => {
      expect(modelCode.length).toBeGreaterThan(5);
      for (const s of modelCode) {
        expect(s.code, s.name).not.toMatch(
          /\b(window|document|navigator|localStorage|HTMLElement)\b/,
        );
        for (const spec of importSpecifiers(s.code)) {
          expect(spec, `${s.name} imports ${spec}`).not.toMatch(/preact/);
        }
      }
    });

    it("imports src/protocol and src/audio only through their index", () => {
      for (const s of uiCode) {
        for (const spec of importSpecifiers(s.code)) {
          if (!spec.startsWith(".")) continue;
          const target = resolve(dirname(s.path), spec);
          for (const dir of [protocolDir, audioDir]) {
            if (
              target !== dir &&
              !target.startsWith(`${dir}\\`) &&
              !target.startsWith(`${dir}/`)
            ) {
              continue;
            }
            expect(
              target === dir || target === join(dir, "index"),
              `${s.name} imports ${spec}`,
            ).toBe(true);
          }
        }
      }
    });

    it("imports createAudioTransport only in transport-seam.ts", () => {
      for (const s of uiAll) {
        if (s.name === "transport-seam.ts") continue;
        // Tests may mention it; production files may not use it at all.
        if (isTest(s)) continue;
        expect(s.code, s.name).not.toMatch(/\bcreateAudioTransport\b/);
      }
      const seam = ui.find((s) => s.name === "transport-seam.ts");
      expect(seam?.code).toMatch(
        /import\s*\{\s*createAudioTransport\s*\}\s*from\s*["']\.\.\/audio["']/,
      );
    });

    it("has no import from src/ui in src/protocol or src/audio", () => {
      const lower = [
        ...load(protocolDir, [".ts"], srcDir),
        ...load(audioDir, [".ts"], srcDir),
      ];
      expect(lower.length).toBeGreaterThan(20);
      for (const s of lower) {
        for (const spec of importSpecifiers(s.code)) {
          if (!spec.startsWith(".")) continue;
          const target = resolve(dirname(s.path), spec);
          const inUi =
            target === uiDir ||
            target.startsWith(`${uiDir}\\`) ||
            target.startsWith(`${uiDir}/`);
          expect(inUi, `${s.name} imports ${spec}`).toBe(false);
        }
      }
    });
  });

  describe("relay files (relay spec 5.5, 7.4, 8.2)", () => {
    const relayEntry = join(protocolDir, "relay.ts");

    it("has no network facility in the relay files or what relay.ts imports", () => {
      const closure = importClosure(relayEntry);
      expect(closure).toContain(relayEntry);
      expect(closure.length).toBeGreaterThan(1);
      for (const path of closure) {
        // 8.3: the Relay imports only from src/protocol.
        expect(
          path.startsWith(`${protocolDir}\\`) ||
            path.startsWith(`${protocolDir}/`),
          `relay.ts reaches ${path}`,
        ).toBe(true);
        for (const spec of importSpecifiers(
          stripComments(readFileSync(path, "utf8")),
        )) {
          expect(spec, `${path} imports ${spec}`).toMatch(/^\./);
        }
      }
      const files = [
        ...closure,
        join(uiDir, "model", "relay-view.ts"),
        join(uiDir, "model", "receive.ts"),
        join(uiDir, "controller.ts"),
      ];
      for (const path of files) {
        expect(existsSync(path), path).toBe(true);
        const code = stripComments(readFileSync(path, "utf8"));
        const name = relative(srcDir, path).split("\\").join("/");
        for (const [re, label] of FORBIDDEN) {
          expect(re.test(code), `${name} contains ${label}`).toBe(false);
        }
      }
    });

    it("hard-codes no relay string outside copy.ts", () => {
      const relayCopy = [
        ...copyStrings(copy.relay),
        ...copyStrings(copy.slip.notices.unreadable),
        ...copyStrings(copy.slip.notices["relay-failed"]),
      ];
      expect(relayCopy).toContain("Passed on");
      const fragments: RegExp[] = [
        /pass(ed)? it on/i,
        /passed on/i,
        /end of the line/i,
        /hops? left/i,
        /\bvia \d|\bvia \$\{/,
        /can[’']t (read|be passed)/i,
        /cannot read this/i,
        /could not pass on/i,
      ];
      for (const s of uiCode) {
        if (s.name === "copy.ts") continue;
        for (const text of relayCopy) {
          expect(s.code.includes(text), `${s.name} hard-codes "${text}"`).toBe(
            false,
          );
        }
        for (const re of fragments) {
          expect(s.code, s.name).not.toMatch(re);
        }
      }
    });

    it("names no radio, walkie-talkie or internet call in relay copy", () => {
      const all = copyStrings(copy);
      const relayCopy = [
        ...copyStrings(copy.relay),
        ...copyStrings(copy.slip.notices.unreadable),
        ...copyStrings(copy.slip.notices["relay-failed"]),
        ...all.filter((t) => /pass(ed)? (it )?on|\bhops?\b|relay/i.test(t)),
      ];
      expect(relayCopy.length).toBeGreaterThan(10);
      for (const text of relayCopy) {
        expect(text).not.toMatch(/\bradio|walkie|internet[\s-]*calls?/i);
      }
    });
  });

  describe("limits come from plaintextCapacity", () => {
    it("has no 134 anywhere in src/ui sources", () => {
      for (const s of ui) {
        expect(s.code, s.name).not.toMatch(/(?<![\d.])134(?![\d.]|px)/);
      }
    });

    it("has no numeric limit of 128 or 140 in production code", () => {
      // transport-conformance.ts is test support (the shared contract suite).
      for (const s of uiCode) {
        if (s.base === "transport-conformance.ts") continue;
        expect(s.code, s.name).not.toMatch(/(?<![\d.])(128|140)(?![\d.])/);
      }
    });
  });

  describe("manifest colour and fonts", () => {
    it("pins the manifest colour constant to the --bg Token", () => {
      const config = readFileSync(join(rootDir, "vite.config.ts"), "utf8");
      const tokens = readFileSync(join(uiDir, "styles", "tokens.css"), "utf8");
      const constant = /BG_TOKEN_VALUE\s*=\s*"(#[0-9a-fA-F]{6})"/.exec(config);
      const bg = /^\s*--bg:\s*(#[0-9a-fA-F]{6})\s*;/m.exec(tokens);
      expect(constant?.[1]).toBeDefined();
      expect(constant?.[1]?.toLowerCase()).toBe(bg?.[1]?.toLowerCase());
      expect(config).toMatch(/theme_color:\s*BG_TOKEN_VALUE/);
      expect(config).toMatch(/background_color:\s*BG_TOKEN_VALUE/);
    });

    it("has every listed woff2 file and a license file per family", () => {
      const css = readFileSync(join(uiDir, "styles", "fonts.css"), "utf8");
      const urls = [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(
        (m) => m[1] ?? "",
      );
      // Barlow 600, 700; Plex Sans 400, 500, 600; Plex Mono 400, 500, 600, 700.
      expect(urls.length).toBe(9);
      for (const url of urls) {
        expect(url, url).toMatch(/\.woff2$/);
        expect(url, url).not.toMatch(/^[a-z]+:|^\/\//i);
        const file = resolve(uiDir, "styles", url);
        expect(existsSync(file), `${url} exists`).toBe(true);
      }
      for (const family of [
        "barlow-condensed",
        "ibm-plex-sans",
        "ibm-plex-mono",
      ]) {
        expect(
          existsSync(join(uiDir, "fonts", `${family}-OFL.txt`)),
          family,
        ).toBe(true);
      }
    });

    it("names no remote font in any CSS file", () => {
      for (const s of ui.filter((f) => f.base.endsWith(".css"))) {
        expect(s.code, s.name).not.toMatch(/https?:\/\/|\/\/fonts\./);
        expect(s.code, s.name).not.toMatch(/fonts\.(googleapis|gstatic)/);
      }
    });
  });
});
