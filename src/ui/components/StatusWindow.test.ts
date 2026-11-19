import { readFileSync } from "node:fs";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it, vi } from "vitest";
import { initialState, reduce } from "../model/reducer";
import { statusView } from "../model/status";
import { codeText, StatusWindow } from "./StatusWindow";

const css = readFileSync("src/ui/components/StatusWindow.css", "utf8");

function render(power: "off" | "selftest" | "on", legendOpen = false) {
  let s = initialState(null);
  if (power !== "off") s = reduce(s, { type: "power-tap", now: 0 });
  if (power === "on") s = reduce(s, { type: "self-test-done", now: 600 });
  return renderToString(
    StatusWindow({ view: statusView(s, 1000), power, legendOpen }),
  );
}

describe("StatusWindow", () => {
  it("renders six LEDs in order with the off readout", () => {
    const html = render("off");
    const ids = [...html.matchAll(/data-led="(\w+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["MR", "AA", "CD", "OH", "RD", "SD"]);
    expect(html).not.toContain('data-on="true"');
    expect(html).toContain("— — —");
  });

  it("uses amber for CD and OH only", () => {
    const html = render("selftest");
    const amber = [
      ...html.matchAll(/data-led="(\w+)" data-color="amber"/g),
    ].map((m) => m[1]);
    expect(amber).toEqual(["CD", "OH"]);
    expect(html.match(/data-on="true"/g)).toHaveLength(6);
    expect(html).toContain("ATZ");
    expect(html).toContain('data-sweep="true"');
  });

  it("states that listening works only while the app is open and the screen is on", () => {
    // Listening hint text.
    const html = renderToString(
      StatusWindow({
        view: { ...statusView(initialState(null), 0), hintKey: "listening" },
        power: "on",
        legendOpen: false,
      }),
    );
    expect(html).toMatch(/only while the app is open and the screen is on/);
  });

  it("shows the legend only when open, with the six meanings", () => {
    expect(render("on")).not.toContain("status-legend");
    const html = render("on", true);
    for (const text of [
      "Ready",
      "Listening",
      "Hearing a signal",
      "Call mode",
      "Message received",
      "Sending",
    ]) {
      expect(html).toContain(`>${text}<`);
    }
    expect(html).toContain('aria-expanded="true"');
  });

  it("calls onLedTap from the LED button", () => {
    const onLedTap = vi.fn();
    const s = initialState(null);
    const vnode = StatusWindow({
      view: statusView(s, 0),
      power: "off",
      legendOpen: false,
      onLedTap,
    });
    const children = (
      vnode.props as {
        children: { type: unknown; props: { onClick?: () => void } }[];
      }
    ).children;
    const button = children.find((c) => c?.type === "button");
    button?.props.onClick?.();
    expect(onLedTap).toHaveBeenCalledTimes(1);
  });

  it("shows the airtime beside ATDT", () => {
    const view = {
      ...statusView(initialState(null), 0),
      code: "ATDT" as const,
      airtimeMs: 2200,
    };
    expect(codeText(view)).toBe("ATDT · 2.2 s");
    expect(codeText({ ...view, airtimeMs: null })).toBe("ATDT");
  });

  it("keeps phosphor on the readout and hard-codes no colour", () => {
    expect(css).toMatch(/\.status-code\s*{[^}]*var\(--phosphor\)/);
    expect(css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? []).toEqual([]);
  });
});
