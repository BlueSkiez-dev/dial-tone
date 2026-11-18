import { describe, expect, test } from "vitest";
import {
  classifyMicError,
  MIC_CONSTRAINTS,
  processingDisabled,
} from "./mic-state";

describe("MIC_CONSTRAINTS", () => {
  test("disables echo cancellation, noise suppression and auto gain", () => {
    expect(MIC_CONSTRAINTS.audio.echoCancellation).toBe(false);
    expect(MIC_CONSTRAINTS.audio.noiseSuppression).toBe(false);
    expect(MIC_CONSTRAINTS.audio.autoGainControl).toBe(false);
  });

  test("has no sampleRate", () => {
    expect("sampleRate" in MIC_CONSTRAINTS.audio).toBe(false);
  });
});

describe("classifyMicError", () => {
  test.each([
    ["NotAllowedError", "DENIED"],
    ["NotFoundError", "NO_DEVICE"],
    ["OverconstrainedError", "NO_DEVICE"],
    ["NotReadableError", "BUSY"],
    ["SecurityError", "INSECURE"],
    ["AbortError", "UNKNOWN"],
    ["", "UNKNOWN"],
    [undefined, "UNKNOWN"],
  ] as const)("%s -> %s", (name, code) => {
    expect(classifyMicError(name)).toBe(code);
  });
});

describe("processingDisabled", () => {
  test("true only when all three are exactly false", () => {
    expect(
      processingDisabled({
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      }),
    ).toBe(true);
  });

  test("false when any is true", () => {
    const f = false;
    expect(
      processingDisabled({
        echoCancellation: true,
        noiseSuppression: f,
        autoGainControl: f,
      }),
    ).toBe(false);
    expect(
      processingDisabled({
        echoCancellation: f,
        noiseSuppression: true,
        autoGainControl: f,
      }),
    ).toBe(false);
    expect(
      processingDisabled({
        echoCancellation: f,
        noiseSuppression: f,
        autoGainControl: true,
      }),
    ).toBe(false);
  });

  test("false for undefined fields", () => {
    expect(processingDisabled({})).toBe(false);
    expect(
      processingDisabled({ echoCancellation: false, noiseSuppression: false }),
    ).toBe(false);
  });
});
