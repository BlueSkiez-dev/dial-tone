/**
 * The real Modem. The only file in src/audio that touches ggwave.
 *
 * ggwave's rxToggleProtocol is global to the loaded module and only affects decoders created after
 * the call. So a decoder's protocol set is fixed at creation, and toggle-all plus create runs as one
 * synchronous step behind a per-decode-module queue (the Setup_Mutex).
 *
 * Two modules are loaded per Modem: a decode module (decoders only, owns the toggle state) and an
 * encode module (modulate only). A module holds at most MAX_INSTANCES_PER_MODULE live instances.
 *
 * Test seam (internal): `createGgwaveModem` calls `factory` exactly twice, first for the decode
 * module, then for the encode module. A test can return a wrapper (Proxy) around the real module
 * from the factory that records or overrides `init`, `free` and `rxToggleProtocol`. All state here
 * is keyed on the object the factory returns, so the wrapper is what gets tracked.
 */

import { GGWAVE_MAX_PAYLOAD } from "../protocol";
import { CHUNK_SAMPLES, RX_SAMPLE_RATE } from "./constants";
import { type Modem, type ModemDecoder, ModemError } from "./modem";
import type { ProtocolId } from "./profiles";

export { RX_SAMPLE_RATE };

/**
 * ggwave 0.4.0 allows at most 4 live instances per loaded module. Finding: of 12 init() calls, the
 * first 4 returned ids 0 to 3 and the rest returned -1. A -1 instance decodes nothing, and
 * encoding with one crashed. A negative id must never be passed to free, encode or decode.
 */
export const MAX_INSTANCES_PER_MODULE = 4;

/** Opaque embind enum value from `ggwave.ProtocolId`. */
type GgwaveProtocol = { readonly value: number };

interface GgwaveParameters {
  sampleRateInp: number;
  sampleRateOut: number;
}

/** Mirrors the API of the vendored ggwave 0.4.0 build that ggwave.slow.test.ts uses. */
export interface GgwaveFactoryResult {
  getDefaultParameters(): GgwaveParameters;
  init(parameters: GgwaveParameters): number;
  free(instance: number): void;
  encode(
    instance: number,
    payload: Uint8Array,
    protocol: GgwaveProtocol,
    volume: number,
  ): Int8Array;
  decode(instance: number, samples: Int8Array): Uint8Array | null | undefined;
  rxToggleProtocol(protocol: GgwaveProtocol, enabled: number): void;
  disableLog(): void;
  ProtocolId: Record<string, GgwaveProtocol>;
}

/**
 * Every ggwave protocol of the vendored build, including NORMAL modes and unused families.
 * Each setup sets all of them explicitly.
 */
const ALL_GGWAVE_PROTOCOLS: readonly string[] = [
  "AUDIBLE_NORMAL",
  "AUDIBLE_FAST",
  "AUDIBLE_FASTEST",
  "ULTRASOUND_NORMAL",
  "ULTRASOUND_FAST",
  "ULTRASOUND_FASTEST",
  "DT_NORMAL",
  "DT_FAST",
  "DT_FASTEST",
];

declare const ggwave_factory: (() => Promise<GgwaveFactoryResult>) | undefined;

/** The factory that `importScripts("vendor/ggwave.js")` defines as a global in the decode worker. */
export function ggwaveFactoryFromGlobal(): () => Promise<GgwaveFactoryResult> {
  if (typeof ggwave_factory !== "function") {
    throw new ModemError("MODULATE_FAILED", "ggwave_factory is not loaded");
  }
  return ggwave_factory;
}

/** Setup_Mutex: one promise queue per decode module. */
const setupQueues = new WeakMap<GgwaveFactoryResult, Promise<unknown>>();

/** Live decoder instances per decode module. */
const liveCounts = new WeakMap<GgwaveFactoryResult, number>();

/** Runs `fn` with console.log muted, because ggwave's encode may printf(). */
function quiet<T>(fn: () => T): T {
  const log = console.log;
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
  }
}

function protocolOf(gg: GgwaveFactoryResult, id: string): GgwaveProtocol {
  const p = gg.ProtocolId[`GGWAVE_PROTOCOL_${id}`];
  if (p === undefined) {
    throw new ModemError("MODULATE_FAILED", `ggwave has no protocol ${id}`);
  }
  return p;
}

/** Returns the raw id. A negative id means ggwave is out of instances. */
function newInstance(gg: GgwaveFactoryResult, rate: number): number {
  const params = gg.getDefaultParameters();
  params.sampleRateInp = rate;
  params.sampleRateOut = rate;
  return gg.init(params);
}

