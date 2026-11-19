import type { UiState } from "./reducer";

/**
 * false while a transmission is in flight, a carrier is active, or a connect
 * hold is running. Gates the "Restart now" button on the Update ready slip.
 */
export function canRestartNow(
  s: Pick<UiState, "tx" | "connectUntil" | "carrier">,
  now: number,
): boolean {
  return s.tx.phase === "idle" && now >= s.connectUntil && !s.carrier.active;
}
