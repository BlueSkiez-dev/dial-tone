import type { MicState, ProfileId } from "../../audio/index";
import type { SavedState } from "./persist";
import { pushSlip, type Slip } from "./tape";

/** Self-test length (Figma State 02 note). */
export const SELF_TEST_MS = 600;
/** Design parameter: RD and CONNECT hold after a received frame. */
export const CONNECT_HOLD_MS = 3000;
/** Design parameter: CD and CARRIER hold after the last active carrier event. */
export const CARRIER_HOLD_MS = 1500;
/** Figma State 05 note: CARRIER shows after this much quiet. */
export const QUIET_REARM_MS = 2500;
/** Design parameter: ERROR readout after a failed send. */
export const ERROR_HOLD_MS = 3000;
/** Design parameter: Transmit key flash after a BUSY send. */
export const BUSY_FLASH_MS = 600;

export type SheetId =
  | "onboarding-1"
  | "onboarding-2"
  | "onboarding-3"
  | "mic-denied"
  | "mic-reset"
  | "mic-error"
  | "install";

export type Fault = "modem" | "no-audio" | "send-unavailable";

export interface UiState {
  readonly power: "off" | "selftest" | "on";
  readonly fault: Fault | null;
  /** Transmit key flash after a BUSY send. */
  readonly busyUntil: number;
  /** ERROR readout after a failed send (requirement 6.6). */
  readonly errorUntil: number;
  readonly channel: ProfileId;
  readonly draft: string;
  /** The user's Listen choice. */
  readonly latchPressed: boolean;
  readonly mic: MicState;
  /** True when the transport could not turn microphone processing off (requirement 11.5). */
  readonly micProcessingWarn: boolean;
  /** Microphone sheet and notice rules, once per power-on: none, sheet opened, notice printed. */
  readonly micSheet: "none" | "shown" | "again";
  readonly tx: {
    readonly phase: "idle" | "sending";
    readonly startedAt: number;
    readonly airtimeMs: number | null;
  };
  readonly carrier: {
    readonly active: boolean;
    readonly shownUntil: number;
    readonly lastOffAt: number | null;
  };
  /** RD and CONNECT hold. */
  readonly connectUntil: number;
  /** Wire length to airtime in ms, for the current channel. */
  readonly airtimeByWire: Readonly<Record<number, number>>;
  readonly tape: readonly Slip[];
  readonly tapeExpanded: boolean;
  readonly legendOpen: boolean;
  readonly sheet: SheetId | null;
  readonly theme: "ghost" | "beige";
  readonly flags: {
    readonly onboarded: boolean;
    readonly micWasGranted: boolean;
    readonly firstPowerShown: boolean;
    readonly rockerHint: boolean;
  };
  readonly install: {
    readonly available: boolean;
    readonly dismissed: boolean;
    readonly standalone: boolean;
  };
  readonly update: { readonly ready: boolean };
  readonly foreground: boolean;
}

export type StartFailCode =
  | "MODEM_LOAD_FAILED"
  | "NO_AUDIO_CONTEXT"
  | "SEND_UNAVAILABLE";

export type UiEvent =
  | { type: "power-tap"; now: number }
  | { type: "started"; now: number; mic: MicState }
  | { type: "start-failed"; code: StartFailCode }
  | { type: "send-busy"; now: number }
  | { type: "self-test-done"; now: number }
  | { type: "mic"; mic: MicState; now?: number; processingDisabled?: boolean }
  | { type: "latch-tap" }
  | { type: "channel"; channel: ProfileId }
  | { type: "draft"; text: string }
  | { type: "transmit"; now: number }
  | { type: "tx-start"; now: number; airtimeMs: number }
  | { type: "tx-end"; now: number; ok: boolean; slip: Slip | null }
  | { type: "airtime"; wireLength: number; ms: number; channel: ProfileId }
  | { type: "carrier"; active: boolean; now: number }
  | { type: "slip"; slip: Slip; now: number }
  | { type: "tape-toggle" }
  | { type: "legend-toggle" }
  | { type: "sheet-open"; sheet: SheetId }
  | { type: "sheet-close" }
  | { type: "onboarding-next" }
  | { type: "onboarding-skip" }
  | { type: "onboarding-done" }
  | { type: "foreground"; visible: boolean }
  | { type: "install-available"; available: boolean }
  /** With `now`, an Update ready slip is printed (once). Without it only the flag is set. */
  | { type: "update-ready"; now?: number }
  /** "Later": removes the Update ready slip and clears the flag. */
  | { type: "update-dismiss" }
  | { type: "hydrate"; saved: SavedState };

