import { expect, type Page, test } from "@playwright/test";
import { openGallery, type Snapshot, snapshot } from "./helpers";

/** The gallery fixture's Readout and LEDs, read in a second tab of the same context. */
async function galleryOf(page: Page, name: string): Promise<Snapshot> {
  const other = await page.context().newPage();
  try {
    await openGallery(other, name);
    return await snapshot(other);
  } finally {
    await other.close();
  }
}

/** Live screen equals the gallery fixture in Readout and LEDs (airtime is stripped). */
async function expectLike(page: Page, name: string): Promise<void> {
  // Read the live screen first: the CARRIER and CONNECT holds are short.
  const got = await snapshot(page);
  const want = await galleryOf(page, name);
  expect({ code: got.code, leds: got.leds }).toEqual({
    code: want.code,
    leds: want.leds,
  });
}

async function openLive(page: Page): Promise<void> {
  await page.goto("/?e2e=1");
  await page.locator(".device").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.locator(".dev-panel summary").click();
}

async function skipOnboarding(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.locator("[data-sheet]")).toHaveCount(0);
}

async function powerOn(page: Page): Promise<void> {
  await page.getByRole("switch", { name: "Power" }).click();
  await expect(page.locator(".status-code")).toHaveText("OK");
}

/** Keeps the next sends in flight, with no timer, until 
eleaseSends. */
async function holdSends(page: Page): Promise<void> {
  await page.getByLabel("Hold sends until released").check();
}
async function releaseSends(page: Page): Promise<void> {
  await page.getByLabel("Hold sends until released").uncheck();
}

const switchEl = (page: Page) => page.getByRole("radiogroup");
const channelOf = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as { __dialtone: { getState(): { channel: string } } }
      ).__dialtone.getState().channel,
  );

test("States 01 to 15 are reachable through the real controls", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await openLive(page);

  // 01 Off (after the first-run sheet is skipped).
  await skipOnboarding(page);
  await expectLike(page, "off");

  // 02 Self-test: has its own test below, run on a paused clock.
  await page.getByRole("switch", { name: "Power" }).click();
  // 03 Ready.
  await expect(page.locator(".status-code")).toHaveText("OK");
  await expectLike(page, "ready");

  // 04 Sending: type and transmit, with the send held open.
  await holdSends(page);
  await page
    .getByLabel("Message", { exact: true })
    .fill("Shelter B needs water. Send help by 5 pm.");
  await page.locator(".transmit-key").click();
  await expect(page.locator(".status-code")).toContainText("ATDT");
  await expectLike(page, "sending");
  await releaseSends(page);
  await expect(page.locator(".status-code")).toHaveText("OK", {
    timeout: 5000,
  });

  // 05 Hearing a signal: inject a carrier after 2.5 s of quiet.
  // Wait for the 2.5 s carrier quiet period to be over (observable through the test hook).
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __dialtone: { carrierRearmed(): boolean } }
        ).__dialtone.carrierRearmed(),
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Carrier on" }).click();
  await expect(page.locator(".status-code")).toHaveText("CARRIER");
  await expectLike(page, "hearing");
  await page.getByRole("button", { name: "Carrier off" }).click();
  await expect(page.locator(".status-code")).toHaveText("OK", {
    timeout: 4000,
  });

  // 06 Message received.
  await page.getByRole("button", { name: "Inject frame" }).click();
  await expect(page.locator(".status-code")).toHaveText("CONNECT");
  await expectLike(page, "received");
  await expect(page.locator('.slip[data-kind="heard"]')).toHaveCount(1);
  await expect(page.locator(".status-code")).toHaveText("OK", {
    timeout: 5000,
  });

  // 09 Call mode and 10 Quiet mode, through the switch.
  await page.getByRole("radio", { name: /Call/ }).click();
  await expect(switchEl(page)).toHaveAttribute("data-value", "call");
  await expectLike(page, "call");
  await page.getByRole("radio", { name: /Quiet/ }).click();
  await expect(switchEl(page)).toHaveAttribute("data-value", "quiet");
  await expect(page.locator(".quiet-notice")).toBeVisible();
  await expectLike(page, "quiet");
  await page.getByRole("radio", { name: /Room/ }).click();
  await expect(page.locator(".quiet-notice")).toHaveCount(0);

  // 11 Message too long: 129 bytes.
  await page
    .getByLabel("Message", { exact: true })
    .fill("a".repeat(129));
  const tooLong = await snapshot(page);
  expect(tooLong.over).toBe(true);
  expect(tooLong.lit).toBe(24);
  await expect(page.locator(".byte-meter-label")).toContainText("Too long");
  await expect(page.locator(".transmit-key")).toBeDisabled();
  await expectLike(page, "too-long");
  await page.getByLabel("Message", { exact: true }).fill("");

  // 13 Not listening: release the latch.
  await page.locator(".listen-latch-button").click();
  await expect(page.locator(".status-code")).toHaveText("NO CARRIER");
  await expectLike(page, "not-listening");
  await page.locator(".listen-latch-button").click();
  await expect(page.locator(".status-code")).toHaveText("OK");

  // 14 Tape expanded: more than three slips, then See more.
  await page.getByRole("button", { name: "Inject frame" }).click();
  await page.getByRole("button", { name: "Inject frame" }).click();
  await expect(page.locator(".status-code")).toHaveText("OK", {
    timeout: 6000,
  });
  expect(await page.locator(".tape .slip").count()).toBe(3);
  // The open dev panel floats over the Tape: fold it away for the taps below.
  await page.locator(".dev-panel summary").click();
  await page.getByRole("button", { name: "See more" }).click();
  await expect(page.getByRole("button", { name: "Show less" })).toBeVisible();
  expect(await page.locator(".tape .slip").count()).toBeGreaterThan(3);
  await expectLike(page, "tape-expanded");

  // 15 Light legend: tap the LEDs.
  await page.locator(".status-leds").click();
  await expect(page.locator(".status-legend")).toBeVisible();
  await expectLike(page, "legend");
  await page.locator(".status-leds").click();

  // 12 Microphone off: set the fake microphone to denied.
  await page.locator(".dev-panel summary").click();
  await page.locator(".dev-panel select").first().selectOption("denied");
  await expect(page.locator("[data-sheet='microphone']")).toBeVisible();
  // The sheet takes focus in an effect after its first paint; Escape only reaches it then.
  await expect
    .poll(() =>
      page.evaluate(
        () => document.activeElement?.closest("[data-sheet]") !== null,
      ),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-sheet]")).toHaveCount(0);
  await expect(page.locator(".status-code")).toHaveText("OK");
  await expectLike(page, "mic-off");
  await expect(page.locator(".listen-latch-text")).toHaveText("No mic");
});

