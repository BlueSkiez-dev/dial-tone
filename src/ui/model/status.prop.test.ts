import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { MicState, ProfileId } from "../../audio/index";
import { initialState, type UiState } from "./reducer";
import { type LedId, listenState, statusView, transmitState } from "./status";

const mics: readonly MicState[] = [
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
const NO_MIC: readonly MicState[] = [
  "lost",
  "denied",
  "no_device",
  "busy",
  "insecure",
  "error",
];
const t = fc.integer({ min: 0, max: 20_000 });

const uiState: fc.Arbitrary<UiState> = fc
  .record({
    power: fc.constantFrom("off" as const, "selftest" as const, "on" as const),
    fault: fc.constantFrom(
      null,
      "modem" as const,
      "no-audio" as const,
      "send-unavailable" as const,
    ),
    errorUntil: t,
    channel: fc.constantFrom(
      "room" as const,
      "call" as const,
      "quiet" as const,
    ),
    draft: fc.oneof(
      fc.constant(""),
      fc.string({ maxLength: 20 }),
      fc.string({ minLength: 129, maxLength: 140 }),
    ),
    latchPressed: fc.boolean(),
    mic: fc.constantFrom(...mics),
    sending: fc.boolean(),
    carrierShownUntil: t,
    connectUntil: t,
    foreground: fc.boolean(),
  })
  .map((r) => {
    const base = initialState(null);
    return {
      ...base,
      power: r.power,
      fault: r.fault,
      errorUntil: r.errorUntil,
      channel: r.channel as ProfileId,
      draft: r.draft,
      latchPressed: r.latchPressed,
      mic: r.mic,
      tx: r.sending
        ? { phase: "sending" as const, startedAt: 0, airtimeMs: 2200 }
        : base.tx,
      carrier: {
        active: false,
        shownUntil: r.carrierShownUntil,
        lastOffAt: null,
      },
      connectUntil: r.connectUntil,
      foreground: r.foreground,
    };
  });

const ALL: readonly LedId[] = ["MR", "AA", "CD", "OH", "RD", "SD"];
const lit = (leds: Record<LedId, boolean>) => ALL.filter((id) => leds[id]);

describe("Property 5: Status window", () => {
  /** **Validates: Requirements 8.3, 8.5, 8.9, 6.1, 11.1, 11.3, 11.7** */
  it("matches the table row by row", () => {
    fc.assert(
      fc.property(uiState, t, (s, now) => {
        const v = statusView(s, now);
        const on = lit(v.leds);
        if (s.power === "off") {
          return on.length === 0 && v.code === "— — —";
        }
        if (s.power === "selftest") {
          return on.length === 6 && v.code === "ATZ";
        }
        if (v.leds.OH !== (s.channel === "call")) return false;
        if (!v.leds.MR) return false;
        if (v.leds.SD !== (v.code === "ATDT")) return false;
        if (v.leds.RD !== (v.code === "CONNECT")) return false;
        if (v.leds.CD !== (v.code === "CARRIER")) return false;
        const listening = s.latchPressed && s.mic === "live" && s.foreground;
        // AA follows listening in every powered-on row (Figma, user decision).
        if (v.leds.AA !== listening) return false;
        if (s.fault !== null && v.code !== "ERROR") return false;
        if (v.code === "OK") {
          if (!(listening || NO_MIC.includes(s.mic))) return false;
        }
        if (v.code === "NO CARRIER") {
          return !listening && !NO_MIC.includes(s.mic);
        }
        if (v.hintKey === "too-long" && v.code !== "OK") return false;
        return true;
      }),
    );
  });
  it("lights SD only when sending, RD only in a connect hold, CD only in the carrier hold", () => {
    fc.assert(
      fc.property(uiState, t, (s, now) => {
        if (s.power !== "on") return true;
        const v = statusView(s, now);
        if (v.leds.SD && s.tx.phase !== "sending") return false;
        if (v.leds.RD && !(now < s.connectUntil)) return false;
        if (v.leds.CD && !(now < s.carrier.shownUntil)) return false;
        return true;
      }),
    );
  });

  it("lights no LED when off, OH included, on every channel", () => {
    fc.assert(
      fc.property(
        uiState,
        t,
        fc.constantFrom("room" as const, "call" as const, "quiet" as const),
        (s, now, channel) => {
          const v = statusView({ ...s, power: "off", channel }, now);
          return lit(v.leds).length === 0;
        },
      ),
    );
  });

  it("derives transmitState and listenState", () => {
    fc.assert(
      fc.property(uiState, (s) => {
        const tx = transmitState(s);
        const ls = listenState(s);
        if (s.power === "off") {
          if (tx !== "disabled" || ls !== "disabled") return false;
        }
        if (s.power === "on" && s.fault !== null && tx !== "disabled")
          return false;
        if (s.power === "on" && s.fault === null && s.tx.phase === "sending") {
          if (tx !== "sending") return false;
        }
        if (s.power === "on" && s.fault === null && s.tx.phase === "idle") {
          const bytes = new TextEncoder().encode(s.draft).length;
          const ok = bytes >= 1 && bytes <= 128;
          if ((tx === "default") !== ok) return false;
        }
        if (s.power === "on" && NO_MIC.includes(s.mic) && ls !== "no-mic") {
          return false;
        }
        if (s.power === "on" && s.mic === "live" && s.latchPressed) {
          if (ls !== "listening") return false;
        }
        return true;
      }),
    );
  });

  it("keeps Listening for a hidden page with a live mic and a pressed latch", () => {
    const s: UiState = {
      ...initialState(null),
      power: "on",
      mic: "live",
      latchPressed: true,
      foreground: false,
    };
    expect(listenState(s)).toBe("listening");
    const v = statusView(s, 0);
    expect(v.leds.AA).toBe(false);
    expect(v.hintKey).toBe("hidden");
  });
});
