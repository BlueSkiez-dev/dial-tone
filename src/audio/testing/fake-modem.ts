/**
 * Deterministic Modem for Node tests. No WASM.
 *
 * Models three things only: dependence on alignment (a packet whose start phase against the
 * decoder's block grid is blocked is missed), per-decoder protocol sets (a decoder decodes a
 * packet only when the packet's protocol is in the set it was created with), and silent
 * corruption (`corrupt`). It is not a model of ggwave. Real behaviour is checked by slow tests.
 *
 * Packet layout, in samples (all values are exact integers in a Float32):
 *   MARKER (4 samples), protocol code, payload length, payload bytes, END (2 samples)
 * Markers are >= 1000 and payload bytes are 0..255, so a payload never looks like a marker.
 * No length limit is applied: the length guard belongs to callers and to the real modem.
 */

import { CHUNK_SAMPLES, RX_SAMPLE_RATE } from "../constants";
import { type Modem, type ModemDecoder, ModemError } from "../modem";
import type { ProtocolId } from "../profiles";

/** Matches MAX_INSTANCES_PER_MODULE of the real decode module. */
const DEFAULT_MAX_DECODERS = 4;

export interface FakeModemOptions {
  /** Most live decoders at once (default 4). `createDecoders` rejects with NO_INSTANCE past it. `modulate` is not limited. */
  maxDecoders?: number;
  txSampleRate: number;
  /** Defaults to RX_SAMPLE_RATE (48,000). */
  rxSampleRate?: number;
  /** Start phases (sample index mod CHUNK_SAMPLES of the packet start, relative to the decoder's block grid) at which decoding fails. */
  blockedPhases?: (phase: number) => boolean;
  /** Called on every modulate, feed and reset, so tests can count ggwave calls. */
  onCall?: (name: "modulate" | "feed" | "reset") => void;
  /** Applied to a copy of the decoded payload, to model silent ggwave corruption. */
  corrupt?: (payload: Uint8Array) => Uint8Array;
}

const MARKER = [1000, 2000, 3000, 4000] as const;
const END = [5000, 6000] as const;
const HEADER = MARKER.length + 2;
const MAX_LENGTH = 1 << 20;

/** Protocol strings get small integer codes so they fit in a sample. Shared, so any fake modem reads any packet. */
const codeByProtocol = new Map<string, number>();
const protocolByCode = new Map<number, string>();

function codeOf(protocol: string): number {
  let code = codeByProtocol.get(protocol);
  if (code === undefined) {
    code = codeByProtocol.size + 1;
    codeByProtocol.set(protocol, code);
    protocolByCode.set(code, protocol);
  }
  return code;
}

function matchesAt(buf: Float32Array, i: number, pattern: readonly number[]) {
  for (let k = 0; k < pattern.length; k++) {
    if (buf[i + k] !== pattern[k]) return false;
  }
  return true;
}

function createFakeDecoder(
  protocols: readonly ProtocolId[],
  opts: FakeModemOptions,
  onDispose: () => void,
): ModemDecoder {
  const enabled = new Set<string>(protocols);
  const fixed: readonly ProtocolId[] = Object.freeze([...protocols]);
  let buf = new Float32Array(0);
  /** Absolute index (samples fed since creation) of buf[0]. */
  let base = 0;
  let fed = 0;
  let disposed = false;
  let pending: Uint8Array[] = [];

  function scan(): void {
    let i = 0;
    while (i + MARKER.length <= buf.length) {
      if (!matchesAt(buf, i, MARKER)) {
        i++;
        continue;
      }
      if (i + HEADER > buf.length) break;
      const length = buf[i + MARKER.length + 1] as number;
      if (!Number.isInteger(length) || length < 0 || length > MAX_LENGTH) {
        i++;
        continue;
      }
      const total = HEADER + length + END.length;
      if (i + total > buf.length) break;
      if (!matchesAt(buf, i + HEADER + length, END)) {
        i++;
        continue;
      }
      const protocol = protocolByCode.get(buf[i + MARKER.length] as number);
      const phase = (base + i) % CHUNK_SAMPLES;
      const blocked = opts.blockedPhases?.(phase) === true;
      if (protocol !== undefined && enabled.has(protocol) && !blocked) {
        const payload = new Uint8Array(length);
        for (let k = 0; k < length; k++) {
          payload[k] = buf[i + HEADER + k] as number;
        }
        pending.push(opts.corrupt ? opts.corrupt(payload) : payload);
      }
      i += total;
    }
    base += i;
    buf = buf.slice(i);
  }

  return {
    protocols: fixed,
    feed(block) {
      opts.onCall?.("feed");
      if (disposed) return null;
      const next = new Float32Array(buf.length + block.length);
      next.set(buf, 0);
      next.set(block, buf.length);
      buf = next;
      fed += block.length;
      scan();
      return pending.shift() ?? null;
    },
    reset() {
      opts.onCall?.("reset");
      buf = new Float32Array(0);
      pending = [];
      base = fed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      buf = new Float32Array(0);
      pending = [];
      onDispose();
    },
  };
}

export function createFakeModem(opts: FakeModemOptions): Modem {
  const maxDecoders = opts.maxDecoders ?? DEFAULT_MAX_DECODERS;
  /** Live decoders only: a disposed decoder removes itself. */
  const decoders = new Set<ModemDecoder>();
  return {
    txSampleRate: opts.txSampleRate,
    rxSampleRate: opts.rxSampleRate ?? RX_SAMPLE_RATE,
    modulate(payload, protocol, _volume) {
      opts.onCall?.("modulate");
      const out = new Float32Array(HEADER + payload.length + END.length);
      out.set(MARKER, 0);
      out[MARKER.length] = codeOf(protocol);
      out[MARKER.length + 1] = payload.length;
      for (let k = 0; k < payload.length; k++) {
        out[HEADER + k] = payload[k] as number;
      }
      out.set(END, HEADER + payload.length);
      return out;
    },
    async createDecoders(protocols, count) {
      if (decoders.size + count > maxDecoders) {
        throw new ModemError("NO_INSTANCE");
      }
      const made: ModemDecoder[] = [];
      for (let n = 0; n < count; n++) {
        const decoder: ModemDecoder = createFakeDecoder(protocols, opts, () => {
          decoders.delete(decoder);
        });
        made.push(decoder);
        decoders.add(decoder);
      }
      return made;
    },
    dispose() {
      for (const d of [...decoders]) d.dispose();
      decoders.clear();
    },
  };
}
