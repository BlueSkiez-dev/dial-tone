import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { draftView } from "./draft";
import {
  GALLERY_NAMES,
  galleryFixture,
  isGalleryName,
  SOS_GALLERY_ONLY,
} from "./gallery";
import { listenState, statusView, transmitState } from "./status";

const MAP = readFileSync(
  new URL("../../../docs/figma-source-map.md", import.meta.url),
  "utf8",
);

const STATES_PAGE = [
  "off",
  "selftest",
  "ready",
  "sending",
  "hearing",
  "received",
  "sos-held",
  "sos-received",
  "call",
  "quiet",
  "too-long",
  "mic-off",
  "not-listening",
  "tape-expanded",
  "legend",
  "beige",
];

describe("gallery fixtures", () => {
  it("resolves every name to a complete fixture", () => {
    for (const name of GALLERY_NAMES) {
      const f = galleryFixture(name);
      expect(f.state).toBeDefined();
      expect(f.now).toBeGreaterThan(0);
      expect(isGalleryName(name)).toBe(true);
    }
    expect(isGalleryName("nope")).toBe(false);
  });

  it("lists every name in the Source_Map", () => {
    for (const name of GALLERY_NAMES) {
      expect(MAP).toContain(`\`${name}\``);
    }
  });

  it("names each of the 16 States page frames", () => {
    expect(STATES_PAGE).toHaveLength(16);
    for (const name of STATES_PAGE) expect(isGalleryName(name)).toBe(true);
  });

  it("gives an SOS extra only to sos-held and sos-received", () => {
    const withSos = GALLERY_NAMES.filter((n) => {
      const x = galleryFixture(n).extras;
      return (
        x.sosRing > 0 ||
        x.showSosSlot ||
        x.demoSlips.some((s) => s.kind === "sos")
      );
    });
    expect([...withSos].sort()).toEqual([...SOS_GALLERY_ONLY].sort());
  });

  it("State 03 has MR and AA lit, OK and an empty tape", () => {
    const { state, now } = galleryFixture("ready");
    const v = statusView(state, now);
    expect(v.code).toBe("OK");
    expect(
      Object.entries(v.leds)
        .filter(([, on]) => on)
        .map(([k]) => k),
    ).toEqual(["MR", "AA"]);
    expect(state.tape).toHaveLength(0);
    expect(listenState(state)).toBe("listening");
  });

  it("State 07 (sos-held) is held: ring filled, MR and AA lit", () => {
    const { state, now, extras } = galleryFixture("sos-held");
    expect(extras.sosRing).toBeGreaterThan(0);
    expect(statusView(state, now).leds).toMatchObject({ MR: true, AA: true });
  });
  it("State 03 draft is 41 bytes", () => {
    expect(draftView(galleryFixture("ready").state.draft).bytes).toBe(41);
  });

  it("State 11 is over the limit with Transmit disabled", () => {
    const { state } = galleryFixture("too-long");
    const d = draftView(state.draft);
    expect(d.bytes).toBeGreaterThan(d.meter.limit);
    expect(transmitState(state)).toBe("disabled");
  });

  it("State 06 sets passOn and State 16 sets the beige theme", () => {
    expect(galleryFixture("received").extras.passOn).toBe(true);
    expect(galleryFixture("beige").state.theme).toBe("beige");
  });

  it("prints the same first power-on system slip in first-power and beige", () => {
    const first = galleryFixture("first-power").state.tape;
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      kind: "system",
      noticeKey: "listening-open",
    });
    expect(galleryFixture("beige").state.tape).toEqual(first);
  });

  it("calls no storage", () => {
    const src = readFileSync(new URL("./gallery.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB|persist/);
  });
});
