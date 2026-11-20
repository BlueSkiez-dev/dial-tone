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
  passOn: noop,
  holdsWire: () => false,
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
  it("shows the Standby tag only when off, and the SOS hold readout on sos-held", () => {
    expect(html("off")).toContain("Standby");
    expect(html("ready")).not.toContain("Standby");
    expect(html("sos-held")).toContain("Keep holding to send SOS");
    expect(html("too-long")).toContain("Message is too long to send");
  });

  it("renders every gallery fixture", () => {
    for (const name of GALLERY_NAMES) expect(html(name)).toContain("faceplate");
  });

  it("fills the SOS, quick keys and group key slots only for the SOS fixtures", () => {
    const empty = /data-slot="sos"[^>]*><\/div>/;
    expect(html("sos-held")).not.toMatch(empty);
    expect(html("sos-received")).not.toMatch(empty);
    expect(html("ready")).toMatch(empty);
  });

  it("maps the gallery passOn extra to the action view, and only there", () => {
    expect(html("received")).toContain("Pass it on → hop 2");
    expect(html("ready")).not.toContain("Pass it on");
  });

  it("shows no action in live mode when no wire is held", () => {
    const { state, now } = galleryFixture("received");
    const out = renderToString(
      h(Screen, {
        state,
        now,
        actions,
        source: null,
        reducedMotion: true,
      }),
    );
    expect(out).not.toContain("Pass it on →");
  });

  it("shows the action in live mode when the controller holds the wire", () => {
    const { state, now } = galleryFixture("received");
    const tape = state.tape.map((s) =>
      s.kind === "heard"
        ? {
            ...s,
            relay: { hop: 1, ttl: 3, multi: false, keyOffer: false },
          }
        : s,
    );
    const out = renderToString(
      h(Screen, {
        state: { ...state, tape },
        now,
        actions: { ...actions, holdsWire: () => true },
        source: null,
        reducedMotion: true,
      }),
    );
    expect(out).toContain("Pass it on → hop 2");
  });

  it("shows one Tape caption and the Quiet notice only on Quiet", () => {
    expect(html("ready").match(/>Tape</g)).toHaveLength(1);
    expect(html("quiet")).toContain("quiet-notice");
    expect(html("ready")).not.toContain("quiet-notice");
  });
});
