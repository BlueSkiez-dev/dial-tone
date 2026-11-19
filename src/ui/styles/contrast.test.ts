import { readFileSync } from "node:fs";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { Slip } from "../components/Slip";

/** Requirements 21.14, 21.15: system slip ink reaches 4.5:1 on --paper-system; no stripe layer. */

const css = readFileSync("src/ui/styles/tokens.css", "utf8");

/** Body of the first rule whose selector is exactly `selector`. */
function ruleBody(selector: string): string {
  const m = new RegExp(`(?:^|\\n)${selector}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`tokens.css has no ${selector} rule`);
  return m[1] ?? "";
}

/** Value of `--name` in one rule body, or undefined. Only #rrggbb is supported. */
function token(body: string, name: string): string | undefined {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(body);
  return m?.[1]?.trim();
}

function hex(
  name: string,
  value: string | undefined,
): [number, number, number] {
  if (value === undefined) throw new Error(`tokens.css is missing ${name}`);
  const m = /^#([0-9a-f]{6})$/i.exec(value);
  if (!m?.[1]) {
    throw new Error(`${name} has unsupported format "${value}" (only #rrggbb)`);
  }
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

const root = ruleBody(":root");
const beige = ruleBody('\\[data-theme="beige"\\]');

/** Beige value of a token: its override in the beige rule, else the shared :root value. */
const modes = {
  Ghost: (n: string) => token(root, n),
  "Beige 96": (n: string) => token(beige, n) ?? token(root, n),
};

describe("System_Slip contrast", () => {
  for (const [mode, get] of Object.entries(modes)) {
    it(`${mode}: --print-system on --paper-system is at least 4.5:1`, () => {
      const ratio = contrastRatio(
        hex("--print-system", get("--print-system")),
        hex("--paper-system", get("--paper-system")),
      );
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("computes the known ratio of black on white as 21", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
  });

  it("reports a missing or unsupported token clearly", () => {
    expect(() => hex("--x", undefined)).toThrow(/missing --x/);
    expect(() => hex("--x", "rgba(0, 0, 0, 0.1)")).toThrow(
      /unsupported format/,
    );
  });
});

describe("System_Slip markup", () => {
  it("has no stripe class or stripe token", () => {
    const slips = [
      { kind: "system", id: "s", at: 0, noticeKey: "listening-open" },
      { kind: "update-ready", id: "u", at: 0 },
    ] as const;
    for (const slip of slips) {
      expect(renderToString(h(Slip, { slip }))).not.toMatch(/stripe/i);
    }
    expect(css).not.toMatch(/--[a-z-]*stripe/i);
    expect(readFileSync("src/ui/components/Slip.css", "utf8")).not.toMatch(
      /--[a-z-]*stripe|repeating-linear-gradient\(\s*135deg/i,
    );
  });
});
