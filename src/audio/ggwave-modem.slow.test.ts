import { createRequire } from "node:module";
import fc from "fast-check";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CHUNK_SAMPLES } from "./constants";
import { createGgwaveModem, type GgwaveFactoryResult } from "./ggwave-modem";
import type { Modem, ModemDecoder } from "./modem";
import type { Family, ProtocolId } from "./profiles";

// Slow tests for Property 15 (toggle isolation and serialization) on the
// vendored ggwave 0.4.0 WASM build. Only `npm.cmd run test:slow`
// (vitest.slow.config.ts) picks up this file.

const SAMPLE_RATE = 48000;
const VOLUME = 25;
/** Silence before and after the waveform (0.6 s), as in ggwave.slow.test.ts. */
const PAD_SAMPLES = Math.round(0.6 * SAMPLE_RATE);

/** Every protocol of the vendored build. Mirrors ALL_GGWAVE_PROTOCOLS in ggwave-modem.ts. */
const ALL_IDS = [
  "AUDIBLE_NORMAL",
  "AUDIBLE_FAST",
  "AUDIBLE_FASTEST",
  "ULTRASOUND_NORMAL",
  "ULTRASOUND_FAST",
  "ULTRASOUND_FASTEST",
  "DT_NORMAL",
  "DT_FAST",
  "DT_FASTEST",
] as const;

/** The protocols the app can name (NORMAL speeds are not representable). */
const PROBES: readonly ProtocolId[] = [
  "AUDIBLE_FASTEST",
  "AUDIBLE_FAST",
  "DT_FASTEST",
  "DT_FAST",
  "ULTRASOUND_FASTEST",
  "ULTRASOUND_FAST",
];

const FAMILIES: readonly Family[] = ["AUDIBLE", "DT", "ULTRASOUND"];

// verbose prints the seed and path on failure so failures can be replayed.
const PARAMS = { verbose: true, numRuns: 3 } as const;
const SLOW_TIMEOUT = 900_000;

/*
 * Instance budget. ggwave 0.4.0 allows 4 live instances per loaded module
 * (MAX_INSTANCES_PER_MODULE), and init() returns -1 beyond that. An earlier
 * version of (b) and (c) held 12 decoders, so most of them were dead (-1) and
 * the "misses at every offset" were the budget, not frame alignment. Every
 * test here keeps at most 4 live instances per module and frees them:
 * - the raw tests use `gg`, their own module, never the modem's modules;
 * - the shared `modem` (its two modules come from two factory calls) is used by
 *   (b), (c) and (e);
 * - `offsetModem` has its own two modules and serves the offset diagnostic;
 * - (f) builds fresh modems, so its counts start at zero.
 */

/** The raw module for the raw-ggwave tests. Never handed to a modem. */
let gg: GgwaveFactoryResult;
let modem: Modem;
/** The diagnostic's fresh decoders live here, so they never count against `modem`. */
let offsetModem: Modem;
/** The modules of the shared `modem`, decode first. */
let sharedModules: readonly Instrumented[] = [];

type Protocol = GgwaveFactoryResult["ProtocolId"][string];

/** Loads a new ggwave module (every call of the vendored factory is a separate WASM instance). */
function loadGgwave(): Promise<GgwaveFactoryResult> {
  const factory = createRequire(import.meta.url)(
    "../../vendor/ggwave.js",
  ) as () => Promise<GgwaveFactoryResult>;
  return factory();
}

/**
 * A module wrapper that records init and free calls and can force init to
 * return -1. `raw` is the real module (for HEAP8), `mod` is what the modem sees.
 */
interface Instrumented {
  readonly mod: GgwaveFactoryResult;
  readonly raw: GgwaveFactoryResult;
  /** Every id init returned, in order (-1 included). */
  readonly inits: number[];
  /** Every id passed to free, in order. */
  readonly frees: number[];
  /** Successful inits still allowed. At 0, init returns -1 without calling ggwave. */
  initsLeft: number;
}

