import { render } from "preact";
import { cpuFlagFromSearch } from "../audio";
import { Screen, type ScreenActions } from "./components/Screen";
import { type Controller, createController } from "./controller";
import { installE2eHook } from "./e2e-hook";
import { LiveApp } from "./live";
import { galleryFixture, isGalleryName } from "./model/gallery";
import type { StorageLike } from "./model/persist";
import { type RegisterSw, startPwa } from "./pwa";
import { createRealTransport, type UiTransport } from "./transport-seam";
import "./styles/fonts.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/device.css";
import "./styles/channel-switch.css";

// Component CSS (Rocker, Led, Sheet, Slip, Tape, ...) is imported by each component.

const noop = (): void => {};
/** The gallery is a still picture: every action does nothing. */
const GALLERY_ACTIONS: ScreenActions = {
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

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Frozen clock, no storage, no transport: nothing here can start audio. */
function renderGallery(
  root: HTMLElement,
  name: Parameters<typeof galleryFixture>[0],
) {
  const { state, now, extras } = galleryFixture(name);
  document.documentElement.dataset.theme = state.theme;
  render(
    <Screen
      state={state}
      now={now}
      actions={GALLERY_ACTIONS}
      source={null}
      reducedMotion={prefersReducedMotion()}
      extras={extras}
    />,
    root,
  );
}

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** FakeTransport on `vite dev` unless `?transport=real`, otherwise the real transport. */
async function chooseTransport(params: URLSearchParams): Promise<UiTransport> {
  if (import.meta.env.DEV && params.get("transport") !== "real") {
    const { createFakeTransport } = await import("./fake-transport");
    const { DevPanel } = await import("./dev-panel");
    const fake = createFakeTransport();
    const host = document.createElement("div");
    document.body.append(host);
    render(<DevPanel fake={fake} />, host);
    return fake;
  }
  return createRealTransport();
}

async function renderLive(root: HTMLElement, params: URLSearchParams) {
  const transport = await chooseTransport(params);
  const controller: Controller = createController({
    transport,
    storage: browserStorage(),
  });
  // Test hook for Playwright; absent unless the URL has ?e2e=1.
  installE2eHook(window, window.location.search, controller, transport);
  // Write pending state when the page goes away.
  window.addEventListener("pagehide", () => controller.flush());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") controller.flush();
  });
  // The dev server registers no service worker.
  const register: RegisterSw | null = import.meta.env.DEV
    ? null
    : (await import("virtual:pwa-register")).registerSW;
  const pwa = startPwa({ controller, register });
  render(
    <LiveApp controller={controller} transport={transport} pwa={pwa} />,
    root,
  );
}

const root = document.getElementById("app");
if (root) {
  const params = new URLSearchParams(window.location.search);
  // Debug overlay for the CPU measurement. Not loaded without ?cpu=1.
  if (cpuFlagFromSearch(window.location.search)) {
    void import("./cpu-overlay").then((m) => m.mountCpuOverlay(document));
  }
  const name = params.get("state");
  if (name !== null && isGalleryName(name)) renderGallery(root, name);
  else void renderLive(root, params);
}