const FAULT_BY_CODE: Record<StartFailCode, Fault> = {
  MODEM_LOAD_FAILED: "modem",
  NO_AUDIO_CONTEXT: "no-audio",
  SEND_UNAVAILABLE: "send-unavailable",
};

export function initialState(saved: SavedState | null): UiState {
  const flags = saved?.flags ?? {
    onboarded: false,
    micWasGranted: false,
    firstPowerShown: false,
  };
  return {
    power: "off",
    fault: null,
    busyUntil: 0,
    errorUntil: 0,
    channel: saved?.channel ?? "room",
    draft: saved?.draft ?? "",
    latchPressed: true,
    mic: "idle",
    micProcessingWarn: false,
    micSheet: "none",
    tx: { phase: "idle", startedAt: 0, airtimeMs: null },
    carrier: { active: false, shownUntil: 0, lastOffAt: null },
    connectUntil: 0,
    airtimeByWire: {},
    tape: saved?.tape ?? [],
    tapeExpanded: false,
    legendOpen: false,
    sheet: flags.onboarded ? null : "onboarding-1",
    theme: "ghost",
    flags: { ...flags, rockerHint: false },
    install: { available: false, dismissed: false, standalone: false },
    update: { ready: false },
    foreground: true,
  };
}

/** Everything that belongs to one power-on, back to rest. */
function powerReset(s: UiState): UiState {
  return {
    ...s,
    power: "off",
    fault: null,
    busyUntil: 0,
    errorUntil: 0,
    mic: "idle",
    micProcessingWarn: false,
    micSheet: "none",
    latchPressed: true,
    tx: { phase: "idle", startedAt: 0, airtimeMs: null },
    carrier: { active: false, shownUntil: 0, lastOffAt: null },
    connectUntil: 0,
  };
}

const MIC_PROBLEMS: readonly MicState[] = [
  "denied",
  "no_device",
  "busy",
  "insecure",
  "error",
  "lost",
];

function micSheetFor(mic: MicState, wasGranted: boolean): SheetId {
  if (mic === "denied") return wasGranted ? "mic-reset" : "mic-denied";
  return "mic-error";
}

/**
 * Applies a microphone state. A problem opens the Microphone sheet once per
 * power-on (requirement 12.8). A later problem prints one notice slip instead
 * (12.10, 12.11). Repeating the same state changes nothing.
 */
function withMic(s: UiState, mic: MicState, now: number): UiState {
  if (mic === s.mic) return s;
  const flags =
    mic === "live" && !s.flags.micWasGranted
      ? { ...s.flags, micWasGranted: true }
      : s.flags;
  const next = { ...s, mic, flags };
  if (s.power === "off" || !MIC_PROBLEMS.includes(mic)) return next;
  if (s.micSheet === "none") {
    return {
      ...next,
      micSheet: "shown",
      sheet: micSheetFor(mic, s.flags.micWasGranted),
    };
  }
  if (s.micSheet === "shown") {
    return {
      ...next,
      micSheet: "again",
      tape: pushSlip(s.tape, {
        kind: "system",
        id: `mic-again-${now}`,
        at: now,
        noticeKey: "mic-again",
      }),
    };
  }
  return next;
}

/** True when a new carrier burst would show CARRIER: no earlier burst ended, or it ended QUIET_REARM_MS ago. */
export function carrierRearmed(
  carrier: UiState["carrier"],
  now: number,
): boolean {
  return (
    carrier.lastOffAt === null || now - carrier.lastOffAt >= QUIET_REARM_MS
  );
}
function carrierEvent(s: UiState, active: boolean, now: number): UiState {
  if (s.power !== "on") return s;
  if (!active) {
    if (!s.carrier.active) return s;
    return { ...s, carrier: { ...s.carrier, active: false, lastOffAt: now } };
  }
  if (s.carrier.active) {
    // A burst that is already shown keeps its hold alive. A suppressed one stays suppressed.
    if (now < s.carrier.shownUntil) {
      return {
        ...s,
        carrier: { ...s.carrier, shownUntil: now + CARRIER_HOLD_MS },
      };
    }
    return s;
  }
  const quiet = carrierRearmed(s.carrier, now);
  return {
    ...s,
    carrier: {
      ...s.carrier,
      active: true,
      shownUntil: quiet ? now + CARRIER_HOLD_MS : s.carrier.shownUntil,
    },
  };
}

function onboardingNext(s: UiState): UiState {
  if (s.sheet === "onboarding-1") return { ...s, sheet: "onboarding-2" };
  if (s.sheet === "onboarding-2") return { ...s, sheet: "onboarding-3" };
  if (s.sheet === "onboarding-3") return onboardingDone(s);
  return s;
}

