import { expect, test } from "@playwright/test";

test("window.__dialtone exists only with ?e2e=1", async ({ page }) => {
  await page.goto("/");
  await page.locator("#app *").first().waitFor();
  expect(await page.evaluate(() => "__dialtone" in window)).toBe(false);

  await page.goto("/?e2e=1");
  await page.locator("#app *").first().waitFor();
  expect(
    await page.evaluate(
      () =>
        typeof (window as unknown as { __dialtone?: { getState(): unknown } })
          .__dialtone?.getState(),
    ),
  ).toBe("object");
});
