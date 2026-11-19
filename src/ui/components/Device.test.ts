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

  it("gives the slots the Figma heights", () => {
    expect(css).toMatch(/\.slot-group-key\s*{[^}]*height: 76px/);
    expect(css).toMatch(/\.slot-quick-keys\s*{[^}]*height: 40px/);
    expect(css).toMatch(/\.slot-sos\s*{[^}]*height: 95px/);
  });

  it("uses the Figma sizes for device and faceplate", () => {
    expect(css).toMatch(/\.device\s*{[^}]*width: 370px/);
    expect(css).toMatch(/\.faceplate\s*{[^}]*width: 340px/);
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
