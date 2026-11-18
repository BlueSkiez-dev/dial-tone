/**
 * Airtime of a payload, derived from the real encoder's output length (not a per-byte constant).
 * The waveform length depends only on protocol and payload length, so the result is cached
 * per modem instance by (protocol, byteLength).
 */

import type { Modem } from "./modem";
import { type ChannelProfile, protocolFor } from "./profiles";

const cache = new WeakMap<Modem, Map<string, number>>();

export function airtimeMs(
  modem: Modem,
  profile: ChannelProfile,
  attempt: number,
  byteLength: number,
): number {
  const protocol = protocolFor(profile, attempt);
  let perModem = cache.get(modem);
  if (!perModem) {
    perModem = new Map();
    cache.set(modem, perModem);
  }
  const key = `${protocol}:${byteLength}`;
  const hit = perModem.get(key);
  if (hit !== undefined) return hit;
  const samples = modem.modulate(
    new Uint8Array(byteLength),
    protocol,
    profile.volume,
  );
  const ms = (samples.length / modem.txSampleRate) * 1000;
  perModem.set(key, ms);
  return ms;
}