test("State 02: the self-test shows ATZ and all six LEDs until its timer fires", async ({
  page,
}) => {
  await openLive(page);
  await skipOnboarding(page);
  // Pause the page clock so the self-test timer cannot fire before the screen is read.
  await page.clock.install();
  await page.getByRole("switch", { name: "Power" }).click();
  const selftest = await snapshot(page);
  const wantSelftest = await galleryOf(page, "selftest");
  expect({ code: selftest.code, leds: selftest.leds }).toEqual({
    code: wantSelftest.code,
    leds: wantSelftest.leds,
  });
  await page.clock.runFor(1000);
  await expect(page.locator(".status-code")).toHaveText("OK");
});
test("State 16: ?state=beige changes Token values and moves nothing", async ({
  page,
}) => {
  const parts = [
    ".device",
    ".faceplate",
    ".part-status",
    ".part-scope",
    ".part-channel",
    ".message-well",
    ".transmit-key",
    ".part-tape",
  ];
  const measure = () =>
    page.evaluate((sel) => {
      const rect = (s: string) => {
        const r = document.querySelector(s)?.getBoundingClientRect();
        return r
          ? [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 10) / 10)
          : null;
      };
      return {
        plate: getComputedStyle(document.documentElement)
          .getPropertyValue("--plate")
          .trim()
          .toLowerCase(),
        boxes: sel.map(rect),
      };
    }, parts);

  // Same screen as beige, in Ghost: both fixtures carry the first power-on system slip.
  await openGallery(page, "first-power");
  const ghost = await measure();
  await openGallery(page, "beige");
  const beige = await measure();

  expect(ghost.plate).toBe("#c4c5c7");
  expect(beige.plate).toBe("#e1d8c3");
  expect(beige.boxes).toEqual(ghost.boxes);
  expect(await page.locator('.part-tape .slip[data-kind="system"]').count()).toBe(1);
  expect(beige.boxes.every((b) => b !== null)).toBe(true);
});

test.describe("channel switch while a send is held", () => {
  test("Tab reaches it, and arrows and clicks leave the channel unchanged", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    await openLive(page);
    await skipOnboarding(page);
    await powerOn(page);

    // Not sending: no aria-disabled.
    const group = switchEl(page);
    await expect(group).not.toHaveAttribute("aria-disabled", "true");
    expect(await group.getAttribute("disabled")).toBeNull();

    await holdSends(page);
    await page.getByLabel("Message", { exact: true }).fill("hold this");
    await page.locator(".transmit-key").click();
    await expect(page.locator(".status-code")).toContainText("ATDT");

    await expect(group).toHaveAttribute("aria-disabled", "true");
    expect(await group.getAttribute("disabled")).toBeNull();
    expect(await group.getAttribute("tabindex")).not.toBe("-1");
    await expect(group).toHaveAttribute(
      "aria-label",
      "Channel switch, Room, unavailable while sending",
    );

    // Tab from the power switch reaches the radiogroup.
    await page.getByRole("switch", { name: "Power" }).focus();
    let reached = false;
    for (let i = 0; i < 12 && !reached; i++) {
      await page.keyboard.press("Tab");
      reached = await page.evaluate(
        () => document.activeElement?.getAttribute("role") === "radiogroup",
      );
    }
    expect(reached).toBe(true);

    // Arrow keys do nothing.
    for (const key of ["ArrowRight", "ArrowRight", "End", "ArrowDown"]) {
      await page.keyboard.press(key);
    }
    expect(await channelOf(page)).toBe("room");
    await expect(group).toHaveAttribute("data-value", "room");

    // Clicks do nothing, whatever sits under the pointer.
    await page.getByRole("radio", { name: /Quiet/ }).click({ force: true });
    await page.getByRole("radio", { name: /Call/ }).click({ force: true });
    expect(await channelOf(page)).toBe("room");
    await expect(group).toHaveAttribute("data-value", "room");
    // After the send ends the switch works again.
    await releaseSends(page);
    // After the send ends the switch works again.
    await expect(page.locator(".status-code")).toHaveText("OK", {
      timeout: 6000,
    });
    await expect(group).not.toHaveAttribute("aria-disabled", "true");
    await group.focus();
    await page.keyboard.press("ArrowRight");
    await expect(group).toHaveAttribute("data-value", "call");
  });
});
