import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Offline guard: the app makes no network calls at runtime.
// Scans every non-test file under src for network APIs and remote URLs.

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const TEST_FILE = /\.test\.[cm]?[jt]sx?$/;

const FORBIDDEN: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: "fetch(", pattern: /\bfetch\s*\(/ },
  { name: "XMLHttpRequest", pattern: /XMLHttpRequest/ },
  { name: "WebSocket", pattern: /WebSocket/ },
  { name: "EventSource", pattern: /EventSource/ },
  { name: "navigator.sendBeacon", pattern: /navigator\s*\.\s*sendBeacon/ },
  { name: "http(s):// URL", pattern: /https?:\/\//i },
  {
    name: "remote @import",
    pattern: /@import\s+(?:url\(\s*)?['"]?(?:https?:)?\/\//i,
  },
];

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(full));
    } else if (entry.isFile() && !TEST_FILE.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe("offline guard", () => {
  it("finds non-test source files to scan", () => {
    expect(listSourceFiles(SRC_DIR).length).toBeGreaterThan(0);
  });

  it("has no network APIs, remote URLs or remote @imports in non-test files under src", () => {
    const violations: string[] = [];
    for (const file of listSourceFiles(SRC_DIR)) {
      const lines = readFileSync(file, "utf8").split(/\r?\n/);
      lines.forEach((line, i) => {
        for (const { name, pattern } of FORBIDDEN) {
          if (pattern.test(line)) {
            const rel = relative(SRC_DIR, file).replaceAll("\\", "/");
            violations.push(`src/${rel}:${i + 1} contains ${name}`);
          }
        }
      });
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
