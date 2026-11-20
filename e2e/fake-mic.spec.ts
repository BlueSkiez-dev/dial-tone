import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

// Audio-transport task 12.2: the built app hears the known Call frame from the
// fake microphone (tests/fixtures/call-known-frame.wav, looped by Chromium).
const sidecar = JSON.parse(
  readFileSync(
    new URL("../tests/fixtures/call-known-frame.json", import.meta.url),
    "utf8",
  ),
) as { wireHex: string };

const BODY_TEXT = "Dial Tone fixture";

interface HookEvent {
  kind: string;
  active?: boolean;
  wire?: Uint8Array;
}

function logPageErrors(page: Page): void {
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("console error:", m.text());
  });
}

/** Opens the app with the test hook, skips onboarding and powers on from a real tap. */
async function openAndPowerOn(page: Page): Promise<void> {
  await page.goto("?e2e=1");
  // Channel stays on Room (the default); power on from a real tap.
  const room = page.getByRole("radio", { name: /room/i });
  await expect(room).toHaveAttribute("aria-checked", "true");
  // First launch opens onboarding over the faceplate; skip it.
  await page.getByRole("dialog").getByRole("button", { name: "Skip" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("switch", { name: "Power" }).click();
  await expect(page.getByRole("switch", { name: "Power" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
}

/** Number of decoded frames the transport has reported so far. */
async function frameCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const hook = (
      window as unknown as { __dialtone: { events: HookEvent[] } }
    ).__dialtone;
    return hook.events.filter((e) => e.kind === "frame").length;
  });
}

test("fake microphone: the known Call frame is heard, carrier first", async ({
  page,
}) => {
  test.setTimeout(90_000);
  logPageErrors(page);
  await openAndPowerOn(page);

  // The Heard slip prints the decoded text.
  const heard = page.locator('article.slip[data-kind="heard"]');
  await expect(heard.first()).toContainText(BODY_TEXT, { timeout: 60_000 });

  // Frame bytes and event order, read from the test hook.
  const events = await page.evaluate(() => {
    const hook = (
      window as unknown as { __dialtone: { events: HookEvent[] } }
    ).__dialtone;
    return hook.events
      .filter((e) => e.kind === "carrier" || e.kind === "frame")
      .map((e) => ({
        kind: e.kind,
        active: e.active,
        hex:
          e.wire === undefined
            ? undefined
            : Array.from(e.wire as Uint8Array)
                .map((b) => b.toString(16).padStart(2, "0"))
                .join(""),
      }));
  });

  const firstFrame = events.findIndex((e) => e.kind === "frame");
  const firstCarrier = events.findIndex(
    (e) => e.kind === "carrier" && e.active === true,
  );
  expect(firstFrame).toBeGreaterThanOrEqual(0);
  expect(firstCarrier).toBeGreaterThanOrEqual(0);
  expect(firstCarrier).toBeLessThan(firstFrame);
  expect(events[firstFrame]?.hex).toBe(sidecar.wireHex);
});

// Relay task 6.18. The fixture frame is TEXT, hop 0, ttl 3, single frame (known-frame.ts).
// The pass-on plays to Chromium's audio output, which the fake mic (a file) never hears,
// so nothing here waits on hearing the relayed frame.
test("fake microphone: a heard frame is passed on once and stays passed on after a reload", async ({
  page,
}) => {
  test.setTimeout(120_000);
  logPageErrors(page);
  await openAndPowerOn(page);

  const slips = page.locator("article.slip");
  const heard = page.locator('article.slip[data-kind="heard"]');
  await expect(heard).toHaveCount(1, { timeout: 60_000 });
  const slip = heard.first();
  await expect(slip).toContainText(BODY_TEXT);

  // Origin frame (hop 0): no "via" text in the meta line (Requirement 5.3).
  const meta = slip.locator(".slip-meta");
  await expect(meta).toContainText("Heard");
  await expect(meta).not.toContainText(/via/i);

  // The action offers the next hop (Requirement 4.2).
  const passOn = slip.getByRole("button", { name: "Pass it on, hop 1" });
  await expect(passOn).toBeVisible();
  await expect(passOn).toHaveText("Pass it on → hop 1");
  await expect(passOn).toBeEnabled();
  await expect(slip).not.toContainText("Passed on");

  const slipsBefore = await slips.count();
  await passOn.click();

  // "Passed on" replaces the action, and no Relayed or Sent slip is printed (Requirement 4.10).
  await expect(slip).toContainText("Passed on", { timeout: 60_000 });
  await expect(slip.getByRole("button", { name: /pass it on/i })).toHaveCount(
    0,
  );
  await expect(slips).toHaveCount(slipsBefore);
  await expect(page.locator('article.slip[data-kind="relayed"]')).toHaveCount(
    0,
  );
  await expect(page.locator('article.slip[data-kind="sent"]')).toHaveCount(0);

  // The fake mic loops the fixture. Once the same frame is heard again, it is a
  // duplicate: still one Heard slip and no new slip (Requirement 3.2).
  const framesAtPass = await frameCount(page);
  await expect
    .poll(() => frameCount(page), { timeout: 60_000 })
    .toBeGreaterThan(framesAtPass);
  await expect(heard).toHaveCount(1);
  await expect(slips).toHaveCount(slipsBefore);

  // After a reload the Held_Wire is gone, but the stored flag still shows "Passed on"
  // and not the restart reason (Requirements 3.10, 4.17).
  await page.reload();
  const heardAfter = page.locator('article.slip[data-kind="heard"]');
  await expect(heardAfter).toHaveCount(1);
  const slipAfter = heardAfter.first();
  await expect(slipAfter).toContainText(BODY_TEXT);
  await expect(slipAfter).toContainText("Passed on");
  await expect(slipAfter).not.toContainText("after the app restarts");
  await expect(
    slipAfter.getByRole("button", { name: /pass it on/i }),
  ).toHaveCount(0);
  await expect(slipAfter.locator(".slip-meta")).not.toContainText(/via/i);
});
