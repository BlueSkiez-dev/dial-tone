import { describe, expect, it } from "vitest";
import { CHUNK_SAMPLES, RX_SAMPLE_RATE } from "../constants";
import type { ModemDecoder } from "../modem";
import { createFakeModem } from "./fake-modem";

const SAMPLE_RATE = 48000;
const PAYLOAD = Uint8Array.from([1, 2, 3, 250, 0, 77]);

/** Zeros of length `lead`, then the waveform, padded with zeros to whole blocks. */
function toBlocks(wave: Float32Array, lead = 0): Float32Array[] {
  const blocks = Math.ceil((lead + wave.length) / CHUNK_SAMPLES);
  const stream = new Float32Array(blocks * CHUNK_SAMPLES);
  stream.set(wave, lead);
  const out: Float32Array[] = [];
  for (let i = 0; i < blocks; i++) {
    out.push(stream.slice(i * CHUNK_SAMPLES, (i + 1) * CHUNK_SAMPLES));
  }
  return out;
}

function feedAll(decoder: ModemDecoder, blocks: Float32Array[]) {
  const results: Uint8Array[] = [];
  for (const block of blocks) {
    const r = decoder.feed(block);
    if (r !== null) results.push(r);
  }
  return results;
}

describe("fake modem", () => {
  it("round trips a payload with no options", async () => {
    const modem = createFakeModem({ txSampleRate: SAMPLE_RATE });
    const [decoder] = await modem.createDecoders(["DT_FASTEST"], 1);
    const wave = modem.modulate(PAYLOAD, "DT_FASTEST", 25);
    const results = feedAll(decoder as ModemDecoder, toBlocks(wave));
    expect(results).toHaveLength(1);
    expect(Array.from(results[0] as Uint8Array)).toEqual(Array.from(PAYLOAD));
    expect(modem.txSampleRate).toBe(SAMPLE_RATE);
    expect(modem.rxSampleRate).toBe(RX_SAMPLE_RATE);
  });

  it("misses a packet that starts at a blocked phase", async () => {
    const modem = createFakeModem({
      txSampleRate: SAMPLE_RATE,
      blockedPhases: (phase) => phase === 256,
    });
    const [decoder] = await modem.createDecoders(["DT_FASTEST"], 1);
    const wave = modem.modulate(PAYLOAD, "DT_FASTEST", 25);
    expect(feedAll(decoder as ModemDecoder, toBlocks(wave, 256))).toEqual([]);
    const [other] = await modem.createDecoders(["DT_FASTEST"], 1);
    const ok = feedAll(other as ModemDecoder, toBlocks(wave, 512));
    expect(ok).toHaveLength(1);
  });

  it("changes the decoded output when corrupt is set", async () => {
    const modem = createFakeModem({
      txSampleRate: SAMPLE_RATE,
      corrupt: (payload) => payload.map((b) => b ^ 0xff),
    });
    const [decoder] = await modem.createDecoders(["DT_FASTEST"], 1);
    const wave = modem.modulate(PAYLOAD, "DT_FASTEST", 25);
    const results = feedAll(decoder as ModemDecoder, toBlocks(wave));
    expect(results).toHaveLength(1);
    expect(Array.from(results[0] as Uint8Array)).not.toEqual(
      Array.from(PAYLOAD),
    );
  });

  it("reset drops a half-fed packet and keeps the protocol set", async () => {
    const modem = createFakeModem({ txSampleRate: SAMPLE_RATE });
    const [decoder] = await modem.createDecoders(["DT_FASTEST"], 1);
    const d = decoder as ModemDecoder;
    const wave = modem.modulate(PAYLOAD, "DT_FASTEST", 25);
    const half = Math.floor(wave.length / 2);
    expect(d.feed(wave.slice(0, half))).toBeNull();
    d.reset();
    expect(d.feed(wave.slice(half))).toBeNull();
    expect(d.protocols).toEqual(["DT_FASTEST"]);
    // A whole packet after the reset still decodes.
    const results = feedAll(d, toBlocks(wave));
    expect(results).toHaveLength(1);
    expect(Array.from(results[0] as Uint8Array)).toEqual(Array.from(PAYLOAD));
  });

  it("counts modulate, feed and reset calls through onCall", async () => {
    const calls: string[] = [];
    const modem = createFakeModem({
      txSampleRate: SAMPLE_RATE,
      onCall: (name) => calls.push(name),
    });
    const [decoder] = await modem.createDecoders(["DT_FASTEST"], 1);
    const d = decoder as ModemDecoder;
    modem.modulate(PAYLOAD, "DT_FASTEST", 25);
    d.feed(new Float32Array(CHUNK_SAMPLES));
    d.feed(new Float32Array(CHUNK_SAMPLES));
    d.reset();
    expect(calls).toEqual(["modulate", "feed", "feed", "reset"]);
  });

  it("does not decode a DT packet in a decoder made for AUDIBLE only", async () => {
    const modem = createFakeModem({ txSampleRate: SAMPLE_RATE });
    const [audible] = await modem.createDecoders(["AUDIBLE_FASTEST"], 1);
    const [dt] = await modem.createDecoders(["DT_FASTEST"], 1);
    const wave = modem.modulate(PAYLOAD, "DT_FASTEST", 25);
    expect(feedAll(audible as ModemDecoder, toBlocks(wave))).toEqual([]);
    expect(feedAll(dt as ModemDecoder, toBlocks(wave))).toHaveLength(1);
  });

  it("rejects a 5th decoder with NO_INSTANCE and creates nothing", async () => {
    const modem = createFakeModem({ txSampleRate: SAMPLE_RATE });
    const live = await modem.createDecoders(["DT_FASTEST"], 3);
    // 3 live + 2 > 4: rejected as a whole, so the 4th slot is still free.
    await expect(modem.createDecoders(["DT_FASTEST"], 2)).rejects.toMatchObject(
      { code: "NO_INSTANCE" },
    );
    const [fourth] = await modem.createDecoders(["DT_FASTEST"], 1);
    expect(fourth).toBeDefined();
    await expect(modem.createDecoders(["DT_FASTEST"], 1)).rejects.toMatchObject(
      { code: "NO_INSTANCE" },
    );
    expect(live).toHaveLength(3);
  });

  it("frees a slot when a decoder is disposed", async () => {
    const modem = createFakeModem({ txSampleRate: SAMPLE_RATE });
    const live = await modem.createDecoders(["DT_FASTEST"], 4);
    (live[0] as ModemDecoder).dispose();
    const again = await modem.createDecoders(["DT_FASTEST"], 1);
    expect(again).toHaveLength(1);
  });

  it("does not free two slots on a double dispose", async () => {
    const modem = createFakeModem({ txSampleRate: SAMPLE_RATE });
    const live = await modem.createDecoders(["DT_FASTEST"], 4);
    const first = live[0] as ModemDecoder;
    first.dispose();
    first.dispose();
    await modem.createDecoders(["DT_FASTEST"], 1);
    await expect(modem.createDecoders(["DT_FASTEST"], 1)).rejects.toMatchObject(
      { code: "NO_INSTANCE" },
    );
  });

  it("modulates while 4 decoders are live", async () => {
    const modem = createFakeModem({ txSampleRate: SAMPLE_RATE });
    await modem.createDecoders(["DT_FASTEST"], 4);
    expect(() => modem.modulate(PAYLOAD, "DT_FASTEST", 25)).not.toThrow();
  });

  it("keeps two decoder sets from the same modem independent", async () => {
    const modem = createFakeModem({ txSampleRate: SAMPLE_RATE });
    const [a] = await modem.createDecoders(["DT_FASTEST"], 1);
    const [b] = await modem.createDecoders(["DT_FASTEST"], 1);
    const da = a as ModemDecoder;
    const db = b as ModemDecoder;
    const wave = modem.modulate(PAYLOAD, "DT_FASTEST", 25);
    const half = Math.floor(wave.length / 2);
    expect(da.feed(wave.slice(0, half))).toBeNull();
    // b never saw the first half, so the second half alone gives nothing.
    expect(db.feed(wave.slice(half))).toBeNull();
    // Resetting b does not disturb a's partial packet.
    db.reset();
    const result = da.feed(wave.slice(half));
    expect(result).not.toBeNull();
    expect(Array.from(result as Uint8Array)).toEqual(Array.from(PAYLOAD));
  });
});
