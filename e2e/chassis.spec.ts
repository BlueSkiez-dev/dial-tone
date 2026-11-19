import { expect, test } from "@playwright/test";
import { openGallery } from "./helpers";

// Values from docs/figma-source-map.md ("Chassis details (Figma_Main)"). Screw boxes are the
// rotated bounding boxes of the 13 px screws, relative to the faceplate (Figma 182:8).
const TOL = 1;
const SCREWS = {
  tl: { rot: 12, size: 15.419, left: 6.79, top: 6.79 },
  tr: { rot: 41, size: 18.34, right: 340 - 316.33 - 18.34, top: 5.33 },
  bl: { rot: 67, size: 17.046, left: 5.98, bottom: 1581 - 1557.99 - 17.046 },
  br: { rot: 24, size: 17.164, right: 340 - 316.92 - 17.164, bottom: 1581 - 1557.93 - 17.164 },
} as const;

test("chassis: corner screws, side rail, bottom grille and the POWER label sit where Figma has them", async ({
  page,
}) => {
  await openGallery(page, "ready");
  const m = await page.evaluate(() => {
    const r = (el: Element | null) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    };
    const device = document.querySelector(".device");
    const plate = document.querySelector(".faceplate");
    return {
      device: r(device),
      plate: r(plate),
      screws: Object.fromEntries(
        ["tl", "tr", "bl", "br"].map((c) => [
          c,
          r(document.querySelector(`.chassis-corner-${c}`)),
        ]),
      ),
      slot: r(document.querySelector(".chassis-rail-slot")),
      dimple: r(document.querySelector(".chassis-rail-dimple")),
      grille: r(document.querySelector(".chassis-bottom-grille")),
      grilleSlots: document.querySelectorAll(".chassis-grille-slot").length,
      rocker: r(document.querySelector(".rocker")),
      label: r(document.querySelector(".power-label")),
      labelText: getComputedStyle(
        document.querySelector(".power-label") as Element,
      ).textTransform,
    };
  });
  const { device, plate } = m;
  if (!device || !plate) throw new Error("device missing");

  for (const [corner, s] of Object.entries(SCREWS)) {
    const b = m.screws[corner];
    if (!b) throw new Error(`screw ${corner} missing`);
    expect(Math.abs(b.w - s.size), `${corner} size`).toBeLessThanOrEqual(TOL);
    if ("left" in s) {
      expect(Math.abs(b.x - plate.x - s.left), `${corner} left`).toBeLessThanOrEqual(TOL);
    } else {
      expect(
        Math.abs(plate.x + plate.w - (b.x + b.w) - s.right),
        `${corner} right`,
      ).toBeLessThanOrEqual(TOL);
    }
    if ("top" in s) {
      expect(Math.abs(b.y - plate.y - s.top), `${corner} top`).toBeLessThanOrEqual(TOL);
    } else {
      expect(
        Math.abs(plate.y + plate.h - (b.y + b.h) - s.bottom),
        `${corner} bottom`,
      ).toBeLessThanOrEqual(TOL);
    }
  }

  // Side rail: slot 358 px from the chassis left, top at 34% of its height, 7 x 78 (stroke 1.3 px outside).
  const slot = m.slot;
  const dimple = m.dimple;
  if (!slot || !dimple) throw new Error("rail missing");
  expect(Math.abs(slot.x - device.x - 357.35)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(slot.y - device.y - (0.34 * device.h - 0.65))).toBeLessThanOrEqual(TOL);
  expect(Math.abs(slot.w - 8.3)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(slot.h - 79.3)).toBeLessThanOrEqual(TOL);
  // Dimple: centre at (361.5, 30% of the height), radius 3.6 (stroke 1.3 px outside).
  expect(Math.abs(dimple.x + dimple.w / 2 - device.x - 361.5)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(dimple.y + dimple.h / 2 - device.y - 0.3 * device.h)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(dimple.w - 8.5)).toBeLessThanOrEqual(TOL);

  // Bottom grille: 18 slots, 9 px apart, starting 105 px from the left, 4 px above the bottom edge.
  const grille = m.grille;
  if (!grille) throw new Error("grille missing");
  expect(m.grilleSlots).toBe(18);
  expect(Math.abs(grille.x - device.x - 105)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(grille.w - (17 * 9 + 5))).toBeLessThanOrEqual(TOL);
  expect(Math.abs(device.y + device.h - (grille.y + grille.h) - 4)).toBeLessThanOrEqual(TOL);

  // POWER label: 6 px below the rocker, centred on it, uppercase.
  const rocker = m.rocker;
  const label = m.label;
  if (!rocker || !label) throw new Error("power label missing");
  expect(Math.abs(label.y - (rocker.y + rocker.h) - 6)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(label.x + label.w / 2 - (rocker.x + rocker.w / 2))).toBeLessThanOrEqual(TOL);
  expect(m.labelText).toBe("uppercase");
});