function instrument(raw: GgwaveFactoryResult): Instrumented {
  const state: Instrumented = {
    raw,
    inits: [],
    frees: [],
    initsLeft: Number.POSITIVE_INFINITY,
    mod: {
      getDefaultParameters: () => raw.getDefaultParameters(),
      init: (parameters) => {
        let id = -1;
        if (state.initsLeft > 0) {
          state.initsLeft--;
          id = raw.init(parameters);
        }
        state.inits.push(id);
        return id;
      },
      free: (instance) => {
        state.frees.push(instance);
        // Record a negative id, but never hand it to ggwave.
        if (instance >= 0) raw.free(instance);
      },
      encode: (instance, payload, protocol, volume) =>
        raw.encode(instance, payload, protocol, volume),
      decode: (instance, samples) => raw.decode(instance, samples),
      rxToggleProtocol: (protocol, enabled) =>
        raw.rxToggleProtocol(protocol, enabled),
      disableLog: () => raw.disableLog(),
      ProtocolId: raw.ProtocolId,
    },
  };
  return state;
}

interface InstrumentedModem {
  readonly modem: Modem;
  readonly decode: Instrumented;
  readonly encode: Instrumented;
}

/** A modem on two new instrumented modules: the first factory call is the decode module. */
async function makeInstrumented(): Promise<InstrumentedModem> {
  const modules: Instrumented[] = [];
  const m = await createGgwaveModem(
    async () => {
      const i = instrument(await loadGgwave());
      modules.push(i);
      return i.mod;
    },
    { txSampleRate: SAMPLE_RATE },
  );
  const [decode, encode] = modules;
  if (decode === undefined || encode === undefined || modules.length !== 2) {
    throw new Error("createGgwaveModem must call the factory exactly twice");
  }
  return { modem: m, decode, encode };
}

/** Decoders and modems that the current test created. afterEach frees whatever is left. */
const trackedDecoders = new Set<ModemDecoder>();
const trackedModems = new Set<Modem>();

function track(decoders: readonly ModemDecoder[]): ModemDecoder[] {
  for (const d of decoders) trackedDecoders.add(d);
  return [...decoders];
}

async function freshModem(): Promise<InstrumentedModem> {
  const made = await makeInstrumented();
  trackedModems.add(made.modem);
  return made;
}

function protocolOf(id: string, mod: GgwaveFactoryResult = gg): Protocol {
  const p = mod.ProtocolId[`GGWAVE_PROTOCOL_${id}`];
  if (p === undefined) throw new Error(`ggwave has no protocol ${id}`);
  return p;
}

/** Sets every protocol on or off through the raw module(s). */
function toggleRaw(
  enabledFor: (id: string) => boolean,
  mods: readonly GgwaveFactoryResult[] = [gg],
): void {
  for (const mod of mods) {
    for (const id of ALL_IDS) {
      mod.rxToggleProtocol(protocolOf(id, mod), enabledFor(id) ? 1 : 0);
    }
  }
}

/** Creates a raw instance on `gg`. Throws on -1, so a negative id is never used or freed. */
function newRawInstance(): number {
  const p = gg.getDefaultParameters();
  p.sampleRateInp = SAMPLE_RATE;
  p.sampleRateOut = SAMPLE_RATE;
  const id = gg.init(p);
  if (id < 0) throw new Error("ggwave is out of instances (init returned -1)");
  return id;
}

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

/** Raw ggwave encode. Returns a copy of the waveform. */
function rawModulate(payload: Uint8Array, id: string): Float32Array {
  const tx = newRawInstance();
  try {
    const p = protocolOf(id);
    const view = quiet(() => gg.encode(tx, payload, p, VOLUME));
    const bytes = new Int8Array(view);
    return new Float32Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 4));
  } finally {
    gg.free(tx);
  }
}

/** Pads with `lead` extra silent samples, then silence on both sides, to a multiple of CHUNK_SAMPLES. */
function padToBlocks(wave: Float32Array, lead: number): Float32Array[] {
  const used = lead + PAD_SAMPLES + wave.length + PAD_SAMPLES;
  const total = Math.ceil(used / CHUNK_SAMPLES) * CHUNK_SAMPLES;
  const samples = new Float32Array(total);
  samples.set(wave, lead + PAD_SAMPLES);
  const blocks: Float32Array[] = [];
  for (let i = 0; i < total; i += CHUNK_SAMPLES) {
    blocks.push(samples.slice(i, i + CHUNK_SAMPLES));
  }
  return blocks;
}

/** Streams blocks to a raw instance. Returns the first decoded payload or null. */
function rawDecode(rx: number, blocks: readonly Float32Array[]) {
  for (const block of blocks) {
    const view = new Int8Array(
      block.buffer,
      block.byteOffset,
      block.byteLength,
    );
    const res = quiet(() => gg.decode(rx, view));
    if (res && res.length > 0) return Uint8Array.from(res);
  }
  return null;
}

