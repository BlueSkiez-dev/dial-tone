import { CHUNK_SAMPLES } from "./constants";

/** Design parameter: sibling decoders see the same packet within about one block, plus processing delay. */
export const SIBLING_MERGE_FRAMES = 2 * CHUNK_SAMPLES;

export interface SiblingMerge {
  /** Returns true when this payload is new and must be emitted. */
  offer(decoder: number, payload: Uint8Array, atFrame: number): boolean;
}

interface Entry {
  readonly payload: Uint8Array;
  readonly firstFrame: number;
  readonly decoders: Set<number>;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function createSiblingMerge(windowFrames: number): SiblingMerge {
  let entries: Entry[] = [];
  return {
    offer(decoder, payload, atFrame) {
      entries = entries.filter((e) => atFrame - e.firstFrame <= windowFrames);
      for (const entry of entries) {
        if (
          bytesEqual(entry.payload, payload) &&
          !entry.decoders.has(decoder)
        ) {
          entry.decoders.add(decoder);
          return false;
        }
      }
      entries.push({
        payload: payload.slice(),
        firstFrame: atFrame,
        decoders: new Set([decoder]),
      });
      return true;
    },
  };
}
