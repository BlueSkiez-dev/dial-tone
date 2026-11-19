import { draftView } from "./draft";
import type { UiState } from "./reducer";

export type LedId = "MR" | "AA" | "CD" | "OH" | "RD" | "SD";
export type ResultCode =
  | "— — —"
  | "ATZ"
  | "OK"
  | "ATDT"
  | "CARRIER"
  | "CONNECT"
  | "NO CARRIER"
  | "ERROR";

/** Resolved to text in copy.ts. */
export type HintKey =
  | "off"
  | "selftest"
  | "fault"
  | "send-error"
  | "sending"
  | "connect"
  | "carrier"
  | "listening"
  | "processing"
  | "hidden"
  | "latch-off"
  | "no-mic";

export interface StatusView {
  readonly leds: Readonly<Record<LedId, boolean>>;
  readonly code: ResultCode;
  readonly hintKey: HintKey;
  /** Shown beside ATDT while sending. */
  readonly airtimeMs: number | null;
}

export type TransmitState = "default" | "sending" | "disabled";
export type ListenState = "listening" | "off" | "no-mic" | "disabled";
export type SignalDirection = "idle" | "up" | "down";

const NO_MIC: readonly string[] = [
  "denied",
  "no_device",
  "busy",
  "insecure",
  "error",
  "lost",
];

function leds(on: readonly LedId[]): Record<LedId, boolean> {
  return {
    MR: on.includes("MR"),
    AA: on.includes("AA"),
    CD: on.includes("CD"),
    OH: on.includes("OH"),
    RD: on.includes("RD"),
    SD: on.includes("SD"),
  };
}

/** First matching row of the table in requirement 8.3 wins. */
export function statusView(s: UiState, now: number): StatusView {
  if (s.power === "off") {
    return { leds: leds([]), code: "— — —", hintKey: "off", airtimeMs: null };
  }
  if (s.power === "selftest") {
    return {
      leds: leds(["MR", "AA", "CD", "OH", "RD", "SD"]),
      code: "ATZ",
      hintKey: "selftest",
      airtimeMs: null,
    };
  }
  const oh: LedId[] = s.channel === "call" ? ["OH"] : [];
  const row = (
    on: readonly LedId[],
    code: ResultCode,
    hintKey: HintKey,
    airtimeMs: number | null = null,
  ): StatusView => ({
    leds: leds([...on, ...oh]),
    code,
    hintKey,
    airtimeMs,
  });

  if (s.fault !== null) return row(["MR"], "ERROR", "fault");
  if (now < s.errorUntil) return row(["MR"], "ERROR", "send-error");
  if (s.tx.phase === "sending") {
    return row(["MR", "SD"], "ATDT", "sending", s.tx.airtimeMs);
  }
  if (now < s.connectUntil) return row(["MR", "RD"], "CONNECT", "connect");
  if (now < s.carrier.shownUntil) {
    return row(["MR", "CD"], "CARRIER", "carrier");
  }
  const live = s.mic === "live";
  if (s.latchPressed && live && s.foreground) {
    return row(
      ["MR", "AA"],
      "OK",
      s.micProcessingWarn ? "processing" : "listening",
    );
  }
  const hint: HintKey = NO_MIC.includes(s.mic)
    ? "no-mic"
    : s.latchPressed && live
      ? "hidden"
      : "latch-off";
  return row(["MR"], "NO CARRIER", hint);
}

export function transmitState(s: UiState): TransmitState {
  if (s.power !== "on" || s.fault !== null) return "disabled";
  if (s.tx.phase === "sending") return "sending";
  return draftView(s.draft).status === "ok" ? "default" : "disabled";
}

/** Independent of `foreground`: a hidden page with a live mic still reads Listening. */
export function listenState(s: UiState): ListenState {
  if (s.power !== "on") return "disabled";
  if (NO_MIC.includes(s.mic)) return "no-mic";
  return s.mic === "live" && s.latchPressed ? "listening" : "off";
}

export function signalDirection(s: UiState, now: number): SignalDirection {
  if (s.power !== "on") return "idle";
  if (s.tx.phase === "sending") return "up";
  if (now < s.connectUntil) return "down";
  return "idle";
}

/** True during the Transmit key flash after a BUSY send. */
export function transmitFlash(s: UiState, now: number): boolean {
  return s.power === "on" && now < s.busyUntil;
}
