import { wellLimit } from "./meter";
import { initialState, type UiState } from "./reducer";
import type { GallerySlip, Slip } from "./tape";

export type GalleryName =
  | "off"
  | "selftest"
  | "ready"
  | "sending"
  | "hearing"
  | "received"
  | "sos-held"
  | "sos-received"
  | "call"
  | "quiet"
  | "too-long"
  | "mic-off"
  | "not-listening"
  | "tape-expanded"
  | "legend"
  | "beige"
  | "onboarding-1"
  | "onboarding-2"
  | "onboarding-3"
  | "first-power"
  | "mic-denied"
  | "mic-reset"
  | "install-sheet"
  | "install-notice"
  | "update-ready";

/** Component-only props the live app does not have yet. */
export interface GalleryExtras {
  /** SOS hold progress, 0 to 1. */
  readonly sosRing: number;
  /** State 06: the Heard slip shows "Pass it on → hop N". */
  readonly passOn: boolean;
  readonly showSosSlot: boolean;
  readonly showQuickKeys: boolean;
  readonly showGroupKeyBar: boolean;
  /** Gallery-only slips printed above the tape (newest first). */
  readonly demoSlips: readonly GallerySlip[];
}

export interface GalleryFixture {
  readonly state: UiState;
  readonly now: number;
  readonly extras: GalleryExtras;
}

/** Frozen clock for every fixture. */
export const GALLERY_NOW = 1_000_000;

export const GALLERY_NAMES: readonly GalleryName[] = [
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
  "onboarding-1",
  "onboarding-2",
  "onboarding-3",
  "first-power",
  "mic-denied",
  "mic-reset",
  "install-sheet",
  "install-notice",
  "update-ready",
];

export const SOS_GALLERY_ONLY: readonly GalleryName[] = [
  "sos-held",
  "sos-received",
];

export function isGalleryName(s: string): s is GalleryName {
  return (GALLERY_NAMES as readonly string[]).includes(s);
}

const NO_EXTRAS: GalleryExtras = {
  sosRing: 0,
  passOn: false,
  showSosSlot: false,
  showQuickKeys: false,
  showGroupKeyBar: false,
  demoSlips: [],
};

/** 41 UTF-8 bytes, 8 lit meter segments at the 128-byte limit. */
const DEMO_DRAFT = "Shelter B needs water. Send help by 5 pm.";

const T = GALLERY_NOW;

const SENT: Slip = {
  kind: "sent",
  id: "demo-sent",
  at: T - 60_000,
  text: "Shelter B needs water.",
  bytes: 22,
  mode: "room",
  airtimeMs: 2200,
};
const HEARD: Slip = {
  kind: "heard",
  id: "demo-heard",
  at: T - 1000,
  text: "Road 9 is closed. Use the bridge.",
  bytes: 33,
  hop: 1,
};

function base(): UiState {
  const s = initialState(null);
  return {
    ...s,
    power: "on",
    mic: "live",
    sheet: null,
    flags: { ...s.flags, onboarded: true, firstPowerShown: true },
  };
}

function fixture(
  state: UiState,
  extras: Partial<GalleryExtras> = {},
): GalleryFixture {
  return { state, now: T, extras: { ...NO_EXTRAS, ...extras } };
}

const SOS_SLOTS = {
  showSosSlot: true,
  showQuickKeys: true,
  showGroupKeyBar: true,
} as const;

function build(name: GalleryName): GalleryFixture {
  const on = base();
  const off: UiState = {
    ...on,
    power: "off",
    mic: "idle",
    flags: { ...on.flags, firstPowerShown: false },
  };
  switch (name) {
    case "off":
      return fixture(off);
    case "selftest":
      return fixture({ ...off, power: "selftest" });
    case "ready":
      return fixture({ ...on, draft: DEMO_DRAFT });
    case "sending":
      return fixture({
        ...on,
        draft: DEMO_DRAFT,
        tx: { phase: "sending", startedAt: T - 500, airtimeMs: 4300 },
      });
    case "hearing":
      return fixture({
        ...on,
        carrier: { active: true, shownUntil: T + 1500, lastOffAt: null },
      });
    case "received":
      return fixture(
        { ...on, connectUntil: T + 3000, tape: [SENT, HEARD] },
        { passOn: true },
      );
    case "sos-held":
      return fixture(on, { sosRing: 0.6, ...SOS_SLOTS });
    case "sos-received":
      return fixture(
        { ...on, channel: "call" },
        {
          ...SOS_SLOTS,
          demoSlips: [
            { kind: "sos", id: "demo-sos", at: T - 2000, hop: 0, mode: "call" },
          ],
        },
      );
    case "call":
      return fixture({ ...on, channel: "call" });
    case "quiet":
      return fixture({ ...on, channel: "quiet" });
    case "too-long":
      return fixture({ ...on, draft: "a".repeat(wellLimit() + 12) });
    case "mic-off":
      return fixture({ ...on, mic: "denied" });
    case "not-listening":
      return fixture({ ...on, latchPressed: false });
    case "tape-expanded":
      return fixture({
        ...on,
        tapeExpanded: true,
        tape: [1, 2, 3, 4, 5].map(
          (i): Slip => ({
            kind: "heard",
            id: `demo-${i}`,
            at: T - (6 - i) * 60_000,
            text: `Message ${i}`,
            bytes: 9,
            hop: 0,
          }),
        ),
      });
    case "legend":
      return fixture({ ...on, legendOpen: true });
    case "beige":
      return fixture({ ...on, theme: "beige" });
    case "onboarding-1":
    case "onboarding-2":
    case "onboarding-3":
      return fixture({
        ...off,
        sheet: name,
        flags: { ...off.flags, onboarded: false },
      });
    case "first-power":
      return fixture({ ...on, flags: { ...on.flags, firstPowerShown: false } });
    case "mic-denied":
      return fixture({ ...on, mic: "denied", sheet: "mic-denied" });
    case "mic-reset":
      return fixture({ ...on, mic: "lost", sheet: "mic-reset" });
    case "install-sheet":
      return fixture({
        ...on,
        install: { available: true, dismissed: false, standalone: false },
        sheet: "install",
      });
    case "install-notice":
      return fixture({
        ...on,
        install: { available: true, dismissed: false, standalone: false },
      });
    case "update-ready":
      return fixture({
        ...on,
        update: { ready: true },
        tape: [{ kind: "update-ready", id: "demo-update", at: T }],
      });
  }
}

/** A fresh, complete fixture. Pure: reads no storage and no clock. */
export function galleryFixture(name: GalleryName): GalleryFixture {
  return build(name);
}
