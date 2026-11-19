import { readFileSync } from "node:fs";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { Led } from "./Led";

const css = readFileSync("src/ui/components/Led.css", "utf8");

describe("Led", () => {
  it("renders the four variants", () => {
    for (const color of ["green", "amber"] as const) {
      for (const on of [true, false]) {
        const html = renderToString(Led({ label: "MR", color, on }));
        expect(html).toContain(`data-color="${color}"`);
        expect(html).toContain(`data-on="${on}"`);
        expect(html).toContain(">MR<");
      }
    }
  });

  it("sets the sweep index only when given", () => {
    expect(
      renderToString(Led({ label: "AA", color: "green", on: true })),
    ).not.toContain("data-sweep");
    const html = renderToString(
      Led({ label: "AA", color: "green", on: true, sweepIndex: 3 }),
    );
    expect(html).toContain('data-sweep="true"');
    expect(html).toContain("--i:3");
  });

  it("lights the label with the lens", () => {
    expect(css).toMatch(
      /\[data-on="true"\] \.led-label\s*{[^}]*--led-label-on/,
    );
  });

  it("uses #040504 as the only literal colour and drops the sweep under reduced motion", () => {
    const literals = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(literals.length).toBeGreaterThan(0);
    expect(literals.every((l) => l === "#040504")).toBe(true);
    expect(css).not.toMatch(/rgba?\(/);
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none/);
  });
});
