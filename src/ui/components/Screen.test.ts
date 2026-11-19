import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { GALLERY_NAMES, galleryFixture } from "../model/gallery";
import { Screen, type ScreenActions } from "./Screen";

const noop = (): void => {};
const actions: ScreenActions = {
  powerTap: noop,
  latchTap: noop,
  setChannel: noop,
  setDraft: noop,
  transmit: noop,
  tapeToggle: noop,
  legendToggle: noop,
  sheetOpen: noop,
  sheetClose: noop,
  onboardingNext: noop,
  onboardingSkip: noop,
  onboardingDone: noop,
  micRetry: noop,
};

function html(name: (typeof GALLERY_NAMES)[number]): string {
  const { state, now, extras } = galleryFixture(name);
  return renderToString(
    h(Screen, {
      state,
      now,
      actions,
      source: null,
      reducedMotion: true,
      extras,
    }),
  );
}

describe("Screen", () => {
  it("renders every gallery fixture", () => {
    for (const name of GALLERY_NAMES) expect(html(name)).toContain("faceplate");
  });

  it("fills the SOS, quick keys and group key slots only for the SOS fixtures", () => {
    const empty = /data-slot="sos"[^>]*><\/div>/;
    expect(html("sos-held")).not.toMatch(empty);
    expect(html("sos-received")).not.toMatch(empty);
    expect(html("ready")).toMatch(empty);
  });

  it("shows one Tape caption and the Quiet notice only on Quiet", () => {
    expect(html("ready").match(/>Tape</g)).toHaveLength(1);
    expect(html("quiet")).toContain("quiet-notice");
    expect(html("ready")).not.toContain("quiet-notice");
  });
});
