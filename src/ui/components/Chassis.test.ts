import { readFileSync } from "node:fs";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { ChannelSwitch } from "./ChannelSwitch";
import { BOTTOM_GRILLE_SLOTS, GRILLE_TICK_COUNT } from "./Chassis";
import { Device } from "./Device";
import { Rocker } from "./Rocker";
import { Onboarding1 } from "./SheetContent";

const noop = () => {};
const chassisCss = readFileSync("src/ui/components/Chassis.css", "utf8");
const deviceCss = readFileSync("src/ui/styles/device.css", "utf8");
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

describe("Chassis details (Figma_Main)", () => {
  const device = renderToString(Device({ power: Rocker({ on: false }) }));

  it("renders four corner screws, one per corner, with the Figma rotations", () => {
    for (const [corner, rot] of [
      ["tl", 12],
      ["tr", 41],
      ["bl", 67],
      ["br", 24],
    ] as const) {
      expect(device).toMatch(
        new RegExp(
          `chassis-screw chassis-corner chassis-corner-${corner}"[^>]*--screw-rot:\\s*${rot}deg`,
        ),
      );
    }
    expect(count(device, /chassis-corner chassis-corner-/g)).toBe(4);
  });

  it("renders the POWER label under the rocker, uppercase", () => {
    const at = device.indexOf('class="rocker"');
    const label = device.indexOf('class="power-label"');
    expect(at).toBeGreaterThan(-1);
    expect(label).toBeGreaterThan(at);
    expect(device).toMatch(/class="power-label"[^>]*>Power</);
    expect(chassisCss).toMatch(
      /\.power-label\s*{[^}]*text-transform: uppercase/,
    );
    expect(chassisCss).toMatch(/\.power-label\s*{[^}]*var\(--ink-2\)/);
    expect(deviceCss).toMatch(/\.power-slot\s*{[^}]*gap: 6px/);
  });

  it("draws the title with the --title-fill Token and the two-line Prototype_Reference deboss from Tokens (21.6)", () => {
    expect(deviceCss).toMatch(
      /\.wordmark h1\s*{[^}]*color: var\(--title-fill\)/,
    );
    expect(deviceCss).not.toMatch(/\.wordmark h1\s*{[^}]*var\(--emboss\)/);
    expect(deviceCss).toMatch(
      /\.wordmark h1\s*{[^}]*text-shadow: var\(--shadow-title-deboss\)/,
    );
    const tokens = readFileSync("src/ui/styles/tokens.css", "utf8");
    const shadow = /--shadow-title-deboss:\s*([^;]+);/.exec(tokens)?.[1] ?? "";
    // Two lines: light below (0 1px), dark above (0 -1px), both colours from Tokens.
    expect(shadow.split(/,\s*(?=0)/)).toHaveLength(2);
    expect(shadow).toMatch(/0 1px 0 var\(--title-deboss-light\)/);
    expect(shadow).toMatch(/0 -1px 0 var\(--title-deboss-dark\)/);
    expect(shadow).not.toMatch(/#|rgba?\(/);
    expect(tokens).toMatch(
      /--title-deboss-light:\s*rgba\(255, 255, 255, 0\.85\)/,
    );
    expect(tokens).toMatch(/--title-deboss-dark:\s*rgba\(0, 0, 0, 0\.3\)/);
    expect(deviceCss.match(/\.wordmark h1\s*{[^}]*}/)?.[0]).not.toMatch(
      /#[0-9a-f]{3,8}\b|rgba?\(/i,
    );
  });

  it("renders the side rail with only its dimple and slot, above the frosted shell (21.8)", () => {
    expect(count(device, /chassis-side-rail/g)).toBe(1);
    expect(count(device, /chassis-rail-dimple/g)).toBe(1);
    expect(count(device, /chassis-rail-slot/g)).toBe(1);
    // Not inside the blurred board layer: it follows the shell, so the shell blur cannot erase it.
    const shell = device.indexOf('class="device-shell"');
    const rail = device.indexOf('class="chassis-side-rail"');
    const plate = device.indexOf('class="faceplate"');
    expect(shell).toBeGreaterThan(-1);
    expect(rail).toBeGreaterThan(shell);
    expect(rail).toBeLessThan(plate);
    const rail0 = device.slice(rail, device.indexOf("</div>", rail));
    expect(count(rail0, /<span/g)).toBe(2);
    // Source_Map values, checked on the Figma_Screenshot of 182:5. Anchored to the right edge
    // (requirement 22.4): right = 370 - x - width, so x is 357.25 and 357.35 on the 370 px chassis.
    expect(chassisCss).toMatch(
      /\.chassis-rail-dimple\s*{[^}]*right: 4\.25px;[^}]*top: calc\(30% - 4\.25px\);[^}]*width: 8\.5px;[^}]*height: 8\.5px;[^}]*border: 1\.3px solid var\(--board-ink-rail\)/,
    );
    expect(chassisCss).toMatch(
      /\.chassis-rail-slot\s*{[^}]*right: 4\.35px;[^}]*top: calc\(34% - 0\.65px\);[^}]*width: 8\.3px;[^}]*height: 79\.3px;[^}]*border: 1\.3px solid var\(--board-ink-rail\)/,
    );
    expect(chassisCss).not.toMatch(
      /\.chassis-rail-(dimple|slot)\s*{[^}]*left:/,
    );
  });

  it("renders the bottom grille with the Source_Map slot count", () => {
    expect(BOTTOM_GRILLE_SLOTS).toBe(18);
    expect(count(device, /chassis-grille-slot/g)).toBe(BOTTOM_GRILLE_SLOTS);
  });

  it("draws grille ticks on exactly the selected key, following the selection", () => {
    for (const value of ["room", "call", "quiet"] as const) {
      const html = renderToString(ChannelSwitch({ value, onChange: noop }));
      expect(count(html, /class="grille-tick"/g)).toBe(GRILLE_TICK_COUNT);
      expect(count(html, /class="grille-ticks"/g)).toBe(1);
      expect(html).toContain(`class="channel-thumb" data-key="${value}"`);
      // The ticks sit inside the thumb, not inside any of the three positions.
      const thumb = html.slice(
        html.indexOf("channel-thumb"),
        html.indexOf("channel-position"),
      );
      expect(count(thumb, /grille-tick"/g)).toBe(GRILLE_TICK_COUNT);
      expect(
        count(html.slice(html.indexOf("channel-position")), /grille/g),
      ).toBe(0);
    }
  });

  it("draws Sheet screws at 13 px diameter, rotated and slotted", () => {
    const html = renderToString(Onboarding1({ onSkip: noop, onNext: noop }));
    expect(count(html, /class="chassis-screw sheet-screw /g)).toBe(2);
    expect(html).toMatch(/sheet-screw-left"[^>]*--screw-rot:\s*12deg/);
    expect(html).toMatch(/sheet-screw-right"[^>]*--screw-rot:\s*41deg/);
    expect(chassisCss).toMatch(
      /\.chassis-screw\s*{[^}]*width: 13px;[^}]*height: 13px/,
    );
    expect(chassisCss).toMatch(
      /\.chassis-screw::after\s*{[^}]*rotate\(90deg\)/,
    );
    const sheetCss = readFileSync("src/ui/components/Sheet.css", "utf8");
    expect(sheetCss).not.toMatch(/\.sheet-screw\s*{[^}]*(width|height): 10px/);
  });

  it("hard-codes no hex colour in the Chassis files", () => {
    expect(chassisCss.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(chassisCss).not.toMatch(/rgba?\(/);
  });
});
