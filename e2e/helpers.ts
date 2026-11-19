import type { Page } from "@playwright/test";

/** What a screen shows, read from the DOM only. */
export interface Snapshot {
  /** Result code without the airtime ("ATDT · 4.3 s" becomes "ATDT"). */
  code: string;
  /** Lit LED ids, in silkscreen order. */
  leds: string[];
  /** `data-sheet` of the open sheet, or null. */
  sheet: string | null;
  /** Lit meter segments, and whether the meter is over. */
  lit: number;
  over: boolean;
}

export async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const code = (document.querySelector(".status-code")?.textContent ?? "")
      .split(" · ")[0]
      ?.trim();
    const leds = Array.from(
      document.querySelectorAll<HTMLElement>("[data-led]"),
    )
      .filter((el) => el.dataset.on === "true")
      .map((el) => el.dataset.led ?? "");
    const sheet =
      document.querySelector<HTMLElement>("[data-sheet]")?.dataset.sheet ??
      null;
    const segs = Array.from(
      document.querySelectorAll<HTMLElement>(".byte-meter-segment"),
    );
    const lit = segs.filter((s) => s.dataset.color !== "off").length;
    const over =
      document.querySelector<HTMLElement>(".byte-meter")?.dataset.over ===
      "true";
    return { code: code ?? "", leds, sheet, lit, over };
  });
}

/** Opens a gallery state and waits for the first paint. */
export async function openGallery(page: Page, name: string): Promise<void> {
  await page.goto(`/?state=${name}`);
  await page.locator(".device").waitFor();
  await page.evaluate(() => document.fonts.ready);
}
