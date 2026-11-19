/**
 * The browser audio graph: AudioContext, capture worklet node, gain-0 sink, AnalyserNode and
 * scheduled playback. No logic beyond wiring.
 */

import capturePath from "./capture-worklet.ts?worker&url";
import { cpuFlagFromSearch } from "./cpu-probe";
import decodeWorkerPath from "./decode-worker.ts?worker&url";
import type {
  ContextState,
  GraphLike,
  MicStreamLike,
  TransportDeps,
  WorkerLike,
} from "./transport-deps";
import type { SpectrumSource } from "./transport-types";

/** `rate` undefined means the device default. Throws when audio or AudioWorklet is missing. */
export function createBrowserGraph(
  rate: number | undefined,
  workletUrl: string,
): GraphLike {
  if (typeof AudioContext === "undefined") throw new Error("no AudioContext");
  const ctx = new AudioContext(
    rate === undefined ? undefined : { sampleRate: rate },
  );
  if (!ctx.audioWorklet) {
    void ctx.close();
    throw new Error("no AudioWorklet");
  }

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.5;
  // Gain 0 keeps the browser pulling the capture node and the analyser with no audible output.
  const sink = ctx.createGain();
  sink.gain.value = 0;
  sink.connect(ctx.destination);
  analyser.connect(sink);
  let capture: AudioWorkletNode | null = null;

  const spectrum: SpectrumSource = {
    get fftSize() {
      return analyser.fftSize;
    },
    get frequencyBinCount() {
      return analyser.frequencyBinCount;
    },
    get sampleRate() {
      return ctx.sampleRate;
    },
    getByteFrequencyData: (out) =>
      analyser.getByteFrequencyData(out as Uint8Array<ArrayBuffer>),
  };

  return {
    get sampleRate() {
      return ctx.sampleRate;
    },
    get currentTime() {
      return ctx.currentTime;
    },
    get state() {
      return ctx.state as ContextState;
    },
    analyser: spectrum,
    async attachCapture(port) {
      await ctx.audioWorklet.addModule(workletUrl);
      capture = new AudioWorkletNode(ctx, "capture", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: "explicit",
      });
      capture.port.postMessage({ port }, [port as MessagePort]);
      capture.connect(sink);
    },
    connectMic(stream: MicStreamLike) {
      if (!capture) throw new Error("capture node missing");
      const source = ctx.createMediaStreamSource(
        stream as unknown as MediaStream,
      );
      source.connect(capture);
      source.connect(analyser);
      return () => source.disconnect();
    },
    playAt(samples, when) {
      const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(ctx.destination);
      node.connect(analyser);
      return new Promise<void>((resolve) => {
        node.onended = () => resolve();
        node.start(when);
      });
    },
    resume: () => ctx.resume(),
    close: () => ctx.close(),
    onStateChange(cb) {
      ctx.onstatechange = () => cb(ctx.state as ContextState);
    },
  };
}

/** Real browser dependencies. Classic worker and worklet, vendored ggwave by URL, no network. */
export function browserDeps(): TransportDeps {
  const devices =
    typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
  return {
    createGraph: (rate) => createBrowserGraph(rate, capturePath),
    createWorker: () =>
      new Worker(decodeWorkerPath, {
        type: "classic",
      }) as unknown as WorkerLike,
    createChannel: () => new MessageChannel(),
    getUserMedia: async (constraints) => {
      if (!devices) {
        throw Object.assign(new Error("insecure context"), {
          name: "SecurityError",
        });
      }
      const stream = await devices.getUserMedia(
        constraints as MediaStreamConstraints,
      );
      return stream as unknown as MicStreamLike;
    },
    onDeviceChange: (cb) => {
      devices?.addEventListener("devicechange", cb);
      return () => devices?.removeEventListener("devicechange", cb);
    },
    isVisible: () => document.visibilityState !== "hidden",
    onVisibility: (cb) => {
      const handler = () => cb(document.visibilityState !== "hidden");
      document.addEventListener("visibilitychange", handler);
      return () => document.removeEventListener("visibilitychange", handler);
    },
    ggwaveUrl: new URL("../../vendor/ggwave.js", import.meta.url).href,
    debugCpu:
      typeof location !== "undefined" && cpuFlagFromSearch(location.search),
  };
}
