import { readFileSync } from "node:fs";
import fc from "fast-check";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import type { SpectrumSource } from "../../audio/index";
import { scopeWindow, warmUpFrame } from "../model/scope-map";
import { Scope } from "./Scope";
import {
  axisTicks,
  binForRow,
  buildPalette,
  parseHex,
  SCOPE_HEIGHT,
  scopeMode,
  warmUpRowIndex,
} from "./scope-draw";

const render = (p: Partial<Parameters<typeof Scope>[0]> = {}) =>
  renderToString(
    h(Scope, {
      source: null,
      window: scopeWindow("room"),
      power: "on",
      reducedMotion: false,
      ...p,
    }),
  );

describe("scopeMode", () => {
  it("power off wins: static even during warm-up conditions", () => {
    expect(
      scopeMode({ power: "off", hasSource: true, reducedMotion: false }),
    ).toBe("static");
  });
  it("warms up during the self-test, and skips it under reduced motion", () => {
    expect(
      scopeMode({ power: "selftest", hasSource: false, reducedMotion: false }),
    ).toBe("warmup");
    expect(
      scopeMode({ power: "selftest", hasSource: true, reducedMotion: true }),
    ).toBe("live");
  });
  it("draws live with an analyser and static without one", () => {
    expect(
      scopeMode({ power: "on", hasSource: true, reducedMotion: false }),
    ).toBe("live");
    expect(
      scopeMode({ power: "on", hasSource: false, reducedMotion: true }),
    ).toBe("static");
  });
});

describe("scope-draw helpers", () => {
  it("parses hex and rejects other text", () => {
    expect(parseHex(" #0a0b0c ")).toEqual([10, 11, 12]);
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("red")).toBeNull();
  });
  it("palette runs from dark to bright", () => {
    const p = buildPalette([0, 0, 0], [100, 200, 50]);
    expect([...p.subarray(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...p.subarray(255 * 4, 255 * 4 + 4)]).toEqual([100, 200, 50, 255]);
  });
  it("top row shows the highest bin and bottom row the lowest", () => {
    expect(binForRow(0, 184, { lo: 10, hi: 90 })).toBe(90);
    expect(binForRow(183, 184, { lo: 10, hi: 90 })).toBe(10);
  });
  it("ticks span the window", () => {
    expect(axisTicks(12000, 20000)).toEqual([
      12000, 14000, 16000, 18000, 20000,
    ]);
  });
  it("warm-up rows are brightest at the centre line and dark outside the region", () => {
    const f = warmUpFrame(0.5, SCOPE_HEIGHT);
    expect(warmUpRowIndex(f.centerRow, f)).toBe(255);
    expect(warmUpRowIndex(f.top - 1, f)).toBe(0);
    expect(warmUpRowIndex(f.bottom + 1, f)).toBe(0);
    expect(warmUpRowIndex(f.top, f)).toBeGreaterThan(0);
  });
  it("binForRow stays inside the range for any row", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -5, max: 400 }),
        fc.integer({ min: 2, max: 400 }),
        fc.integer({ min: 0, max: 500 }),
        fc.integer({ min: 0, max: 500 }),
        (row, height, a, b) => {
          const range = { lo: Math.min(a, b), hi: Math.max(a, b) };
          const bin = binForRow(row, height, range);
          return bin >= range.lo && bin <= range.hi;
        },
      ),
    );
  });
});

describe("Scope markup", () => {
  const source: SpectrumSource = {
    fftSize: 2048,
    frequencyBinCount: 1024,
    sampleRate: 48000,
    getByteFrequencyData() {
      throw new Error("render must not read the analyser");
    },
  };

  it("renders a canvas and axis labels for Room", () => {
    const html = render({ source });
    expect(html).toContain("<canvas");
    expect(html).toContain("8k");
    expect(html).toContain('data-mode="live"');
  });
  it("marks the active band with two lines", () => {
    const html = render({ window: scopeWindow("call") });
    expect(html.match(/scope-band-line/g)?.length).toBe(2);
  });
  it("shows static and still draws the active band lines while the power is off (21.20)", () => {
    for (const channel of ["room", "call", "quiet"] as const) {
      const html = render({
        power: "off",
        source,
        window: scopeWindow(channel),
      });
      expect(html).toContain('data-mode="static"');
      expect(html.match(/scope-band-line/g)?.length, channel).toBe(2);
    }
  });
  it("draws the band lines in the --scope-band Token", () => {
    const css = readFileSync(
      new URL("../styles/scope.css", import.meta.url),
      "utf8",
    );
    // Filled box, not a border: Chromium snaps border widths to whole device pixels.
    const rule = (/\.scope-band-line\s*{([^}]*)}/.exec(css)?.[1] ?? "").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    expect(rule).toMatch(/height: var\(--scope-band-weight\);/);
    expect(rule).toMatch(/background: var\(--scope-band\);/);
    expect(rule).not.toMatch(/border/);
    // Figma "Band lines" layer: light/led-amber (= --amber) at 60%, 1.5 px high.
    const tokens = readFileSync(
      new URL("../styles/tokens.css", import.meta.url),
      "utf8",
    );
    const decls = (name: string) =>
      [...tokens.matchAll(new RegExp(`--${name}:\\s*([^;]+);`, "g"))].map((m) =>
        m[1]?.trim(),
      );
    // One definition each, in the same-in-both-modes group, so Beige 96 cannot override it.
    expect(decls("scope-band")).toEqual([
      "color-mix(in srgb, var(--amber) 60%, transparent)",
    ]);
    expect(decls("scope-band-weight")).toEqual(["1.5px"]);
    expect(decls("scope-band-caption")).toEqual(["#6b8d77"]);
    const beige = tokens.slice(tokens.indexOf('[data-theme="beige"]'));
    expect(beige).not.toMatch(/--scope-band|--amber:/);
  });
  it("suppresses the warm-up when off and uses it in the self-test", () => {
    expect(render({ power: "selftest" })).toContain('data-mode="warmup"');
    expect(render({ power: "off" })).not.toContain('data-mode="warmup"');
  });
  it("shows static for a null analyser", () => {
    expect(render({ source: null })).toContain('data-mode="static"');
  });
  it("uses the Quiet window labels", () => {
    expect(render({ window: scopeWindow("quiet") })).toContain("20k");
  });
});

describe("Scope source files", () => {
  const colour = /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/;
  it("contain no colour literal", () => {
    for (const f of ["Scope.tsx", "scope-draw.ts", "../styles/scope.css"]) {
      const text = readFileSync(new URL(f, import.meta.url), "utf8");
      // Doc comments mention "#rrggbb"; strip comments first.
      const code = text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      expect(code.replace(/"#rrggbb"/g, ""), f).not.toMatch(colour);
    }
  });
  it("never references the red Tokens", () => {
    const css = readFileSync(
      new URL("../styles/scope.css", import.meta.url),
      "utf8",
    );
    expect(css).not.toMatch(/--sos|--print-sos|--ink-on-sos/);
  });
});
