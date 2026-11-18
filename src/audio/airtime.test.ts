import { describe, expect, it } from "vitest";
import { airtimeMs } from "./airtime";
import { PROFILES } from "./profiles";
import { createFakeModem } from "./testing/fake-modem";

describe("airtimeMs", () => {
  it("returns samples / txSampleRate in milliseconds", () => {
    const modem = createFakeModem({ txSampleRate: 1000 });
    // Fake packet: 6 header + n payload + 2 end samples.
    expect(airtimeMs(modem, PROFILES.call, 0, 10)).toBe(18);
  });

  it("calls modulate once per (protocol, length) and caches after", () => {
    let modulations = 0;
    const modem = createFakeModem({
      txSampleRate: 48000,
      onCall: (name) => {
        if (name === "modulate") modulations++;
      },
    });
    const first = airtimeMs(modem, PROFILES.call, 0, 24);
    expect(modulations).toBe(1);
    expect(airtimeMs(modem, PROFILES.call, 0, 24)).toBe(first);
    expect(modulations).toBe(1);
    airtimeMs(modem, PROFILES.call, 0, 25);
    expect(modulations).toBe(2);
    airtimeMs(modem, PROFILES.call, 1, 24);
    expect(modulations).toBe(3);
  });

  it("keeps separate caches per modem instance", () => {
    let modulations = 0;
    const opts = {
      txSampleRate: 48000,
      onCall: (name: string) => {
        if (name === "modulate") modulations++;
      },
    };
    airtimeMs(createFakeModem(opts), PROFILES.room, 0, 5);
    airtimeMs(createFakeModem(opts), PROFILES.room, 0, 5);
    expect(modulations).toBe(2);
  });

  it("never gives less airtime for a longer payload", () => {
    const modem = createFakeModem({ txSampleRate: 44100 });
    let previous = 0;
    for (let n = 1; n <= 140; n++) {
      const ms = airtimeMs(modem, PROFILES.room, 0, n);
      expect(ms).toBeGreaterThanOrEqual(previous);
      previous = ms;
    }
  });
});
