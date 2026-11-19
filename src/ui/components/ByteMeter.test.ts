import { readFileSync } from "node:fs";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { meterView } from "../model/meter";
import { ByteMeter } from "./ByteMeter";
import { MessageWell } from "./MessageWell";

function colors(bytes: number, limit: number): string[] {
  const html = renderToString(h(ByteMeter, { view: meterView(bytes, limit) }));
  return [...html.matchAll(/data-color="(\w+)"/g)].map((m) => m[1] as string);
}

const css = ["ByteMeter.css", "MessageWell.css"]
  .map((f) => readFileSync(`src/ui/components/${f}`, "utf8"))
  .join("\n");

describe("ByteMeter", () => {
  it("lights 8 of 24 segments for 41 of 128", () => {
    const c = colors(41, 128);
    expect(c).toHaveLength(24);
    expect(c.filter((x) => x !== "off")).toHaveLength(8);
  });

  it("is positional at the limit: 1-19 ok, 20-24 warn", () => {
    const c = colors(128, 128);
    expect(c.slice(0, 19).every((x) => x === "ok")).toBe(true);
    expect(c.slice(19).every((x) => x === "warn")).toBe(true);
  });

  it("is all over at 129 of 128", () => {
    expect(colors(129, 128).every((x) => x === "over")).toBe(true);
  });

  it("shows the label, and Too long with a bold count when over", () => {
    const ok = renderToString(h(ByteMeter, { view: meterView(41, 128) }));
    expect(ok).toContain("41 / 128 B");
    const over = renderToString(h(ByteMeter, { view: meterView(129, 128) }));
    expect(over).toContain("Too long");
    expect(over).toMatch(/<b class="byte-meter-count">129<\/b>/);
  });

  it("puts the count in the caption row and Too long in the meter row (Figma 182:135, 213:317)", () => {
    expect(css).toMatch(
      /\.byte-meter-count-row\s*{[^}]*position: absolute;[^}]*right: 4px;[^}]*bottom: calc\(100% \+ 5\.5px\)/,
    );
    const over = renderToString(h(ByteMeter, { view: meterView(129, 128) }));
    expect(over).toContain(
      '<p class="byte-meter-label" aria-hidden="true">Too long</p>',
    );
    expect(over).not.toContain("byte-meter-airtime");
    const ok = renderToString(
      h(ByteMeter, { view: meterView(41, 128), airtime: "~2.2 s on air" }),
    );
    expect(ok).toContain("byte-meter-airtime");
    expect(ok).not.toContain("Too long");
  });
  it("uses no red token in markup or CSS", () => {
    const html = [
      colors(129, 128).join(),
      renderToString(h(ByteMeter, { view: meterView(129, 128) })),
    ].join();
    expect(html + css).not.toMatch(/--sos|--ink-on-sos|--print-sos/);
  });

  it("hard-codes no colour literal in CSS", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsl\(/);
  });
});

describe("MessageWell", () => {
  const base = { value: "", onInput: () => {}, meter: meterView(0, 128) };

  it("shows the airtime, or a dash while unknown", () => {
    expect(
      renderToString(h(MessageWell, { ...base, airtimeMs: 2200 })),
    ).toContain("~2.2 s on air");
    expect(
      renderToString(h(MessageWell, { ...base, airtimeMs: null })),
    ).toContain("— s on air");
  });

  it("does not limit typing and disables with the power off", () => {
    const html = renderToString(
      h(MessageWell, { ...base, airtimeMs: null, disabled: true }),
    );
    expect(html).not.toContain("maxlength");
    expect(html).toContain("disabled");
  });
});