test("chassis: grille ticks sit on the selected channel key only", async ({
  page,
}) => {
  for (const [state, key] of [
    ["ready", "room"],
    ["call", "call"],
    ["quiet", "quiet"],
  ] as const) {
    await openGallery(page, state);
    const m = await page.evaluate(() => {
      const thumb = document.querySelector(".channel-thumb");
      const ticks = document.querySelectorAll(".grille-tick");
      const t = thumb?.getBoundingClientRect();
      const pos = Array.from(
        document.querySelectorAll(".channel-position"),
      ).map((p) => p.querySelectorAll(".grille-tick").length);
      return {
        key: (thumb as HTMLElement | null)?.dataset.key,
        ticks: ticks.length,
        inThumb: thumb?.querySelectorAll(".grille-tick").length,
        pos,
        thumb: t ? { x: t.x, y: t.y, w: t.width } : null,
        first: ticks[0]?.getBoundingClientRect().x,
        last: ticks[ticks.length - 1]?.getBoundingClientRect().x,
        top: document.querySelector(".grille-ticks")?.getBoundingClientRect().y,
      };
    });
    expect(m.key).toBe(key);
    expect(m.ticks).toBe(7);
    expect(m.inThumb).toBe(7);
    expect(m.pos).toEqual([0, 0, 0]);
    if (!m.thumb || m.first === undefined || m.last === undefined || m.top === undefined) {
      throw new Error("ticks missing");
    }
    // 4 px spacing, 26 px strip centred on the 98 px key, 7 px from its top.
    expect(Math.abs(m.last - m.first - 24)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(m.first - (m.thumb.x + 36))).toBeLessThanOrEqual(TOL);
    expect(Math.abs(m.top - (m.thumb.y + 7))).toBeLessThanOrEqual(TOL);
  }
});

test("chassis: Sheet screws are 13 px", async ({ page }) => {
  await openGallery(page, "onboarding-1");
  const sizes = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".sheet-screw")).map(
      (s) => [s.offsetWidth, s.offsetHeight, getComputedStyle(s).borderRadius],
    ),
  );
  expect(sizes).toHaveLength(2);
  for (const [w, h] of sizes) {
    expect(w).toBe(13);
    expect(h).toBe(13);
  }
});

test("scope: the self-test warm-up is one contiguous bright region, never stripes", async ({
  page,
}) => {
  // Fake clock: the warm-up advances only when the test runs it forward, so the three samples are exact.
  await page.clock.install();
  await openGallery(page, "selftest");
  const runsAt = async () =>
    page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>(".scope-canvas");
      const ctx = c?.getContext("2d");
      if (!c || !ctx) throw new Error("scope canvas missing");
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      const bright: boolean[] = [];
      for (let y = 0; y < c.height; y++) {
        let sum = 0;
        for (let x = 0; x < c.width; x++) sum += data[(y * c.width + x) * 4 + 1] ?? 0;
        bright.push(sum / c.width > 40);
      }
      let runs = 0;
      for (let y = 0; y < bright.length; y++) {
        if (bright[y] && !bright[y - 1]) runs++;
      }
      return { runs, lit: bright.filter(Boolean).length };
    });
  const samples = [await runsAt()];
  await page.clock.runFor(150);
  samples.push(await runsAt());
  await page.clock.runFor(600);
  samples.push(await runsAt());
  for (const s of samples) expect(s.runs).toBeLessThanOrEqual(1);
  expect(samples[2]?.lit ?? 0).toBeGreaterThanOrEqual(samples[0]?.lit ?? 0);
});

