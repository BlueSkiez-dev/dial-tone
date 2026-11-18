/**
 * Pure parts of microphone setup: constraints, error classification, state reducer.
 * No browser global is used. The constraints type is declared locally because the
 * project has no DOM lib.
 */

export interface MicConstraints {
  readonly audio: {
    readonly echoCancellation: false;
    readonly noiseSuppression: false;
    readonly autoGainControl: false;
    readonly channelCount: 1;
  };
  readonly video: false;
}

/** No `sampleRate`: the browser uses the AudioContext's rate. */
export const MIC_CONSTRAINTS: MicConstraints = Object.freeze({
  audio: Object.freeze({
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  }),
  video: false,
} as const);

export type MicErrorCode =
  | "DENIED"
  | "NO_DEVICE"
  | "BUSY"
  | "INSECURE"
  | "UNKNOWN";

export function classifyMicError(name: string | undefined): MicErrorCode {
  switch (name) {
    case "NotAllowedError":
      return "DENIED";
    case "NotFoundError":
    case "OverconstrainedError":
      return "NO_DEVICE";
    case "NotReadableError":
      return "BUSY";
    case "SecurityError":
      return "INSECURE";
    default:
      return "UNKNOWN";
  }
}

/** True only when all three settings are exactly `false`. */
export function processingDisabled(s: {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}): boolean {
  return (
    s.echoCancellation === false &&
    s.noiseSuppression === false &&
    s.autoGainControl === false
  );
}

export type MicState =
  | "idle"
  | "requesting"
  | "live"
  | "muted"
  | "lost"
  | "denied"
  | "no_device"
  | "busy"
  | "insecure"
  | "error";

export type MicEvent =
  | { type: "request" }
  | { type: "granted" }
  | { type: "failed"; code: MicErrorCode }
  | { type: "track-ended" }
  | { type: "track-muted" }
  | { type: "track-unmuted" }
  | { type: "stop" };

const FAILED_STATE: Record<MicErrorCode, MicState> = {
  DENIED: "denied",
  NO_DEVICE: "no_device",
  BUSY: "busy",
  INSECURE: "insecure",
  UNKNOWN: "error",
};

/**
 * Total over every state and event. `live` is reached only from `requesting` on
 * `granted` or from `muted` on `track-unmuted`. `stop` always gives `idle`.
 * Events that make no sense in a state leave it unchanged.
 */
export function micReducer(state: MicState, event: MicEvent): MicState {
  switch (event.type) {
    case "stop":
      return "idle";
    case "request":
      // A new request is allowed from rest or failure states, never while open.
      return state === "live" || state === "muted" || state === "requesting"
        ? state
        : "requesting";
    case "granted":
      return state === "requesting" ? "live" : state;
    case "failed":
      return state === "requesting"
        ? (FAILED_STATE[event.code] ?? "error")
        : state;
    case "track-ended":
      return state === "live" || state === "muted" ? "lost" : state;
    case "track-muted":
      return state === "live" ? "muted" : state;
    case "track-unmuted":
      return state === "muted" ? "live" : state;
    default:
      return state;
  }
}