/** Explicit on/off for every known protocol. Never relies on defaults or earlier state. */
function toggleAll(
  gg: GgwaveFactoryResult,
  enabled: ReadonlySet<string>,
): void {
  for (const id of ALL_GGWAVE_PROTOCOLS) {
    gg.rxToggleProtocol(protocolOf(gg, id), enabled.has(id) ? 1 : 0);
  }
}

export async function createGgwaveModem(
  factory: () => Promise<GgwaveFactoryResult>,
  opts: { txSampleRate: number },
): Promise<Modem> {
  const dec = await factory();
  const enc = await factory();
  dec.disableLog();
  enc.disableLog();
  const { txSampleRate } = opts;

  const getLive = (): number => liveCounts.get(dec) ?? 0;
  const addLive = (delta: number): void => {
    liveCounts.set(dec, getLive() + delta);
  };

  const mine = new Set<ModemDecoder>();
  let disposed = false;

  function makeDecoder(
    own: readonly ProtocolId[],
    ownSet: ReadonlySet<string>,
    initialId: number,
  ): ModemDecoder {
    let instance = initialId; // -1 once dead or disposed
    let counted = true; // still counted in the live total
    const release = (): void => {
      if (counted) {
        counted = false;
        addLive(-1);
      }
      mine.delete(decoder);
    };
    const decoder: ModemDecoder = {
      protocols: own,
      feed(block: Float32Array): Uint8Array | null {
        if (instance < 0 || block.length !== CHUNK_SAMPLES) return null;
        const id = instance;
        const view = new Int8Array(
          block.buffer,
          block.byteOffset,
          block.byteLength,
        );
        const res = quiet(() => dec.decode(id, view));
        if (!res || res.length === 0) return null;
        return Uint8Array.from(res);
      },
      reset(): void {
        if (instance < 0) return;
        toggleAll(dec, ownSet);
        dec.free(instance);
        instance = -1;
        const next = newInstance(dec, RX_SAMPLE_RATE);
        if (next < 0) {
          release();
          throw new ModemError("NO_INSTANCE");
        }
        instance = next;
      },
      dispose(): void {
        if (instance >= 0) {
          dec.free(instance);
          instance = -1;
        }
        release();
      },
    };
    return decoder;
  }

  /** One synchronous step: toggle all, then create. No await inside. */
  function setupDecoders(
    protocols: readonly ProtocolId[],
    count: number,
  ): ModemDecoder[] {
    if (getLive() + count > MAX_INSTANCES_PER_MODULE) {
      throw new ModemError("NO_INSTANCE");
    }
    const own: readonly ProtocolId[] = [...protocols];
    const ownSet = new Set<string>(own);
    toggleAll(dec, ownSet);
    const created: ModemDecoder[] = [];
    for (let i = 0; i < count; i++) {
      const id = newInstance(dec, RX_SAMPLE_RATE);
      if (id < 0) {
        // Free what this setup made. Never free the negative id.
        for (const d of created) d.dispose();
        throw new ModemError("NO_INSTANCE");
      }
      addLive(1);
      const decoder = makeDecoder(own, ownSet, id);
      mine.add(decoder);
      created.push(decoder);
    }
    return created;
  }

  return {
    txSampleRate,
    rxSampleRate: RX_SAMPLE_RATE,

    modulate(payload, protocol, volume): Float32Array {
      if (payload.length === 0 || payload.length > GGWAVE_MAX_PAYLOAD) {
        throw new ModemError("BAD_LENGTH");
      }
      const p = protocolOf(enc, protocol);
      const tx = newInstance(enc, txSampleRate);
      if (tx < 0) throw new ModemError("NO_INSTANCE");
      try {
        const view = quiet(() => enc.encode(tx, payload, p, volume));
        // Copy out of WASM memory before any other call.
        const bytes = new Int8Array(view);
        return new Float32Array(
          bytes.buffer,
          0,
          Math.floor(bytes.byteLength / 4),
        );
      } finally {
        if (tx >= 0) enc.free(tx);
      }
    },

    createDecoders(protocols, count): Promise<ModemDecoder[]> {
      const prev = setupQueues.get(dec) ?? Promise.resolve();
      const run = prev.then(() => {
        if (disposed) throw new ModemError("MODULATE_FAILED", "modem disposed");
        return setupDecoders(protocols, count);
      });
      // Keep the queue alive after a failed setup.
      setupQueues.set(
        dec,
        run.catch(() => undefined),
      );
      return run;
    },

    dispose(): void {
      disposed = true;
      for (const d of [...mine]) d.dispose();
      // Modules have no free API. Dropping our references is all that can be done.
    },
  };
}
