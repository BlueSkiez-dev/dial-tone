import { expect, test } from "@playwright/test";
import { openGallery } from "./helpers";

// Sizes from docs/figma-source-map.md ("Reserved slots on the State 03 faceplate" and the
// component table): group key bar 304 x 76, quick keys 304 x 40, SOS 78 x 95, Transmit 210 x 72.
const SLOTS = {
  "group-key": { width: 304, height: 76 },
  "quick-keys": { width: 304, height: 40 },
  sos: { width: 78, height: 95 },
} as const;
const TRANSMIT = { width: 210, height: 72 };
const TOL = 1;

async function box(page: import("@playwright/test").Page, selector: string) {
  const r = await page.locator(selector).first().evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  });
  return r;
}

test("live app: the three slots measure 0 x 0 and Transmit fills its row", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".device").waitFor();
  for (const name of Object.keys(SLOTS)) {
    const s = await page
      .locator(`[data-slot="${name}"]`)
      .evaluate((el) => {
        const b = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          width: b.width,
          height: b.height,
          margin: cs.margin,
          padding: cs.padding,
        };
      });
    expect(s.width, `${name} width`).toBe(0);
    expect(s.height, `${name} height`).toBe(0);
    expect(s.margin, `${name} margin`).toBe("0px");
    expect(s.padding, `${name} padding`).toBe("0px");
  }
  const row = await box(page, ".actions-row");
  const tx = await box(page, ".transmit-key");
  expect(Math.abs(tx.width - row.width)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(tx.height - TRANSMIT.height)).toBeLessThanOrEqual(TOL);

  // The neighbours touch: the well ends where Transmit starts, and the channel block
  // ends one 20 px part gap above the message block (no extra gap for the group key slot).
  const well = await box(page, ".part-well");
  expect(Math.abs(tx.y - (well.y + well.height))).toBeLessThanOrEqual(TOL);
  const channel = await box(page, ".part-channel-block");
  const message = await box(page, ".message-block");
  expect(
    Math.abs(message.y - (channel.y + channel.height) - 20),
  ).toBeLessThanOrEqual(TOL);
});

for (const state of ["sos-held", "sos-received"]) {
  test(`${state}: each slot and Transmit return to their Figma size`, async ({
    page,
  }) => {
    await openGallery(page, state);
    for (const [name, size] of Object.entries(SLOTS)) {
      const b = await box(page, `[data-slot="${name}"]`);
      expect(
        Math.abs(b.width - size.width),
        `${name} width ${b.width}`,
      ).toBeLessThanOrEqual(TOL);
      expect(
        Math.abs(b.height - size.height),
        `${name} height ${b.height}`,
      ).toBeLessThanOrEqual(TOL);
    }
    const tx = await box(page, ".transmit-key");
    expect(Math.abs(tx.width - TRANSMIT.width)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(tx.height - TRANSMIT.height)).toBeLessThanOrEqual(TOL);
  });
}
