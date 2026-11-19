import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

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

test("fake microphone: the known Call frame is heard, carrier first", async ({
  page,
}) => {
  test.setTimeout(90_000);
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.log("console error:", m.text());
  });
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
