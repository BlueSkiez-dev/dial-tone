import type { TransportEvent } from "../audio";
import type { Controller } from "./controller";
import { carrierRearmed, type UiState } from "./model/reducer";
import type { UiTransport } from "./transport-seam";

export type TransportEventLike = TransportEvent;

/** What Playwright can read through `window.__dialtone`. */
export interface DialtoneHook {
  getState(): UiState;
  /** True once the 2.5 s carrier quiet period has passed, so the next burst shows CARRIER. */
  carrierRearmed(): boolean;
  /** Every transport event seen since the hook was installed, oldest first. */
  readonly events: TransportEventLike[];
}

/** The hook exists only when the URL carries `e2e=1`. */
export function isE2eEnabled(search: string): boolean {
  return new URLSearchParams(search).get("e2e") === "1";
}

/**
 * Installs `target.__dialtone` when the flag is set. Returns true if installed.
 * Without the flag it leaves `target` untouched.
 */
export function installE2eHook(
  target: object,
  search: string,
  controller: Pick<Controller, "getState" | "now">,
  transport: Pick<UiTransport, "subscribe">,
): boolean {
  if (!isE2eEnabled(search)) return false;
  const events: TransportEventLike[] = [];
  transport.subscribe((event) => {
    events.push(event);
  });
  const hook: DialtoneHook = {
    getState: () => controller.getState(),
    carrierRearmed: () =>
      carrierRearmed(controller.getState().carrier, controller.now()),
    events,
  };
  Object.defineProperty(target, "__dialtone", {
    value: hook,
    configurable: true,
  });
  return true;
}
