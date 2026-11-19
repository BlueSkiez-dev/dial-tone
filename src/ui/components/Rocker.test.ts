import { readFileSync } from "node:fs";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it, vi } from "vitest";
import { Rocker } from "./Rocker";

const css = readFileSync("src/ui/components/Rocker.css", "utf8");

describe("Rocker", () => {
  it("is a native button switch, so Space and Enter work", () => {
    const html = renderToString(Rocker({ on: false }));
    expect(html).toMatch(/^<button type="button"/);
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('data-on="false"');
  });

  it("reports On and the pulse prop", () => {
    const html = renderToString(Rocker({ on: true, pulseAmber: true }));
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('data-pulse="amber"');
    expect(renderToString(Rocker({ on: true }))).not.toContain("data-pulse");
  });

  it("calls onTap when clicked", () => {
    const onTap = vi.fn();
    const vnode = Rocker({ on: false, onTap });
    (vnode.props as { onClick: () => void }).onClick();
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("glows the I green when on and drops motion under reduced motion", () => {
    expect(css).toMatch(/\[data-on="true"\] \.rocker-i\s*{[^}]*var\(--green\)/);
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none/);
  });

  it("hard-codes no colour", () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? []).toEqual([]);
  });
});