test("scope: the active band lines show in --scope-band while the power is off", async ({
  page,
}) => {
  await openGallery(page, "off");
  const m = await page.evaluate(() => {
    const token = getComputedStyle(document.documentElement)
      .getPropertyValue("--scope-band")
      .trim();
    // Resolve the Token to the rgb() string the browser reports for a border colour.
    const probe = document.createElement("i");
    probe.style.color = token;
    document.body.append(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    const screen = document.querySelector(".scope-screen")?.getBoundingClientRect();
    const lines = Array.from(document.querySelectorAll(".scope-band-line")).map(
      (el) => {
        const b = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          color: cs.borderTopColor,
          width: cs.borderTopWidth,
          opacity: cs.opacity,
          visibility: cs.visibility,
          y: b.y,
          inside: !!screen && b.y >= screen.y && b.y <= screen.y + screen.height,
        };
      },
    );
    return {
      rgb,
      lines,
      standby: !!document.querySelector(".scope-standby"),
    };
  });
  expect(m.standby).toBe(true);
  expect(m.lines).toHaveLength(2);
  for (const l of m.lines) {
    expect(l.color).toBe(m.rgb);
    expect(l.width).toBe("1px");
    expect(l.opacity).toBe("1");
    expect(l.visibility).toBe("visible");
    expect(l.inside).toBe(true);
  }
  expect(m.lines[0]?.y).toBeLessThan(m.lines[1]?.y ?? 0);
});

// Source_Map "Message well count and divider (Figma_Main)": positions relative to the Message
// block (Figma Section 182:130), whose first 22 px are the caption row 182:131.
test("message well: byte count and meter row sit where Figma_Main has them; no divider", async ({
  page,
}) => {
  await openGallery(page, "ready");
  const m = await page.evaluate(() => {
    const r = (sel: string) => {
      const b = document.querySelector(sel)?.getBoundingClientRect();
      return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
    };
    const well = document.querySelector(".message-well");
    return {
      block: r(".message-block"),
      well: r(".message-well"),
      count: r(".byte-meter-count-row"),
      meter: r(".byte-meter"),
      segs: r(".byte-meter-segments"),
      air: r(".byte-meter-airtime"),
      borders: [".message-well-field", ".byte-meter"].map((s) => {
        const cs = getComputedStyle(document.querySelector(s) as Element);
        return [cs.borderTopWidth, cs.borderBottomWidth];
      }),
      rules: well?.querySelectorAll("hr, [role=separator]").length,
    };
  });
  const { block, well, count, meter, segs, air } = m;
  if (!block || !well || !count || !meter || !segs || !air) {
    throw new Error("message well parts missing");
  }
  // Byte count 182:135: right edge 4 px in from the block edge, y 5.5 to 16.5 in the caption row.
  expect(Math.abs(block.x + block.w - 4 - (count.x + count.w))).toBeLessThanOrEqual(TOL);
  expect(Math.abs(count.y - block.y - 5.5)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(count.h - 11)).toBeLessThanOrEqual(TOL);
  // Meter row 182:140: 32 px high at the bottom of the 123.39 px well (213:258: y 91.39).
  expect(Math.abs(well.h - 123.39)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(meter.y - well.y - 91.39)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(meter.h - 32)).toBeLessThanOrEqual(TOL);
  // Segments 213:259 at (14, 9), 6 high. Airtime 213:284 at (196, 4), 16 high, ends 14 px in.
  expect(Math.abs(segs.x - meter.x - 14)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(segs.y - meter.y - 9)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(segs.h - 6)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(segs.w - 170)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(air.x - meter.x - 196)).toBeLessThanOrEqual(TOL);
  expect(Math.abs(air.y - meter.y - 4)).toBeLessThanOrEqual(TOL);
  // Divider: Figma_Main draws no line between the text and the meter, and neither does the app.
  expect(m.borders).toEqual([
    ["0px", "0px"],
    ["0px", "0px"],
  ]);
  expect(m.rules).toBe(0);
});
