import type {
  ContextState,
  FromWorker,
  GraphLike,
  MicStreamLike,
  ToWorker,
  TransportDeps,
  WorkerEvent,
  WorkerFailCode,
  WorkerLike,
} from "../transport-deps";

export const RATE = 48000;
export const SAMPLES = 4800;

export interface Fakes {
  deps: TransportDeps;
  log: string[];
  worker: FakeWorker;
  graph: FakeGraph;
  gumCalls: () => number;
  playback: { hold: boolean; release: () => void };
  opts: Opts;
}

export interface Opts {
  mic: "ok" | "denied";
  graph: "ok" | "throws" | "attach-fails";
  init: "ok" | "load-fails" | "codec-fails" | "crashes";
}

export class FakeWorker implements WorkerLike {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readonly sent: ToWorker[] = [];
  readonly modulateWires: Uint8Array[] = [];
  terminated = false;
  airtimeAnswer = 1234;
  constructor(
    private readonly log: string[],
    private readonly opts: Opts,
  ) {}
  reply(m: FromWorker): void {
    queueMicrotask(() => this.onmessage?.({ data: m }));
  }
  push(event: WorkerEvent): void {
    this.onmessage?.({ data: { type: "event", event } satisfies FromWorker });
  }
  postMessage(message: unknown): void {
    const m = message as ToWorker;
    this.sent.push(m);
    if (m.type === "init") {
      if (this.opts.init === "crashes") {
        queueMicrotask(() => this.onerror?.({}));
      } else if (this.opts.init !== "ok") {
        const code: WorkerFailCode =
          this.opts.init === "load-fails"
            ? "MODEM_LOAD_FAILED"
            : "MODEM_FAILED";
        this.reply({ type: "failed", code });
      } else {
        this.reply({ type: "ready" });
      }
    } else if (m.type === "modulate") {
      this.modulateWires.push(m.wire);
      this.reply({
        type: "modulated",
        id: m.id,
        samples: new Float32Array(SAMPLES),
      });
    } else if (m.type === "gate") {
      this.log.push("gate");
    } else if (m.type === "airtime") {
      this.reply({
        type: "event",
        event: {
          kind: "airtime",
          profile: m.profile,
          attempt: m.attempt,
          byteLength: m.byteLength,
          ms: this.airtimeAnswer,
        },
      });
    }
  }
  terminate(): void {
    this.terminated = true;
  }
  count(type: ToWorker["type"]): number {
    return this.sent.filter((m) => m.type === type).length;
  }
}

export class FakeGraph implements GraphLike {
  readonly sampleRate = RATE;
  currentTime = 1;
  state: ContextState = "running";
  readonly analyser = {
    fftSize: 2048,
    frequencyBinCount: 1024,
    sampleRate: RATE,
    getByteFrequencyData: (_out: Uint8Array) => {},
  };
  closed = false;
  constructor(
    private readonly log: string[],
    private readonly opts: Opts,
    private readonly playback: { hold: boolean; waiters: (() => void)[] },
  ) {}
  async attachCapture(): Promise<void> {
    if (this.opts.graph === "attach-fails") throw new Error("no worklet");
  }
  connectMic(): () => void {
    return () => {};
  }
  playAt(_samples: Float32Array, _when: number): Promise<void> {
    this.log.push("play");
    if (!this.playback.hold) return Promise.resolve();
    return new Promise((resolve) => this.playback.waiters.push(resolve));
  }
  async resume(): Promise<void> {}
  async close(): Promise<void> {
    this.closed = true;
  }
  onStateChange(): void {}
}

export function makeFakes(partial: Partial<Opts> = {}): Fakes {
  const opts: Opts = { mic: "ok", graph: "ok", init: "ok", ...partial };
  const log: string[] = [];
  const state = { hold: false, waiters: [] as (() => void)[] };
  const worker = new FakeWorker(log, opts);
  const graph = new FakeGraph(log, opts, state);
  let gum = 0;
  const stream: MicStreamLike = {
    getAudioTracks: () => [
      {
        stop: () => {},
        getSettings: () => ({
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }),
        addEventListener: () => {},
      },
    ],
  };
  const deps: TransportDeps = {
    createGraph() {
      if (opts.graph === "throws") throw new Error("no audio context");
      return graph;
    },
    createWorker: () => worker,
    createChannel: () => ({ port1: {}, port2: {} }),
    async getUserMedia() {
      gum++;
      if (opts.mic === "denied") {
        throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
      }
      return stream;
    },
    onDeviceChange: () => () => {},
    isVisible: () => true,
    onVisibility: () => () => {},
    ggwaveUrl: "/vendor/ggwave.js",
  };
  const playback = {
    get hold() {
      return state.hold;
    },
    set hold(v: boolean) {
      state.hold = v;
    },
    release() {
      state.hold = false;
      for (const w of state.waiters.splice(0)) w();
    },
  };
  return {
    deps,
    log,
    worker,
    graph,
    gumCalls: () => gum,
    playback,
    opts,
  };
}
