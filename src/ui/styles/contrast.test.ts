import { readFileSync } from "node:fs";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { Slip } from "../components/Slip";

/**
 * Requirements 21.14, 21.15: system slip ink reaches 4.5:1 on --paper-system; no stripe layer.
 * Requirement 21.6 (Property 17): the title fill reaches 3:1 on the faceplate.
 * Requirements 21.28 to 21.31 (Property 18): Update ready buttons are filled, label 4.5:1, boundary 3:1.
 */

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

type Lookup = (n: string) => string | undefined;

/**
 * Colour of a Token in one mode, following documented aliases (`--a: var(--b)`). Both rules sit on
 * the root element (data-theme is set on <html>), so an alias resolves with the same mode's values.
 */
function colour(get: Lookup, name: string): [number, number, number] {
  let current = name;
  for (let hops = 0; hops < 8; hops++) {
    const value = get(current);
    const alias =
      value === undefined ? null : /^var\((--[\w-]+)\)$/.exec(value);
    if (!alias?.[1]) return hex(current, value);
    current = alias[1];
  }
  throw new Error(`${name} has an alias loop`);
}

/**
 * Token pairs checked below (design.md "Contrast tests"). A renamed Token fails with "missing --name".
 * The faceplate behind the title is a gradient from --plate-hi (top) to --plate (55%); the title sits
 * between them, so both ends are checked.
 */
const CONTRAST_PAIRS = {
  title: {
    fill: "--title-fill",
    backgrounds: ["--plate", "--plate-hi"],
    min: 3,
  },
  slipButtons: [
    {
      label: "Later",
      fill: "--slip-button-later-fill",
      ink: "--slip-button-later-ink",
    },
    {
      label: "Restart now",
      fill: "--slip-button-restart-fill",
      ink: "--slip-button-restart-ink",
    },
  ],
  paper: "--paper-system",
} as const;

const read = (f: string) => readFileSync(f, "utf8");
const ruleOf = (src: string, selector: string) =>
  new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(src)?.[1] ?? "";

describe("Faceplate_Title contrast (21.6, Property 17)", () => {
  it("the title uses the fill Token and keeps the deboss Token", () => {
    const h1 = ruleOf(read("src/ui/styles/device.css"), "\\.wordmark h1");
    expect(h1).toMatch(
      new RegExp(`color: var\\(${CONTRAST_PAIRS.title.fill}\\)`),
    );
    expect(h1).toMatch(/text-shadow: var\(--shadow-title-deboss\)/);
  });

  for (const [mode, get] of Object.entries(modes)) {
    for (const bg of CONTRAST_PAIRS.title.backgrounds) {
      it(`${mode}: ${CONTRAST_PAIRS.title.fill} on ${bg} is at least 3:1`, () => {
        const ratio = contrastRatio(
          colour(get, CONTRAST_PAIRS.title.fill),
          colour(get, bg),
        );
        expect(ratio).toBeGreaterThanOrEqual(CONTRAST_PAIRS.title.min);
      });
    }
  }
});

describe("Update ready slip buttons (21.28 to 21.31, Property 18)", () => {
  for (const [mode, get] of Object.entries(modes)) {
    for (const b of CONTRAST_PAIRS.slipButtons) {
      it(`${mode}: ${b.label} label is at least 4.5:1 on its fill`, () => {
        const ratio = contrastRatio(colour(get, b.ink), colour(get, b.fill));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      });
      it(`${mode}: ${b.label} boundary (its fill, no border) is at least 3:1 on ${CONTRAST_PAIRS.paper}`, () => {
        const fill = colour(get, b.fill);
        const paper = colour(get, CONTRAST_PAIRS.paper);
        expect(fill).not.toEqual(paper);
        expect(contrastRatio(fill, paper)).toBeGreaterThanOrEqual(3);
      });
    }
  }

  it("draws each button filled from the Tokens, with no border and a Token shadow", () => {
    const slipCss = read("src/ui/components/Slip.css");
    const filled = ruleOf(slipCss, "\\.slip-button-filled");
    expect(filled).toMatch(/border: 0;/);
    expect(filled).toMatch(/box-shadow: var\(--shadow-slip-button\)/);
    for (const [look, b] of [
      ["later", CONTRAST_PAIRS.slipButtons[0]],
      ["restart", CONTRAST_PAIRS.slipButtons[1]],
    ] as const) {
      const rule = ruleOf(slipCss, `\\.slip-button-${look}`);
      expect(rule).toMatch(new RegExp(`background: var\\(${b.fill}\\)`));
      expect(rule).toMatch(new RegExp(`color: var\\(${b.ink}\\)`));
    }
    expect(token(root, "--shadow-slip-button")).toBe(
      "var(--shadow-keycap-lift)",
    );
  });

  it("renders both Update ready buttons with the filled class", () => {
    const html = renderToString(
      h(Slip, { slip: { kind: "update-ready", id: "u", at: 0 } }),
    );
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(2);
    for (const b of buttons) expect(b).toMatch(/slip-button-filled/);
  });

  it("follows aliases and reports a broken one clearly", () => {
    expect(colour(modes.Ghost, "--title-fill")).toEqual(
      colour(modes.Ghost, "--ink-2"),
    );
    expect(() => colour(() => "var(--nope)", "--x")).toThrow(/alias loop/);
    expect(() =>
      colour((n) => (n === "--x" ? "var(--y)" : undefined), "--x"),
    ).toThrow(/missing --y/);
  });
});

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