/** Streams blocks to a modem decoder. Returns the first decoded payload or null. */
function feedAll(decoder: ModemDecoder, blocks: readonly Float32Array[]) {
  for (const block of blocks) {
    const res = decoder.feed(block);
    if (res !== null) return res;
  }
  return null;
}

/** Waveform blocks for every probe protocol, through the real Modem. */
function probeBlocks(
  payload: Uint8Array,
  lead: number,
): Map<ProtocolId, Float32Array[]> {
  const out = new Map<ProtocolId, Float32Array[]>();
  for (const protocol of PROBES) {
    out.set(
      protocol,
      padToBlocks(modem.modulate(payload, protocol, VOLUME), lead),
    );
  }
  return out;
}

/** Decoder_Offset step in samples. */
const OFFSET_STEP = 256;
const OTHER_OFFSETS = [OFFSET_STEP, 2 * OFFSET_STEP, 3 * OFFSET_STEP] as const;

/** Prepends `zeros` silent samples and re-chunks (the stream moves later by `zeros`). */
function shiftBlocks(
  blocks: readonly Float32Array[],
  zeros: number,
): Float32Array[] {
  const used = zeros + blocks.length * CHUNK_SAMPLES;
  const total = Math.ceil(used / CHUNK_SAMPLES) * CHUNK_SAMPLES;
  const samples = new Float32Array(total);
  blocks.forEach((b, i) => {
    samples.set(b, zeros + i * CHUNK_SAMPLES);
  });
  const out: Float32Array[] = [];
  for (let i = 0; i < total; i += CHUNK_SAMPLES) {
    out.push(samples.slice(i, i + CHUNK_SAMPLES));
  }
  return out;
}

/**
 * Feeds the stream to fresh decoders of `set`, one per other Decoder_Offset
 * (256, 512, 768 zero samples prepended). Returns the offsets that decoded.
 */
async function decodedAtOtherOffsets(
  set: readonly ProtocolId[],
  blocks: readonly Float32Array[],
): Promise<number[]> {
  // On offsetModem (its own modules), so these 3 never count against `modem`'s 4.
  const fresh = track(
    await offsetModem.createDecoders(set, OTHER_OFFSETS.length),
  );
  try {
    const hits: number[] = [];
    for (let k = 0; k < OTHER_OFFSETS.length; k++) {
      const offset = OTHER_OFFSETS[k];
      const decoder = fresh[k];
      if (offset === undefined || decoder === undefined) continue;
      if (feedAll(decoder, shiftBlocks(blocks, offset)) !== null) {
        hits.push(offset);
      }
    }
    return hits;
  } finally {
    for (const d of fresh) d.dispose();
  }
}

/**
 * Decoder i probes protocol probes[i]. Returns the probes that were decoded
 * although they are outside the decoder's own set (at any of the four
 * Decoder_Offsets), and the probes inside the set that the decoder did not
 * decode. On a miss, logs whether the other offsets recover it.
 */
async function probeDecoders(
  decoders: readonly ModemDecoder[],
  blocks: ReadonlyMap<ProtocolId, Float32Array[]>,
  lead: number,
  probes: readonly ProtocolId[],
) {
  const leaked: string[] = [];
  const missed: string[] = [];
  for (let i = 0; i < probes.length; i++) {
    const protocol = probes[i];
    const decoder = decoders[i];
    const wave = protocol === undefined ? undefined : blocks.get(protocol);
    if (protocol === undefined || decoder === undefined || wave === undefined) {
      throw new Error(`no decoder or waveform for probe index ${i}`);
    }
    const got = feedAll(decoder, wave);
    const own = decoder.protocols.includes(protocol);
    if (!own) {
      if (got !== null) leaked.push(`${protocol} on decoder ${i}`);
      const hits = await decodedAtOtherOffsets(decoder.protocols, wave);
      for (const offset of hits) {
        leaked.push(`${protocol} on decoder ${i} at offset ${offset}`);
      }
    } else if (got === null) {
      missed.push(`${protocol} on decoder ${i}`);
      const hits = await decodedAtOtherOffsets(decoder.protocols, wave);
      console.log(
        `[toggle-diag] miss: set=[${decoder.protocols.join(",")}], protocol=${protocol}, lead=${lead}, recovered at offsets: [${hits.join(",")}]`,
      );
    }
  }
  return { leaked, missed };
}

