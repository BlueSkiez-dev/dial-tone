import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  classifyMicError,
  MIC_CONSTRAINTS,
  type MicErrorCode,
  type MicEvent,
  type MicState,
  micReducer,
} from "./mic-state";

// On failure fast-check's error message includes the seed and path.
const RUNS = { numRuns: 200, verbose: true };

const CODES: readonly MicErrorCode[] = [
  "DENIED",
  "NO_DEVICE",
  "BUSY",
  "INSECURE",
  "UNKNOWN",
];
const STATES: readonly MicState[] = [
  "idle",
  "requesting",
  "live",
  "muted",
  "lost",
  "denied",
  "no_device",
  "busy",
  "insecure",
  "error",
];

const state = fc.constantFrom(...STATES);
const event: fc.Arbitrary<MicEvent> = fc.oneof(
  fc.constantFrom<MicEvent>(
    { type: "request" },
    { type: "granted" },
    { type: "track-ended" },
    { type: "track-muted" },
    { type: "track-unmuted" },
    { type: "stop" },
  ),
  fc.constantFrom(...CODES).map((code): MicEvent => ({ type: "failed", code })),
);

describe("Property 11: Mic setup", () => {
  /** **Validates: Requirements 6.1** */
  test("constraints keep the three processing flags false", () => {
    expect(MIC_CONSTRAINTS.audio.echoCancellation).toBe(false);
    expect(MIC_CONSTRAINTS.audio.noiseSuppression).toBe(false);
    expect(MIC_CONSTRAINTS.audio.autoGainControl).toBe(false);
  });

  /** **Validates: Requirements 6.2** */
  test("classifyMicError is total and returns a code in the closed set", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.constant(undefined)), (name) => {
        expect(CODES).toContain(classifyMicError(name));
      }),
      RUNS,
    );
  });

  /** **Validates: Requirements 6.3, 6.4** */
  test("micReducer is total and stays in the state set", () => {
    fc.assert(
      fc.property(state, event, (s, e) => {
        expect(STATES).toContain(micReducer(s, e));
      }),
      RUNS,
    );
  });

  /** **Validates: Requirements 6.3, 6.4** */
  test("live is reached only from requesting on granted or muted on track-unmuted", () => {
    fc.assert(
      fc.property(state, event, (s, e) => {
        const next = micReducer(s, e);
        if (next === "live" && s !== "live") {
          const ok =
            (s === "requesting" && e.type === "granted") ||
            (s === "muted" && e.type === "track-unmuted");
          expect(ok).toBe(true);
        }
      }),
      RUNS,
    );
  });

  /** **Validates: Requirements 6.4** */
  test("stop always gives idle", () => {
    fc.assert(
      fc.property(state, (s) => {
        expect(micReducer(s, { type: "stop" })).toBe("idle");
      }),
      RUNS,
    );
  });

  /** **Validates: Requirements 6.3, 6.4** */
  test("a random event sequence never leaves the state set", () => {
    fc.assert(
      fc.property(fc.array(event, { maxLength: 60 }), (events) => {
        let s: MicState = "idle";
        for (const e of events) {
          s = micReducer(s, e);
          expect(STATES).toContain(s);
        }
      }),
      RUNS,
    );
  });
});
