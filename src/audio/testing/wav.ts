/**
 * Minimal WAV helpers for tests and the fixture builder. Pure, no browser global.
 * Reads 16-bit PCM and 32-bit float, mono. Writes 32-bit float (exact) or 16-bit PCM.
 */

import { CHUNK_SAMPLES } from "../constants";
import { err, ok, type Result } from "../result";

export type WavErrorCode =
  | "NOT_WAV"
  | "TRUNCATED"
  | "UNSUPPORTED_FORMAT"
  | "NOT_MONO"
  | "NO_DATA";

export interface WavChunk {
  startFrame: number;
  samples: Float32Array;
}

export interface WavChunks {
  sampleRate: number;
  chunks: WavChunk[];
}

export interface WavAudio {
  sampleRate: number;
  samples: Float32Array;
}

const FORMAT_PCM = 1;
const FORMAT_FLOAT = 3;

function tag(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/** Parse a mono 16-bit PCM or 32-bit float WAV into samples. Never throws on data. */
export function decodeWav(
  wav: Uint8Array,
): Result<WavAudio, { code: WavErrorCode }> {
  if (wav.length < 12) return err("NOT_WAV");
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  if (tag(view, 0) !== "RIFF" || tag(view, 8) !== "WAVE") return err("NOT_WAV");

  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let haveFmt = false;
  let dataStart = -1;
  let dataLength = 0;

  let pos = 12;
  while (pos + 8 <= wav.length) {
    const id = tag(view, pos);
    const size = view.getUint32(pos + 4, true);
    const body = pos + 8;
    if (id === "fmt ") {
      if (size < 16 || body + 16 > wav.length) return err("TRUNCATED");
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
      haveFmt = true;
    } else if (id === "data") {
      dataStart = body;
      dataLength = Math.min(size, wav.length - body);
      break;
    }
    pos = body + size + (size % 2);
  }

  if (!haveFmt) return err("NOT_WAV");
  if (dataStart < 0) return err("NO_DATA");
  const isPcm16 = format === FORMAT_PCM && bits === 16;
  const isFloat32 = format === FORMAT_FLOAT && bits === 32;
  if (!isPcm16 && !isFloat32) return err("UNSUPPORTED_FORMAT");
  if (channels !== 1) return err("NOT_MONO");
  if (sampleRate <= 0) return err("NOT_WAV");

  const bytesPer = bits / 8;
  const count = Math.floor(dataLength / bytesPer);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const at = dataStart + i * bytesPer;
    samples[i] = isFloat32
      ? view.getFloat32(at, true)
      : view.getInt16(at, true) / 32768;
  }
  return ok({ sampleRate, samples });
}

/**
 * Parse a WAV and cut it into CHUNK_SAMPLES chunks with absolute start frames, as the capture
 * worklet would deliver them. A final partial chunk is dropped, so every chunk has full length.
 */
export function wavToChunks(
  wav: Uint8Array,
): Result<WavChunks, { code: WavErrorCode }> {
  const decoded = decodeWav(wav);
  if (!decoded.ok) return decoded;
  const { sampleRate, samples } = decoded.value;
  const chunks: WavChunk[] = [];
  for (let at = 0; at + CHUNK_SAMPLES <= samples.length; at += CHUNK_SAMPLES) {
    chunks.push({
      startFrame: at,
      samples: samples.slice(at, at + CHUNK_SAMPLES),
    });
  }
  return ok({ sampleRate, chunks });
}

/** Write a mono WAV. Default is 32-bit float, which round-trips exactly. */
export function encodeWav(
  samples: Float32Array,
  sampleRate: number,
  format: "float32" | "pcm16" = "float32",
): Uint8Array {
  const float = format === "float32";
  const bytesPer = float ? 4 : 2;
  const dataLength = samples.length * bytesPer;
  const out = new Uint8Array(44 + dataLength);
  const view = new DataView(out.buffer);
  const put = (offset: number, text: string): void => {
    for (let i = 0; i < 4; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  put(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  put(8, "WAVE");
  put(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, float ? FORMAT_FLOAT : FORMAT_PCM, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPer, true);
  view.setUint16(32, bytesPer, true);
  view.setUint16(34, bytesPer * 8, true);
  put(36, "data");
  view.setUint32(40, dataLength, true);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] ?? 0;
    if (float) {
      view.setFloat32(44 + i * 4, s, true);
    } else {
      const clamped = Math.max(-1, Math.min(1, s));
      view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
    }
  }
  return out;
}
