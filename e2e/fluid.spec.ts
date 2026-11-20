import { expect, type Page, test } from "@playwright/test";

// Requirement 22 (Property 20): the device fills the viewport minus a 10 px gutter on each side,
// up to 430 px, and every part stretches to the faceplate content width. Figma sizes hold at 390.
const WIDTHS = [360, 375, 390, 430] as const;
const HEIGHT = 844;
const TOL = 1;
// A sub-pixel allowance for "inside a box" (layout rounds to 1/64 px).
const EPS = 0.5;

/** Parts that stretch to the faceplate content box (22.4), and everything drawn inside them. */
const PARTS = [
  ".faceplate-header",
  ".part-status",
  ".status-window",
  ".part-scope",
  ".scope",
  ".part-channel-block",
  ".channel-switch",
  ".channel-note",
  ".message-block",
  ".message-well",
  ".byte-meter",
  ".actions-row",
  ".transmit-key",
  ".part-tape",
  ".tape",
  ".listen-latch",
];
/** Chassis details inside the faceplate: they sit in its padding, so they are checked against its border box. */
const PLATE_DETAILS = [".chassis-corner", ".signal-line", ".signal-vias"];
/** Chassis details on the device body, checked against the device box. */
const DEVICE_DETAILS = [
  ".chassis-rail-dimple",
  ".chassis-rail-slot",
  ".chassis-bottom-grille",
];

/** Live app on the FakeTransport (vite dev), first-run sheet skipped, powered on, with a draft. */
async function openPoweredWithDraft(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: HEIGHT });
  await page.goto("/");
  await page.locator(".device").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.locator("[data-sheet]")).toHaveCount(0);
  await page.getByRole("switch", { name: "Power" }).click();
  await expect(page.locator(".status-code")).toHaveText("OK");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Water at the north shelter until 6");
  await expect(
    page.locator('.byte-meter-segment:not([data-color="off"])').first(),
  ).toBeVisible();
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

async function measure(page: Page) {
  return page.evaluate(
    ({ parts, plateDetails, deviceDetails }) => {
      const box = (el: Element): Box => {
        const b = el.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      };
      const device = document.querySelector(".device");
      const plate = document.querySelector(".faceplate");
      const well = document.querySelector(".message-well");
      if (!device || !plate || !well) throw new Error("device parts missing");
      const cs = getComputedStyle(plate);
      const pb = box(plate);
      const content = {
        x: pb.x + Number.parseFloat(cs.paddingLeft) + Number.parseFloat(cs.borderLeftWidth),
        w:
          pb.w -
          Number.parseFloat(cs.paddingLeft) -
          Number.parseFloat(cs.paddingRight) -
          Number.parseFloat(cs.borderLeftWidth) -
          Number.parseFloat(cs.borderRightWidth),
      };
      const dcs = getComputedStyle(device);
      // Every part and every visible element drawn inside it, with its horizontal extent.
      const partEls = parts.flatMap((sel) => {
        const roots = Array.from(document.querySelectorAll(sel));
        return roots.flatMap((r) => [r, ...Array.from(r.querySelectorAll("*"))]);
      });
      const extents = (els: Element[]) =>
        els
          .map((el) => ({ el, b: box(el) }))
          .filter(({ b }) => b.w > 0 && b.h > 0)
          .map(({ el, b }) => ({
            name: `${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").split(" ").join(".")}`,
            left: b.x,
            right: b.x + b.w,
            top: b.y,
            bottom: b.y + b.h,
          }));
      const all = (sels: string[]) =>
        sels.flatMap((s) => Array.from(document.querySelectorAll(s)));
      return {
        vw: window.innerWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        device: box(device),
        devicePadding: [dcs.paddingLeft, dcs.paddingRight],
        plate: pb,
        platePadding: [cs.paddingLeft, cs.paddingRight],
        content,
        well: box(well),
        parts: extents(partEls),
        partCount: parts.map((s) => document.querySelectorAll(s).length),
        plateDetails: extents(all(plateDetails)),
        deviceDetails: extents(all(deviceDetails)),
        railRight: (() => {
          const slot = document.querySelector(".chassis-rail-slot");
          return slot ? box(device).x + box(device).w - (box(slot).x + box(slot).w) : null;
        })(),
      };
    },
    { parts: PARTS, plateDetails: PLATE_DETAILS, deviceDetails: DEVICE_DETAILS },
  );
}