function setOf(family: Family): ProtocolId[] {
  return [`${family}_FASTEST`, `${family}_FAST`];
}

function sameSamples(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Starts two setups in the same tick and returns both groups. If one rejects,
 * the decoders of the other are freed before the error is rethrown.
 */
async function createBoth(
  pa: Promise<ModemDecoder[]>,
  pb: Promise<ModemDecoder[]>,
): Promise<[ModemDecoder[], ModemDecoder[]]> {
  const [ra, rb] = await Promise.allSettled([pa, pb]);
  if (ra.status === "fulfilled") track(ra.value);
  if (rb.status === "fulfilled") track(rb.value);
  if (ra.status === "rejected") throw ra.reason;
  if (rb.status === "rejected") throw rb.reason;
  return [ra.value, rb.value];
}

/**
 * Runs `fn` for each pair of probes (3 rounds). Each round creates the two
 * sets in the same tick (2 decoders each, 4 live in total) in the given order,
 * and frees all of them before the next round, so the budget of 4 holds.
 */
async function eachRound(
  setA: readonly ProtocolId[],
  setB: readonly ProtocolId[],
  aFirst: boolean,
  fn: (
    da: ModemDecoder[],
    db: ModemDecoder[],
    probes: readonly ProtocolId[],
  ) => Promise<void>,
): Promise<void> {
  for (let r = 0; r < PROBES.length; r += 2) {
    let pa: Promise<ModemDecoder[]>;
    let pb: Promise<ModemDecoder[]>;
    // Both calls start in the same tick, no await between them.
    if (aFirst) {
      pa = modem.createDecoders(setA, 2);
      pb = modem.createDecoders(setB, 2);
    } else {
      pb = modem.createDecoders(setB, 2);
      pa = modem.createDecoders(setA, 2);
    }
    const [da, db] = await createBoth(pa, pb);
    try {
      await fn(da, db, PROBES.slice(r, r + 2));
    } finally {
      for (const d of [...da, ...db]) d.dispose();
    }
  }
}

beforeAll(async () => {
  gg = await loadGgwave();
  gg.disableLog();
  const shared = await makeInstrumented();
  modem = shared.modem;
  sharedModules = [shared.decode, shared.encode];
  offsetModem = (await makeInstrumented()).modem;
});

afterEach(() => {
  for (const d of trackedDecoders) d.dispose();
  trackedDecoders.clear();
  for (const m of trackedModems) m.dispose();
  trackedModems.clear();
});

afterAll(() => {
  modem.dispose();
  offsetModem.dispose();
});

describe("Property 15: Toggle isolation and serialization (slow)", () => {
  /**
   * Documents what the design depends on: a ggwave decoder keeps the protocol
   * set that was enabled when it was created. Fails loudly if an upgrade changes it.
   *
   * **Validates: Requirements 9.7**
   */
  it(
    "(a) raw ggwave: a decoder created before the AUDIBLE family is toggled off keeps AUDIBLE_FAST, one created after loses it",
    () => {
      // Evidence: with only AUDIBLE_FAST off, AUDIBLE_NORMAL still decodes
      // short AUDIBLE_FAST frames (5 bytes yes, 12 bytes no). So NORMAL is
      // never enabled by the app, and every protocol is toggled explicitly,
      // and this test switches off the whole AUDIBLE family.
      const payload = Uint8Array.of(0x68, 0x65, 0x6c, 0x6c, 0x6f);
      const blocks = padToBlocks(rawModulate(payload, "AUDIBLE_FAST"), 0);
      let d1 = -1;
      let d2 = -1;
      try {
        toggleRaw(() => true);
        d1 = newRawInstance();
        toggleRaw((id) => !id.startsWith("AUDIBLE_"));
        d2 = newRawInstance();
        expect(
          rawDecode(d1, blocks),
          "D1 created before the toggle",
        ).not.toBeNull();
        expect(rawDecode(d2, blocks), "D2 created after the toggle").toBeNull();
      } finally {
        if (d1 >= 0) gg.free(d1);
        if (d2 >= 0) gg.free(d2);
        toggleRaw(() => true);
      }
    },
    SLOW_TIMEOUT,
  );

  /** Logged, non-asserting: AUDIBLE_FAST off but NORMAL on, short and longer payloads. */
  it(
    "(a-probe) logs whether AUDIBLE_NORMAL decodes AUDIBLE_FAST frames",
    () => {
      let rx = -1;
      try {
        toggleRaw((id) => id !== "AUDIBLE_FAST");
        rx = newRawInstance();
        for (const n of [5, 12]) {
          const payload = Uint8Array.from({ length: n }, (_, i) => 0x61 + i);
          const blocks = padToBlocks(rawModulate(payload, "AUDIBLE_FAST"), 0);
          const got = rawDecode(rx, blocks);
          console.log(
            `[toggle-diag] cross-speed: AUDIBLE_FAST off, NORMAL on, ${n}-byte payload decoded=${got !== null}`,
          );
        }
      } finally {
        if (rx >= 0) gg.free(rx);
        toggleRaw(() => true);
      }
    },
    SLOW_TIMEOUT,
  );

  /**
   * **Validates: Requirements 9.7, 9.8, 9.10**
   */
  it(
    "(b) two createDecoders calls in the same tick keep their own sets, in both orders",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .record({
              a: fc.constantFrom(...FAMILIES),
              b: fc.constantFrom(...FAMILIES),
              aFirst: fc.boolean(),
              lead: fc.integer({ min: 0, max: CHUNK_SAMPLES - 1 }),
              payload: fc.uint8Array({ minLength: 1, maxLength: 30 }),
            })
            .filter((r) => r.a !== r.b),
          async ({ a, b, aFirst, lead, payload }) => {
            const setA = setOf(a);
            const setB = setOf(b);
            const blocks = probeBlocks(payload, lead);
            // 3 rounds of 2 + 2 decoders (4 live at most), freed after each round.
            await eachRound(setA, setB, aFirst, async (da, db, probes) => {
              for (const d of da) expect(d.protocols).toEqual(setA);
              for (const d of db) expect(d.protocols).toEqual(setB);
              const ra = await probeDecoders(da, blocks, lead, probes);
              const rb = await probeDecoders(db, blocks, lead, probes);
              // Isolation (strict): nothing outside the set decodes, at any offset.
              expect(ra.leaked, "leaked on decoders of A").toEqual([]);
              expect(rb.leaked, "leaked on decoders of B").toEqual([]);
              expect(ra.missed, "missed on decoders of A").toEqual([]);
              expect(rb.missed, "missed on decoders of B").toEqual([]);
            });
          },
        ),
        PARAMS,
      );
    },
    SLOW_TIMEOUT,
  );

  /**
   * **Validates: Requirements 9.9, 9.10**
   */
  it(
    "(c) reset() on a decoder of A still decodes only A's protocols after B was set up last",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc
            .record({
              a: fc.constantFrom(...FAMILIES),
              b: fc.constantFrom(...FAMILIES),
              payload: fc.uint8Array({ minLength: 1, maxLength: 30 }),
            })
            .filter((r) => r.a !== r.b),
          async ({ a, b, payload }) => {
            const setA = setOf(a);
            const setB = setOf(b);
            const blocks = probeBlocks(payload, 0);
            // A first, then B, in the same tick, so B's setup runs last.
            await eachRound(setA, setB, true, async (da, _db, probes) => {
              // B's setup ran last, so the global toggle state is B's.
              for (const d of da) d.reset();
              const ra = await probeDecoders(da, blocks, 0, probes);
              expect(ra.leaked, "leaked after reset").toEqual([]);
              expect(ra.missed, "missed after reset").toEqual([]);
            });
          },
        ),
        PARAMS,
      );
    },
    SLOW_TIMEOUT,
  );

  /**
   * **Validates: Requirements 9.8, 9.11**
   */
  it(
    "(d) the toggle and create call log is a concatenation of whole setups",
    async () => {
      type Entry = { op: "toggle"; id: string; on: boolean } | { op: "init" };
      await fc.assert(
        fc.asyncProperty(
          fc
            .array(
              fc.record({
                protocols: fc.subarray([...PROBES], { minLength: 1 }),
                count: fc.integer({ min: 1, max: 3 }),
              }),
              { minLength: 1, maxLength: 4 },
            )
            // All setups are live together on one module: at most 4 decoders.
            .filter((setups) => setups.reduce((n, s) => n + s.count, 0) <= 4),
          async (setups) => {
            const log: Entry[] = [];
            const idOfValue = new Map<number, string>();
            for (const id of ALL_IDS) idOfValue.set(protocolOf(id).value, id);
            const wrapped: GgwaveFactoryResult = {
              getDefaultParameters: () => gg.getDefaultParameters(),
              init: (parameters) => {
                log.push({ op: "init" });
                return gg.init(parameters);
              },
              free: (instance) => gg.free(instance),
              encode: (instance, payload, protocol, volume) =>
                gg.encode(instance, payload, protocol, volume),
              decode: (instance, samples) => gg.decode(instance, samples),
              rxToggleProtocol: (protocol, enabled) => {
                log.push({
                  op: "toggle",
                  id: idOfValue.get(protocol.value) ?? "?",
                  on: enabled !== 0,
                });
                gg.rxToggleProtocol(protocol, enabled);
              },
              disableLog: () => gg.disableLog(),
              ProtocolId: gg.ProtocolId,
            };
            const wrappedModem = await createGgwaveModem(async () => wrapped, {
              txSampleRate: SAMPLE_RATE,
            });
            try {
              // All setups start in the same tick.
              await Promise.all(
                setups.map((s) =>
                  wrappedModem.createDecoders(s.protocols, s.count),
                ),
              );
              let pos = 0;
              for (const setup of setups) {
                const seen = new Map<string, boolean>();
                for (let i = 0; i < ALL_IDS.length; i++) {
                  const e = log[pos++];
                  if (e === undefined || e.op !== "toggle") {
                    throw new Error(
                      `expected a toggle at log position ${pos - 1}`,
                    );
                  }
                  seen.set(e.id, e.on);
                }
                expect(seen.size).toBe(ALL_IDS.length);
                for (const id of ALL_IDS) {
                  expect(seen.get(id), id).toBe(
                    setup.protocols.includes(id as ProtocolId),
                  );
                }
                for (let i = 0; i < setup.count; i++) {
                  expect(log[pos++]?.op, "creation").toBe("init");
                }
              }
              expect(pos, "no stray calls").toBe(log.length);
            } finally {
              // Frees every decoder this modem made, so `gg` is empty again.
              wrappedModem.dispose();
            }
          },
        ),
        PARAMS,
      );
    },
    SLOW_TIMEOUT,
  );

  /**
   * **Validates: Requirements 9.6, 9.7**
   */
  it(
    "(e) modulate output of every protocol is unchanged by any toggle state",
    () => {
      const payload = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);
      // Toggle the modem's own modules, because that is what its modulate uses.
      const mods = sharedModules.map((m) => m.mod);
      toggleRaw(() => true, mods);
      const baseline = new Map<ProtocolId, Float32Array>();
      for (const protocol of PROBES) {
        baseline.set(protocol, modem.modulate(payload, protocol, VOLUME));
      }
      try {
        fc.assert(
          fc.property(
            fc.array(fc.boolean(), {
              minLength: ALL_IDS.length,
              maxLength: ALL_IDS.length,
            }),
            (states) => {
              toggleRaw(
                (id) => states[ALL_IDS.indexOf(id as never)] === true,
                mods,
              );
              for (const protocol of PROBES) {
                const base = baseline.get(protocol);
                if (base === undefined) throw new Error("missing baseline");
                const now = modem.modulate(payload, protocol, VOLUME);
                expect(sameSamples(base, now), protocol).toBe(true);
              }
            },
          ),
          PARAMS,
        );
      } finally {
        toggleRaw(() => true, mods);
      }
    },
    SLOW_TIMEOUT,
  );

  /**
   * (f1) The budget of 4 live decoders per module.
   *
   * **Validates: Requirements 9.12**
   */
  it(
    "(f1) a 5th live decoder on one modem rejects with NO_INSTANCE",
    async () => {
      const { modem: m } = await freshModem();
      const four = track(await m.createDecoders(["DT_FAST"], 4));
      expect(four).toHaveLength(4);
      await expect(m.createDecoders(["DT_FAST"], 1)).rejects.toMatchObject({
        code: "NO_INSTANCE",
      });
      // Freeing one makes room again.
      const first = four[0];
      if (first === undefined) throw new Error("no decoder");
      first.dispose();
      track(await m.createDecoders(["DT_FAST"], 1));
    },
    SLOW_TIMEOUT,
  );

  /**
   * (f2) No negative id is freed, and a failed setup frees what it made.
   *
   * **Validates: Requirements 9.12**
   */
  it(
    "(f2) a forced init failure inside a setup throws NO_INSTANCE and frees exactly the instances that setup created",
    async () => {
      const { modem: m, decode, encode } = await freshModem();
      const keep = track(await m.createDecoders(["DT_FAST"], 1));
      const initsBefore = decode.inits.length;
      const freesBefore = decode.frees.length;
      // The setup asks for 3: the first init succeeds, the second returns -1.
      decode.initsLeft = 1;
      await expect(m.createDecoders(["DT_FAST"], 3)).rejects.toMatchObject({
        code: "NO_INSTANCE",
      });
      decode.initsLeft = Number.POSITIVE_INFINITY;
      const made = decode.inits.slice(initsBefore);
      expect(made).toHaveLength(2);
      const [created, failed] = made;
      expect(created, "id of the instance the setup created").toBeGreaterThan(
        -1,
      );
      expect(failed, "the forced init").toBe(-1);
      expect(
        decode.frees.slice(freesBefore),
        "frees of the failed setup",
      ).toEqual([created]);
      // The failed setup gave its slot back: 1 kept + 3 new = 4 live.
      const again = track(await m.createDecoders(["DT_FAST"], 3));
      expect(again).toHaveLength(3);
      for (const d of [...keep, ...again]) d.dispose();
      // A modulate frees its own encode instance.
      m.modulate(Uint8Array.of(1, 2, 3), "DT_FAST", VOLUME);
      const allFrees = [...decode.frees, ...encode.frees];
      expect(allFrees.length).toBeGreaterThan(0);
      expect(
        allFrees.filter((id) => id < 0),
        "negative ids passed to free",
      ).toEqual([]);
    },
    SLOW_TIMEOUT,
  );

  /**
   * (f3) Sending while listening: modulate works with 4 live decoders, and
   * each of them still decodes the frame, at its own lead.
   *
   * **Validates: Requirements 9.12, 9.13**
   */
  it(
    "(f3) with 4 live decoders, modulate succeeds and each decoder decodes the frame",
    async () => {
      const { modem: m } = await freshModem();
      const set: ProtocolId[] = ["DT_FASTEST", "DT_FAST"];
      const decoders = track(await m.createDecoders(set, 4));
      expect(decoders).toHaveLength(4);
      const payload = Uint8Array.from(
        [..."dial tone test"].map((c) => c.charCodeAt(0)),
      );
      const wave = m.modulate(payload, "DT_FAST", VOLUME);
      expect(wave.length).toBeGreaterThan(0);
      for (const [k, decoder] of decoders.entries()) {
        const lead = k * OFFSET_STEP;
        const got = feedAll(decoder, padToBlocks(wave, lead));
        expect(got, `decoder ${k} at lead ${lead}`).not.toBeNull();
        expect(Array.from(got ?? []), `payload on decoder ${k}`).toEqual(
          Array.from(payload),
        );
      }
    },
    SLOW_TIMEOUT,
  );

  /**
   * (f4) The decode and encode modules have separate heaps. Sizes are logged,
   * not asserted (Node baseline: 88.3 MB decode, 31.1 MB encode).
   *
   * **Validates: Requirements 9.13**
   */
  it(
    "(f4) the two modules have different HEAP8 buffers",
    async () => {
      const { modem: m, decode, encode } = await freshModem();
      track(await m.createDecoders(["DT_FAST"], 1));
      m.modulate(Uint8Array.of(1, 2, 3), "DT_FAST", VOLUME);
      const heapOf = (i: Instrumented): ArrayBuffer => {
        const heap = (i.raw as unknown as { HEAP8?: Int8Array }).HEAP8;
        if (heap === undefined) throw new Error("module has no HEAP8");
        return heap.buffer as ArrayBuffer;
      };
      const decodeHeap = heapOf(decode);
      const encodeHeap = heapOf(encode);
      const mb = (b: ArrayBuffer) => (b.byteLength / 1048576).toFixed(1);
      console.log(
        `[ggwave-budget] heap decode=${mb(decodeHeap)} MB encode=${mb(encodeHeap)} MB`,
      );
      expect(decodeHeap).not.toBe(encodeHeap);
    },
    SLOW_TIMEOUT,
  );
});
