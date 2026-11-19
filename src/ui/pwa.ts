import type { PwaHooks } from "./components/Screen";
import type { Controller } from "./controller";
import { canRestartNow } from "./model/update-guard";

/** The `beforeinstallprompt` event (not in lib.dom). */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** What `registerSW` from `virtual:pwa-register` looks like. */
export type RegisterSw = (options: {
  onNeedRefresh?: () => void;
  onRegisterError?: (error: unknown) => void;
}) => (reloadPage?: boolean) => Promise<void>;

export interface PwaDeps {
  controller: Controller;
  /** Absent on the dev server: no service worker is registered. */
  register: RegisterSw | null;
  target?: Pick<Window, "addEventListener">;
  isStandalone?: () => boolean;
}

export function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    (typeof matchMedia === "function" &&
      matchMedia("(display-mode: standalone)").matches)
  );
}

/**
 * Registers the service worker (prompt mode), captures the install prompt and
 * returns the hooks for the Install sheet and the Update ready slip.
 */
export function startPwa(deps: PwaDeps): PwaHooks {
  const { controller } = deps;
  const target = deps.target ?? window;
  const standalone = (deps.isStandalone ?? detectStandalone)();
  let saved: InstallPromptEvent | null = null;
  let update: ((reloadPage?: boolean) => Promise<void>) | null = null;

  if (!standalone) {
    target.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      saved = e as InstallPromptEvent;
      controller.installAvailable(true);
    });
  }
  target.addEventListener("appinstalled", () => {
    saved = null;
    controller.installAvailable(false);
  });

  if (deps.register) {
    update = deps.register({
      onNeedRefresh: () => controller.updateReady(),
      onRegisterError: () => {},
    });
  }

  return {
    // Defined only while a saved prompt exists, so the sheet falls back to the manual steps.
    get onInstall() {
      if (saved === null) return undefined;
      return () => {
        const prompt = saved;
        saved = null;
        if (prompt === null) return;
        // A prompt can be used once. Accepted or dismissed, the notice goes away.
        void prompt
          .prompt()
          .then(() => prompt.userChoice)
          .catch(() => undefined)
          .then(() => {
            controller.installAvailable(false);
            controller.sheetClose();
          });
      };
    },
    onRestart() {
      if (update === null) return;
      if (!canRestartNow(controller.getState(), controller.now())) return;
      void update(true);
    },
    onLater() {
      controller.updateLater();
    },
  };
}
