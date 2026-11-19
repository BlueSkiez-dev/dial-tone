/**
 * FakeTransport: a UiTransport with no microphone, no worker and no AudioContext.
 * Used by `vite dev`, the dev panel and tests. Real audio is checked on `npm run preview`.
 */

import type {
  MicState,
  ProfileId,
  SendReport,
  SpectrumSource,
  StartError,
  TransportEvent,
} from "../audio";
import { PROFILES } from "../audio";
import type { Frame } from "../protocol";
import { decodeFrame, encodeFrame, GGWAVE_MAX_PAYLOAD } from "../protocol";
import type { UiTransport } from "./transport-seam";

/** Stand-in airtime model: 0.1 s per byte (tech.md). Never shown as measured. */
export const FAKE_AIRTIME_MS_PER_BYTE = 100;

export type FakeStartCode = StartError["code"];

export interface FakeTransportOptions {
  /** Delay before start() resolves. Default 10 ms. */
  readonly startDelayMs?: number;
  /** Mic state start() reports. Default "live". */
  readonly mic?: MicState;
  readonly sampleRate?: number;
}

export interface FakeControls {
  injectFrame(frame: Frame, ownEcho: boolean): void;
  injectCarrier(active: boolean): void;
  setMic(state: MicState): void;
  failStart(code: FakeStartCode | null): void;
  /** The next sends stay in flight for this many ms (0 clears). */
  holdSend(ms: number): void;
}

const FFT_SIZE = 2048;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createFakeTransport(
  opts: FakeTransportOptions = {},
): UiTransport & FakeControls {
  const sampleRate = opts.sampleRate ?? 48000;
  const listeners = new Set<(e: TransportEvent) => void>();
  const airtimeCache = new Map<string, number>();
  let started = false;
  let mic: MicState = opts.mic ?? "live";
  let profile: ProfileId = "room";
  let listening = true;
  let sending = false;
  let carrierActive = false;
  let failCode: FakeStartCode | null = null;
  let holdMs = 0;
  let atFrame = 0;
  let tick = 0;

  const emit = (e: TransportEvent): void => {
    for (const l of [...listeners]) l(e);
  };

  const analyser: SpectrumSource = {
    fftSize: FFT_SIZE,
    frequencyBinCount: FFT_SIZE / 2,
    sampleRate,
    getByteFrequencyData(out: Uint8Array): void {
      tick += 1;
      const binHz = sampleRate / FFT_SIZE;
      const band = PROFILES[profile].carrierBandHz;
      const active = sending || carrierActive;
      // Moving band: a 300 Hz wide window sweeping inside the profile band.
      let lo = -1;
      let hi = -1;
      if (active && band) {
        const span = Math.max(1, band[1] - band[0] - 300);
        const start = band[0] + ((tick * 40) % span);
        lo = Math.floor(start / binHz);
        hi = Math.floor((start + 300) / binHz);
      }
      for (let i = 0; i < out.length; i++) {
        const noise = (i * 31 + tick * 17) % 13;
        out[i] = i >= lo && i <= hi ? 200 + (noise % 40) : noise;
      }
    },
  };

  const airtimeFor = (byteLength: number): number =>
    byteLength * FAKE_AIRTIME_MS_PER_BYTE;

  const transport: UiTransport & FakeControls = {
    get profile() {
      return profile;
    },
    get analyser() {
      return started ? analyser : null;
    },

    async start() {
      await wait(opts.startDelayMs ?? 10);
      if (failCode) {
        return { ok: false, error: { code: failCode } };
      }
      started = true;
      emit({ kind: "mic", state: mic });
      return { ok: true, value: { sampleRate, mic } };
    },

    async restartMic() {
      if (!started) return { ok: false, error: { code: "NOT_STARTED" } };
      mic = "live";
      emit({ kind: "mic", state: mic });
      return { ok: true, value: undefined };
    },

    async stop() {
      started = false;
      sending = false;
      carrierActive = false;
    },

    setProfile(id) {
      if (!started) return { ok: false, error: { code: "NOT_STARTED" } };
      if (sending) return { ok: false, error: { code: "BUSY" } };
      profile = id;
      return { ok: true, value: undefined };
    },

    async send(wire) {
      if (wire.length === 0) return { ok: false, error: { code: "EMPTY" } };
      if (wire.length > GGWAVE_MAX_PAYLOAD) {
        return { ok: false, error: { code: "TOO_LONG" } };
      }
      if (!started) return { ok: false, error: { code: "NOT_STARTED" } };
      if (sending) return { ok: false, error: { code: "BUSY" } };
      sending = true;
      const protocol = PROFILES[profile].firstSpeed
        ? (`${PROFILES[profile].family}_${PROFILES[profile].firstSpeed}` as const)
        : "DT_FASTEST";
      const ms = airtimeFor(wire.length);
      emit({ kind: "tx", phase: "start", protocol, airtimeMs: ms });
      await wait(holdMs);
      sending = false;
      emit({ kind: "tx", phase: "end", protocol, airtimeMs: ms });
      const start = atFrame;
      atFrame += Math.round((ms / 1000) * sampleRate);
      const report: SendReport = {
        protocol,
        airtimeMs: ms,
        startFrame: start,
        endFrame: atFrame,
      };
      // Loop the frame back as our own echo, so the own-echo path is exercised.
      const decoded = decodeFrame(wire);
      if (decoded.ok && listening) {
        emit({
          kind: "frame",
          wire,
          frame: decoded.value,
          atFrame,
          ownEcho: true,
        });
      }
      return { ok: true, value: report };
    },

    airtimeMs(byteLength, attempt = 0) {
      if (!Number.isInteger(byteLength) || byteLength <= 0) return null;
      const key = `${profile}:${byteLength}`;
      const hit = airtimeCache.get(key);
      if (hit !== undefined) return hit;
      const answeredProfile = profile;
      queueMicrotask(() => {
        const ms = airtimeFor(byteLength);
        airtimeCache.set(key, ms);
        emit({
          kind: "airtime",
          profile: answeredProfile,
          byteLength,
          attempt,
          ms,
        });
      });
      return null;
    },

    setListening(on) {
      if (!started) return { ok: false, error: { code: "NOT_STARTED" } };
      if (mic !== "live") return { ok: false, error: { code: "NO_MIC" } };
      listening = on;
      emit({ kind: "listening", on });
      return { ok: true, value: undefined };
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    injectFrame(frame, ownEcho) {
      if (!started || !listening) return;
      const wire = encodeFrame(frame);
      if (!wire.ok) return;
      atFrame += 1;
      emit({ kind: "frame", wire: wire.value, frame, atFrame, ownEcho });
    },

    injectCarrier(active) {
      carrierActive = active;
      if (!started || !listening) return;
      atFrame += 1;
      emit({ kind: "carrier", profile, active, atFrame });
    },

    setMic(state) {
      mic = state;
      if (started) emit({ kind: "mic", state });
    },

    failStart(code) {
      failCode = code;
    },

    holdSend(ms) {
      holdMs = Math.max(0, ms);
    },
  };
  return transport;
}
