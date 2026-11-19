import { expect, test } from "@playwright/test";
import { openGallery, type Snapshot, snapshot } from "./helpers";

// One row per GalleryName (src/ui/model/gallery.ts). The expected values follow the
// status table (requirement 8.3) applied to each fixture.
// `slips` is the number of slips on the Tape; 0 means the empty text shows.
interface Row {
  code: string;
  leds: string[];
  sheet?: string;
  lit?: number;
  over?: boolean;
  slips?: number;
}

const READY = { code: "OK", leds: ["MR", "AA"] };
const NO_CARRIER = { code: "NO CARRIER", leds: ["MR"] };
// State 12 and the denied sheets: Figma reads OK, AA dark.
const MIC_OFF = { code: "OK", leds: ["MR"] };

const ROWS: Record<string, Row> = {
  off: { code: "— — —", leds: [] },
  selftest: { code: "ATZ", leds: ["MR", "AA", "CD", "OH", "RD", "SD"] },
  ready: { ...READY, lit: 8 },
  sending: { code: "ATDT", leds: ["MR", "AA", "SD"], lit: 8 },
  hearing: { code: "CARRIER", leds: ["MR", "AA", "CD"] },
  received: { code: "CONNECT", leds: ["MR", "AA", "RD"], slips: 2 },
  "sos-held": { code: "ATDT", leds: ["MR", "AA"] },
  "sos-received": { code: "OK", leds: ["MR", "AA", "OH"] },
  call: { code: "OK", leds: ["MR", "AA", "OH"] },
  quiet: READY,
  "too-long": { ...READY, lit: 24, over: true },
  "mic-off": MIC_OFF,
  "not-listening": NO_CARRIER,
  "tape-expanded": { ...READY, slips: 5 },
  legend: READY,
  beige: { ...READY, slips: 1 }, // same slip as first-power; the reachability test compares them
  "onboarding-1": { code: "— — —", leds: [], sheet: "onboarding-1" },
  "onboarding-2": { code: "— — —", leds: [], sheet: "onboarding-2" },
  "onboarding-3": { code: "— — —", leds: [], sheet: "onboarding-3" },
  "first-power": { ...READY, slips: 1 }, // the "Listening while open" system slip (Figma New 04)
  "mic-denied": { ...MIC_OFF, sheet: "microphone" },
  "mic-reset": { ...MIC_OFF, sheet: "microphone" },
  "install-sheet": { ...READY, sheet: "install" },
  "install-notice": READY,
  "update-ready": { ...READY, slips: 1 },
};

for (const [name, row] of Object.entries(ROWS)) {
  test(`gallery ${name}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openGallery(page, name);

    const snap: Snapshot = await snapshot(page);
    expect(snap.code).toBe(row.code);
    expect(snap.leds).toEqual(row.leds);
    expect(snap.sheet).toBe(row.sheet ?? null);
    expect(snap.lit).toBe(row.lit ?? 0);
    expect(snap.over).toBe(row.over ?? false);

    // Tape heading, and the empty text when there is no paper.
    await expect(page.locator(".listen-latch-caption")).toHaveText("Tape");
    const slips = row.slips ?? 0;
    if (slips === 0) {
      await expect(page.locator(".tape-empty")).toHaveText(
        "No paper yet. Messages you send and hear print here, and anything you hear can be passed on to the next phone.",
      );
    } else {
      await expect(page.locator(".tape .slip")).toHaveCount(slips);
    }
    expect(errors).toEqual([]);
  });
}

test("gallery covers every GalleryName", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("src/ui/model/gallery.ts", "utf8");
  const block = /export type GalleryName =([\s\S]*?);/.exec(src)?.[1] ?? "";
  const names = [...block.matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
  expect(names.length).toBeGreaterThan(0);
  expect(names.sort()).toEqual(Object.keys(ROWS).sort());
});

test("gallery sos-held renders the SOS button with the ring part filled", async ({
  page,
}) => {
  await openGallery(page, "sos-held");
  await expect(page.locator(".sos-button")).toHaveAttribute(
    "data-state",
    "holding",
  );
  await expect(page.locator(".sos-progress")).toHaveAttribute(
    "data-fill",
    "0.600",
  );
});

test("gallery sos-received renders the SOS slip with its band", async ({
  page,
}) => {
  await openGallery(page, "sos-received");
  await expect(page.locator('.slip[data-kind="sos"]')).toHaveCount(1);
  await expect(page.locator(".sos-slip-band")).toHaveText("*** SOS ***");
  await expect(page.locator(".status-window [data-led='OH']")).toHaveAttribute(
    "data-on",
    "true",
  );
});

test("the live app (no state) renders no SOS parts", async ({ page }) => {
  await page.goto("/");
  await page.locator(".device").waitFor();
  await expect(page.locator(".sos-button")).toHaveCount(0);
  await expect(page.locator(".sos-slip-band")).toHaveCount(0);
  await expect(page.locator('.slip[data-kind="sos"]')).toHaveCount(0);
  await expect(page.locator(".sos-wrap")).toHaveCount(0);
});

test("an unknown ?state= falls back to the live app", async ({ page }) => {
  await page.goto("/?state=nope");
  await page.locator(".device").waitFor();
  await expect(page.locator(".sos-button")).toHaveCount(0);
});
