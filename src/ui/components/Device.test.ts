import { readFileSync } from "node:fs";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { Device } from "./Device";

const css = readFileSync("src/ui/styles/device.css", "utf8");

describe("Device frame", () => {
  const html = renderToString(Device({}));

  it("renders the three reserved slots empty", () => {
    for (const name of ["group-key", "quick-keys", "sos"]) {
      expect(html).toMatch(new RegExp(`data-slot="${name}"[^>]*></div>`));
    }
  });

  it("marks empty slots collapsed and drops the modifier when content is mounted", () => {
    expect(html.match(/slot-empty/g)?.length).toBe(3);
    expect(html).toContain("actions-row-solo");
    const full = renderToString(
      Device({ groupKey: "a", quickKeys: "b", sos: "c" }),
    );
    expect(full).not.toContain("slot-empty");
    expect(full).not.toContain("actions-row-solo");
    expect(css).toMatch(/\.slot\.slot-empty\s*{[^}]*width: 0;[^}]*height: 0/);
    expect(css).not.toMatch(/\.slot[^{]*{[^}]*display: none/);
  });

  it("puts the Figma spacing on the visible neighbours, not on collapsed slots", () => {
    expect(css).toMatch(
      /\.slot\.slot-empty\s*{[^}]*margin: 0;[^}]*padding: 0;[^}]*gap: 0/,
    );
    expect(css).toMatch(/\.actions-row\s*{[^}]*margin-top: 8px/);
    expect(css).toMatch(
      /\.slot-quick-keys:not\(\.slot-empty\)\s*{[^}]*margin-top: 8px/,
    );
    expect(css).not.toMatch(/\.part-tape\s*{[^}]*margin-top: 44px/);
  });
  it("gives the slots the Figma heights", () => {
    expect(css).toMatch(/\.slot-group-key\s*{[^}]*height: 76px/);
    expect(css).toMatch(/\.slot-quick-keys\s*{[^}]*height: 40px/);
    expect(css).toMatch(/\.slot-sos\s*{[^}]*height: 95px/);
  });

  it("is fluid: 10 px page gutter, device up to 430 px, paddings 15 and 18 (requirement 22)", () => {
    // 370 and 340 px at a 390 px viewport come from these rules (checked in e2e/fluid.spec.ts).
    expect(css).toMatch(
      /\.page\s*{[^}]*max\(10px, env\(safe-area-inset-right\)\)/,
    );
    expect(css).toMatch(/\.device\s*{[^}]*width: 100%;[^}]*max-width: 430px/);
    expect(css).toMatch(/\.device\s*{[^}]*padding: 17px 15px/);
    expect(css).toMatch(
      /\.faceplate\s*{[^}]*width: 100%;[^}]*padding: 26px 18px 28px/,
    );
    // No fixed Figma widths remain for the device, faceplate or parts.
    expect(css).not.toMatch(/\bwidth: (370|340|304|210)px/);
  });

  it("hard-codes no hex colour", () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });

  it("App hosts the device and the sheet host", () => {
    const page = renderToString(App({}));
    expect(page).toContain("sheet-host");
    expect(page).toContain("Dial Tone");
  });
});
