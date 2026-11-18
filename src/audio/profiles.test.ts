import { describe, expect, it } from "vitest";
import {
  allRxProtocols,
  PROFILES,
  protocolFor,
  RX_LISTEN_SCOPE,
  rxProtocols,
  rxSet,
  speedFor,
} from "./profiles";

describe("PROFILES table", () => {
  it("maps Room, Call, Quiet to AUDIBLE, DT, ULTRASOUND", () => {
    expect(PROFILES.room.family).toBe("AUDIBLE");
    expect(PROFILES.call.family).toBe("DT");
    expect(PROFILES.quiet.family).toBe("ULTRASOUND");
  });

  it("has the documented first and retry speeds", () => {
    expect([PROFILES.room.firstSpeed, PROFILES.room.retrySpeed]).toEqual([
      "FASTEST",
      "FAST",
    ]);
    expect([PROFILES.call.firstSpeed, PROFILES.call.retrySpeed]).toEqual([
      "FASTEST",
      "FAST",
    ]);
    expect([PROFILES.quiet.firstSpeed, PROFILES.quiet.retrySpeed]).toEqual([
      "FASTEST",
      "FASTEST",
    ]);
  });

  it("has the documented bands and volume 25", () => {
    expect(PROFILES.room.carrierBandHz).toEqual([1900, 6400]);
    expect(PROFILES.call.carrierBandHz).toEqual([1120, 2580]);
    for (const p of Object.values(PROFILES)) expect(p.volume).toBe(25);
  });

  it("Quiet band is the measured [15000, 19400] Hz (task 3.1), below Nyquist", () => {
    const band = PROFILES.quiet.carrierBandHz;
    expect(band).not.toBeNull();
    expect(band).toEqual([15000, 19400]);
    if (band !== null) {
      expect(band[0]).toBeLessThan(band[1]);
      expect(band[1]).toBeLessThan(22050);
    }
  });

  it("has no radio profile", () => {
    expect(Object.keys(PROFILES).sort()).toEqual(["call", "quiet", "room"]);
    expect(Object.keys(PROFILES)).not.toContain("radio");
  });
});

describe("receive set", () => {
  it("rxProtocols per profile", () => {
    expect(rxProtocols(PROFILES.room)).toEqual([
      "AUDIBLE_FASTEST",
      "AUDIBLE_FAST",
    ]);
    expect(rxProtocols(PROFILES.call)).toEqual(["DT_FASTEST", "DT_FAST"]);
    expect(rxProtocols(PROFILES.quiet)).toEqual(["ULTRASOUND_FASTEST"]);
  });

  it("allRxProtocols is the five expected protocols", () => {
    expect([...allRxProtocols()].sort()).toEqual(
      [
        "AUDIBLE_FASTEST",
        "AUDIBLE_FAST",
        "DT_FASTEST",
        "DT_FAST",
        "ULTRASOUND_FASTEST",
      ].sort(),
    );
  });

  it("RX_LISTEN_SCOPE defaults to all", () => {
    expect(RX_LISTEN_SCOPE).toBe("all");
  });

  it("rxSet('all') ignores the profile", () => {
    for (const p of Object.values(PROFILES)) {
      expect(rxSet("all", p)).toEqual(allRxProtocols());
    }
  });

  it("rxSet('active') equals rxProtocols", () => {
    for (const p of Object.values(PROFILES)) {
      expect(rxSet("active", p)).toEqual(rxProtocols(p));
    }
  });
});

describe("speedFor / protocolFor", () => {
  it("first speed at attempt 0, retry at 1", () => {
    expect(speedFor(PROFILES.room, 0)).toBe("FASTEST");
    expect(speedFor(PROFILES.room, 1)).toBe("FAST");
    expect(protocolFor(PROFILES.call, 3)).toBe("DT_FAST");
    expect(protocolFor(PROFILES.quiet, 1)).toBe("ULTRASOUND_FASTEST");
  });

  it("treats NaN, negatives, fractions and non-numbers as attempt 0", () => {
    expect(speedFor(PROFILES.room, Number.NaN)).toBe("FASTEST");
    expect(speedFor(PROFILES.room, -2)).toBe("FASTEST");
    expect(speedFor(PROFILES.room, 1.5)).toBe("FASTEST");
    expect(speedFor(PROFILES.room, Number.POSITIVE_INFINITY)).toBe("FASTEST");
    expect(speedFor(PROFILES.room, "2" as unknown as number)).toBe("FASTEST");
  });
});