function onboardingDone(s: UiState): UiState {
  if (s.sheet === null || !s.sheet.startsWith("onboarding-")) return s;
  return {
    ...s,
    sheet: null,
    flags: { ...s.flags, onboarded: true, rockerHint: true },
  };
}

/** Total and pure: every state and event pair returns a state. */
export function reduce(s: UiState, e: UiEvent): UiState {
  switch (e.type) {
    case "power-tap":
      if (s.power === "off") return { ...powerReset(s), power: "selftest" };
      if (s.power === "on") return powerReset(s);
      return s;
    case "started":
      if (s.power === "off") return s;
      return withMic(s, e.mic, e.now);
    case "start-failed":
      if (s.power === "off") return s;
      return { ...s, fault: FAULT_BY_CODE[e.code] };
    case "send-busy":
      if (s.power !== "on") return s;
      return { ...s, busyUntil: e.now + BUSY_FLASH_MS };
    case "self-test-done": {
      if (s.power !== "selftest") return s;
      const on: UiState = { ...s, power: "on" };
      // First power-on prints the "Listening while open" notice once per install (12.4).
      if (s.flags.firstPowerShown || s.fault !== null) return on;
      return {
        ...on,
        tape: pushSlip(s.tape, {
          kind: "system",
          id: `first-power-${e.now}`,
          at: e.now,
          noticeKey: "listening-open",
        }),
        flags: { ...s.flags, firstPowerShown: true },
      };
    }
    case "mic": {
      if (s.power === "off") return s;
      const next = withMic(s, e.mic, e.now ?? 0);
      return e.processingDisabled === undefined
        ? next
        : { ...next, micProcessingWarn: !e.processingDisabled };
    }
    case "latch-tap":
      if (s.power !== "on" || s.mic !== "live") return s;
      return { ...s, latchPressed: !s.latchPressed };
    case "channel":
      if (s.tx.phase === "sending" || s.channel === e.channel) return s;
      return { ...s, channel: e.channel, airtimeByWire: {} };
    case "draft":
      return { ...s, draft: e.text };
    case "transmit":
      // The controller builds the wire. Nothing changes until tx-start.
      return s;
    case "tx-start":
      if (s.power !== "on") return s;
      return {
        ...s,
        tx: { phase: "sending", startedAt: e.now, airtimeMs: e.airtimeMs },
      };
    case "tx-end": {
      const wasSending = s.tx.phase === "sending";
      const tx = { phase: "idle" as const, startedAt: 0, airtimeMs: null };
      const tape = e.slip === null ? s.tape : pushSlip(s.tape, e.slip);
      if (e.ok) {
        if (!wasSending) return s;
        return { ...s, tx, tape, draft: "" };
      }
      return {
        ...s,
        tx,
        tape,
        errorUntil: s.power === "on" ? e.now + ERROR_HOLD_MS : s.errorUntil,
      };
    }
    case "airtime":
      if (e.channel !== s.channel) return s;
      return {
        ...s,
        airtimeByWire: { ...s.airtimeByWire, [e.wireLength]: e.ms },
      };
    case "carrier":
      return carrierEvent(s, e.active, e.now);
    case "slip": {
      const tape = pushSlip(s.tape, e.slip);
      if (e.slip.kind === "heard" && s.power === "on") {
        return { ...s, tape, connectUntil: e.now + CONNECT_HOLD_MS };
      }
      return { ...s, tape };
    }
    case "tape-toggle":
      return { ...s, tapeExpanded: !s.tapeExpanded };
    case "legend-toggle":
      return { ...s, legendOpen: !s.legendOpen };
    case "sheet-open":
      return { ...s, sheet: e.sheet };
    case "sheet-close":
      return { ...s, sheet: null };
    case "onboarding-next":
      return onboardingNext(s);
    case "onboarding-skip":
    case "onboarding-done":
      return onboardingDone(s);
    case "foreground":
      return { ...s, foreground: e.visible };
    case "install-available":
      return { ...s, install: { ...s.install, available: e.available } };
    case "update-ready": {
      const printed = s.tape.some((x) => x.kind === "update-ready");
      if (e.now === undefined || printed) {
        return s.update.ready ? s : { ...s, update: { ready: true } };
      }
      return {
        ...s,
        update: { ready: true },
        tape: pushSlip(s.tape, {
          kind: "update-ready",
          id: `update-ready-${e.now}`,
          at: e.now,
        }),
      };
    }
    case "update-dismiss":
      return {
        ...s,
        update: { ready: false },
        tape: s.tape.filter((x) => x.kind !== "update-ready"),
      };
    case "hydrate":
      return {
        ...s,
        tape: e.saved.tape,
        draft: e.saved.draft,
        channel: e.saved.channel,
        flags: { ...e.saved.flags, rockerHint: s.flags.rockerHint },
      };
  }
}
