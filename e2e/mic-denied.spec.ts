import { expect, type Page, test } from "@playwright/test";

// Audio-transport task 12.3 on the built app: the microphone is denied, the
// phone can still send.
//
// Chromium cannot be made to deny for real here. With the project's fake-UI flag
// the prompt is auto-granted, and without it headless Chromium fails with
// NotSupportedError (mic state "error", not "denied"). So an init script makes
// getUserMedia reject with NotAllowedError, which is what a user's "Block"
// produces, and counts the calls so "Try again" can be seen to re-ask.

interface HookEvent {
  kind: string;
  state?: string;
  phase?: string;
}

async function denyMic(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __gumCalls: number };
    w.__gumCalls = 0;
    navigator.mediaDevices.getUserMedia = () => {
      w.__gumCalls++;
      return Promise.reject(
        new DOMException("Permission denied", "NotAllowedError"),
      );
    };
  });
}

const gumCalls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __gumCalls: number }).__gumCalls);

const hookEvents = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __dialtone: { events: HookEvent[] } }
    ).__dialtone.events.map((e) => ({
      kind: e.kind,
      state: e.state,
      phase: e.phase,
    })),
  );

async function powerOnDenied(page: Page): Promise<void> {
  await denyMic(page);
  await page.goto("?e2e=1");
  await page.getByRole("dialog").getByRole("button", { name: "Skip" }).click();
  await expect(page.locator("[data-sheet]")).toHaveCount(0);
  await page.getByRole("switch", { name: "Power" }).click();
}

test("denied microphone: No mic, sheet, and sending still works", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await powerOnDenied(page);

  await expect(page.locator(".listen-latch-text")).toHaveText("No mic", {
    timeout: 15_000,
  });
  const sheet = page.locator("[data-sheet='microphone']");
  await expect(sheet).toBeVisible();
  await expect
    .poll(async () =>
      (await hookEvents(page))
        .filter((e) => e.kind === "mic")
        .map((e) => e.state),
    )
    .toContain("denied");

  await sheet.getByRole("button", { name: "Send only" }).click();
  await expect(page.locator("[data-sheet]")).toHaveCount(0);

  await page
    .getByLabel("Message", { exact: true })
    .fill("Shelter B needs water.");
  await page.locator(".transmit-key").click();
  await expect(
    page.locator('article.slip[data-kind="sent"]').first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () =>
      (await hookEvents(page)).some(
        (e) => e.kind === "tx" && e.phase === "end",
      ),
    )
    .toBe(true);
});

test("denied microphone: Try again calls restartMic from the tap", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await powerOnDenied(page);

  const sheet = page.locator("[data-sheet='microphone']");
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  expect(await gumCalls(page)).toBe(1);

  await sheet.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator("[data-sheet]")).toHaveCount(0);
  // restartMic re-asks the browser: one more getUserMedia call, still denied.
  await expect.poll(() => gumCalls(page)).toBe(2);
  await expect
    .poll(async () =>
      (await hookEvents(page))
        .filter((e) => e.kind === "mic")
        .map((e) => e.state),
    )
    .toEqual(["requesting", "denied", "requesting", "denied"]);
});
