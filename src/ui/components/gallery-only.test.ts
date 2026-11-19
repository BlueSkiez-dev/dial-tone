import { readFileSync } from "node:fs";
import fc from "fast-check";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { GroupKeyBar } from "./GroupKeyBar";
import { QuickKeys } from "./QuickKeys";
import { SosButton, sosRingFill } from "./SosButton";

const read = (f: string) => readFileSync(`src/ui/components/${f}`, "utf8");
const RED = /--sos|--print-sos/;

describe("SosButton", () => {
  it("renders the three states, disabled only when disabled", () => {
    for (const state of ["default", "holding", "disabled"] as const) {
      const html = renderToString(SosButton({ state, progress: 0.5 }));
      expect(html).toContain(`data-state="${state}"`);
      expect(html.includes("disabled")).toBe(state === "disabled");
    }
  });

  it("ring fill follows progress only while holding, clamped", () => {
    expect(
      renderToString(SosButton({ state: "holding", progress: 0.5 })),
    ).toContain('data-fill="0.500"');
    expect(
      renderToString(SosButton({ state: "default", progress: 0.5 })),
    ).toContain('data-fill="0.000"');
    fc.assert(
      fc.property(fc.double({ noNaN: false }), (p) => {
        const f = sosRingFill(p);
        return f >= 0 && f <= 1;
      }),
    );
  });
});

describe("QuickKeys and GroupKeyBar", () => {
  it("quick keys show both labels", () => {
    const html = renderToString(QuickKeys({}));
    expect(html).toContain("I'm safe");
    expect(html).toContain("Location");
  });

  it("group key bar open and locked, text escaped", () => {
    expect(renderToString(GroupKeyBar({ state: "open" }))).toContain(
      "Anyone nearby can read",
    );
    const html = renderToString(
      GroupKeyBar({
        state: "locked",
        groupName: "<b>Shelter</b>",
        checkWords: ["a", "b", "c", "d", "e"],
      }),
    );
    expect(html).toContain("&lt;b>Shelter");
    expect(html).toContain("icon-padlock-closed.svg");
    expect(html.match(/group-key-word"/g)).toHaveLength(4);
  });

  it("red Tokens appear only in the SOS files", () => {
    for (const f of [
      "QuickKeys.css",
      "QuickKeys.tsx",
      "GroupKeyBar.css",
      "GroupKeyBar.tsx",
    ]) {
      expect(read(f)).not.toMatch(RED);
    }
    expect(read("SosButton.css")).toMatch(RED);
  });

  it("live App does not import the gallery-only components", () => {
    expect(read("App.tsx")).not.toMatch(/SosButton|QuickKeys|GroupKeyBar/);
  });
});
