import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Audio-transport task 13.1 / ui-shell task 6.5, on the built app: load once so
// the service worker precaches, go offline, reload, then power on, transmit and
// decode the fixture frame. Decoding offline proves the decode worker, the
// capture worklet and vendor/ggwave.js are all served from the precache.
const sidecar = JSON.parse(
  readFileSync(
    new URL("../tests/fixtures/call-known-frame.json", import.meta.url),
    "utf8",
  ),
) as { wireHex: string };

const BODY_TEXT = "Dial Tone fixture";

interface HookEvent {
  kind: string;
  phase?: string;
  wire?: Uint8Array;
}

test("offline: reload from the precache, transmit and decode the fixture", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);

  // 1. First load, online. Wait until the service worker is active (install,
  // and so the precache, is complete) and controls the page.
  await page.goto("?e2e=1");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  // Let late requests (fonts, the lazy workbox-window chunk) finish. Otherwise
  // the reload below aborts them and they show up as failures that are not
  // precache misses.
  await page.waitForLoadState("networkidle");

  // 2. Offline reload. Any miss would be a network error now.
  const failed: string[] = [];
  page.on("requestfailed", (r) =>
    failed.push(`${r.url()} ${r.failure()?.errorText ?? ""}`),
  );
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".device")).toBeVisible();
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);

  // Onboarding opens on first launch only; the reload keeps localStorage.
  const skip = page.getByRole("dialog").getByRole("button", { name: "Skip" });
  if (await skip.isVisible()) await skip.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // 3. Power on from a real tap: worklet, worker and ggwave start offline.
  await page.getByRole("switch", { name: "Power" }).click();
  await expect(page.getByRole("switch", { name: "Power" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // 4. Decode the looped fixture from the fake microphone.
  const heard = page.locator('article.slip[data-kind="heard"]');
  await expect(heard.first()).toContainText(BODY_TEXT, { timeout: 60_000 });
  const hex = await page.evaluate(() => {
    const hook = (
      window as unknown as { __dialtone: { events: HookEvent[] } }
    ).__dialtone;
    const frame = hook.events.find((e) => e.kind === "frame");
    return frame?.wire === undefined
      ? undefined
      : Array.from(frame.wire as Uint8Array)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
  });
  expect(hex).toBe(sidecar.wireHex);

  // 5. Transmit offline: a Sent slip prints and the tx end event fires.
  await page.getByLabel("Message", { exact: true }).fill("Offline hello.");
  await page.locator(".transmit-key").click();
  await expect(
    page.locator('article.slip[data-kind="sent"]').first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { __dialtone: { events: HookEvent[] } }
        ).__dialtone.events.some((e) => e.kind === "tx" && e.phase === "end"),
      ),
    )
    .toBe(true);

  expect(failed).toEqual([]);
});
