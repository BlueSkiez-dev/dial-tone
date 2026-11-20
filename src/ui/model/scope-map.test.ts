import { describe, expect, it } from "vitest";
import {
  binRange,
  canvasBuffer,
  formatKHz,
  scopeWindow,
  warmUpFrame,
} from "./scope-map";

describe("canvasBuffer", () => {
  it("is the Figma screen at 1x and 3x, at 390 px", () => {
    expect(canvasBuffer(290, 184, 1)).toEqual({ width: 290, height: 184 });
    expect(canvasBuffer(290, 184, 3)).toEqual({ width: 870, height: 552 });
  });
  it("rounds fractional sizes and ratios to whole pixels", () => {
    expect(canvasBuffer(256.5, 184, 2.625)).toEqual({
      width: 673,
      height: 483,
    });
  });
  it("never returns less than 1 x 1, even for a hidden or bad size", () => {
    expect(canvasBuffer(0, 0, 2)).toEqual({ width: 1, height: 1 });
    expect(canvasBuffer(Number.NaN, -5, Number.NaN)).toEqual({
      width: 1,
      height: 1,
    });
  });
});

describe("formatKHz", () => {
  it("rounds to one decimal", () => {
    expect(formatKHz(1120)).toBe("1.1");
    expect(formatKHz(2580)).toBe("2.6");
    expect(formatKHz(19400)).toBe("19.4");
  });
  it("drops a trailing .0", () => {
    expect(formatKHz(8000)).toBe("8");
    expect(formatKHz(0)).toBe("0");
  });
});

describe("scopeWindow", () => {
  it("Quiet is 12 to 20 kHz with the measured band", () => {
    expect(scopeWindow("quiet")).toEqual({
      loHz: 12000,
      hiHz: 20000,
      bandHz: [15000, 19400],
    });
  });
  it("Room is 0 to 8 kHz", () => {
    const w = scopeWindow("room");
    expect([w.loHz, w.hiHz]).toEqual([0, 8000]);
  });
});

describe("binRange", () => {
  it("maps Hz to bins at 48 kHz / 2048", () => {
    // bin width 23.4375 Hz
    expect(binRange(48000, 2048, 0, 8000)).toEqual({ lo: 0, hi: 342 });
  });
  it("clamps a window above Nyquist", () => {
    const r = binRange(8000, 256, 12000, 20000);
    expect(r).toEqual({ lo: 127, hi: 127 });
  });
});

describe("warmUpFrame", () => {
  it("starts as one centred row and ends at the full height", () => {
    const a = warmUpFrame(0, 184);
    expect(a.top).toBe(a.bottom);
    expect(a.top).toBe(91);
    expect(a.centerRow).toBe(91);
    const b = warmUpFrame(1, 184);
    expect([b.top, b.bottom]).toEqual([0, 183]);
    expect(b.halfHeight).toBe(92);
  });
  it("copes with a one-row Scope and bad input", () => {
    expect(warmUpFrame(0.5, 1)).toMatchObject({ top: 0, bottom: 0 });
    expect(warmUpFrame(Number.NaN, 10)).toMatchObject({ top: 4, bottom: 4 });
  });
});