for (const width of WIDTHS) {
  test(`fluid layout at ${width} px: centred, no overflow, parts inside the faceplate`, async ({
    page,
  }) => {
    await openPoweredWithDraft(page, width);
    const m = await measure(page);
    console.log(
      `[fluid ${width}] device=${m.device.w} faceplate=${m.plate.w} content=${m.content.w} well=${m.well.w} gutters=${m.device.x}/${m.vw - (m.device.x + m.device.w)} scrollWidth=${m.scrollWidth}`,
    );

    expect(m.vw).toBe(width);
    // Device: viewport minus a 10 px gutter each side, at most 430 px, centred (22.1, 22.6).
    expect(Math.abs(m.device.w - Math.min(width - 20, 430))).toBeLessThanOrEqual(EPS);
    const leftGutter = m.device.x;
    const rightGutter = m.vw - (m.device.x + m.device.w);
    expect(Math.abs(leftGutter - rightGutter), "gutters").toBeLessThanOrEqual(TOL);
    // No horizontal overflow (22.6).
    expect(m.scrollWidth).toBe(width);
    expect(m.clientWidth).toBe(width);
    // Paddings stay 15 and 18 (22.3); the faceplate fills the device minus its padding (22.2).
    expect(m.devicePadding).toEqual(["15px", "15px"]);
    expect(m.platePadding).toEqual(["18px", "18px"]);
    expect(Math.abs(m.plate.w - (m.device.w - 30))).toBeLessThanOrEqual(EPS);
    if (width === 390) {
      // Figma sizes at the 390 px Figma viewport (22.5).
      expect(Math.abs(m.device.w - 370)).toBeLessThanOrEqual(EPS);
      expect(Math.abs(m.plate.w - 340)).toBeLessThanOrEqual(EPS);
      expect(Math.abs(m.content.w - 304)).toBeLessThanOrEqual(EPS);
    }

    // Every part is present, and it and its contents stay inside the faceplate content box (22.4, 22.6).
    for (const [i, n] of m.partCount.entries()) {
      expect(n, `${PARTS[i]} rendered`).toBeGreaterThan(0);
    }
    const contentRight = m.content.x + m.content.w;
    const outside = m.parts.filter(
      (p) => p.left < m.content.x - EPS || p.right > contentRight + EPS,
    );
    expect(outside, "parts beyond the faceplate content box").toEqual([]);
    // The stretching parts fill the content width (22.4).
    const well = m.well;
    expect(Math.abs(well.x - m.content.x)).toBeLessThanOrEqual(EPS);
    expect(Math.abs(well.w - m.content.w)).toBeLessThanOrEqual(EPS);

    // Chassis details stay on the faceplate and on the device body.
    const plateRight = m.plate.x + m.plate.w;
    const plateBottom = m.plate.y + m.plate.h;
    expect(m.plateDetails.length).toBe(6);
    expect(
      m.plateDetails.filter(
        (d) =>
          d.left < m.plate.x - EPS ||
          d.right > plateRight + EPS ||
          d.top < m.plate.y - EPS ||
          d.bottom > plateBottom + EPS,
      ),
      "chassis details beyond the faceplate",
    ).toEqual([]);
    const deviceRight = m.device.x + m.device.w;
    const deviceBottom = m.device.y + m.device.h;
    expect(m.deviceDetails.length).toBe(3);
    expect(
      m.deviceDetails.filter(
        (d) =>
          d.left < m.device.x - EPS ||
          d.right > deviceRight + EPS ||
          d.top < m.device.y - EPS ||
          d.bottom > deviceBottom + EPS,
      ),
      "chassis details beyond the device",
    ).toEqual([]);
    // The side rail follows the right edge: 370 - 357.35 - 8.3 = 4.35 px in, at every width.
    expect(Math.abs((m.railRight ?? Number.NaN) - 4.35)).toBeLessThanOrEqual(TOL);

    // Canvas buffers follow the rendered size times devicePixelRatio (22.8). The ResizeObserver
    // updates them after layout, so wait on the canvas attributes themselves.
    const canvases = await page.evaluate(() =>
      Array.from(document.querySelectorAll("canvas")).map((c) => {
        const r = c.getBoundingClientRect();
        return { cls: c.className, cssW: r.width, cssH: r.height };
      }),
    );
    expect(canvases.length).toBeGreaterThan(0);
    expect(canvases.some((c) => c.cls === "scope-canvas")).toBe(true);
    for (const c of canvases) {
      await expect
        .poll(
          () =>
            page.evaluate((cls) => {
              const el = document.querySelector<HTMLCanvasElement>(`canvas.${cls}`);
              if (!el) return Number.POSITIVE_INFINITY;
              const r = el.getBoundingClientRect();
              const dpr = window.devicePixelRatio;
              return Math.max(
                Math.abs(el.width - Math.round(r.width * dpr)),
                Math.abs(el.height - Math.round(r.height * dpr)),
              );
            }, c.cls),
          { message: `${c.cls} buffer follows its rendered size` },
        )
        .toBeLessThanOrEqual(TOL);
    }
  });
}

test("fluid layout: the message well is wider at 430 px than at 375 px (22.7)", async ({
  page,
}) => {
  await openPoweredWithDraft(page, 375);
  const narrow = (await measure(page)).well.w;
  await page.setViewportSize({ width: 430, height: HEIGHT });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.clientWidth))
    .toBe(430);
  const wide = (await measure(page)).well.w;
  console.log(`[fluid well] 375=${narrow} 430=${wide}`);
  expect(wide).toBeGreaterThan(narrow);
});
