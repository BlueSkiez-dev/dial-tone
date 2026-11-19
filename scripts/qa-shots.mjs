// Temporary: screenshots every gallery state at 390 px for the Design QA task.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const out = join(process.env.TEMP ?? ".", "dtqa", "app");
mkdirSync(out, { recursive: true });
const names = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
for (const n of names) {
  await page.goto(`http://localhost:5173/?state=${n}`);
  await page.locator(".device").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, `${n}.png`), fullPage: true });
  const info = await page.evaluate(() => ({
    h: document.documentElement.scrollHeight,
    lit: [...document.querySelectorAll(".byte-meter-segment")].filter(
      (s) => s.dataset.color !== "off",
    ).length,
  }));
  console.log(n, JSON.stringify(info));
}
await browser.close();
