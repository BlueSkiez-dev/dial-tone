/** Small pure helpers for the transport: scheduling arithmetic, attempt rule, event bus. */

import { GGWAVE_MAX_PAYLOAD } from "../protocol";
import { TX_TAIL_GUARD_MS } from "./rx-pipeline";

/** Design parameter. The gate message must reach the worker before the first affected chunk. */
export const TX_SCHEDULE_LEAD_MS = 100;

/** Design parameter. The silence padding of the recorded evidence. */
export const INTER_FRAME_GAP_MS = 600;

/** A negative or non-integer attempt counts as 0. */
export function sanitizeAttempt(attempt: unknown): number {
  return typeof attempt === "number" && Number.isInteger(attempt) && attempt > 0
    ? attempt
    : 0;
}

/** A byte length ggwave can carry in one frame: an integer from 1 to 140. */
export function isPayloadLength(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= GGWAVE_MAX_PAYLOAD;
}

export interface SendSchedule {
  /** Context time at which playback starts. */
  when: number;
  startFrame: number;
  endFrame: number;
  tailFrames: number;
}

export function sendSchedule(
  currentTime: number,
  sampleRate: number,
  sampleCount: number,
): SendSchedule {
  const when = currentTime + TX_SCHEDULE_LEAD_MS / 1000;
  const startFrame = Math.round(when * sampleRate);
  return {
    when,
    startFrame,
    endFrame: startFrame + sampleCount,
    tailFrames: Math.round((TX_TAIL_GUARD_MS / 1000) * sampleRate),
  };
}

/** Airtime depends on the speed (first or retry), not on the attempt number itself. */
export function airtimeKey(
  profile: string,
  attempt: number,
  byteLength: number,
): string {
  return `${profile}:${sanitizeAttempt(attempt) > 0 ? 1 : 0}:${byteLength}`;
}

export interface Emitter<E> {
  emit(event: E): void;
  subscribe(listener: (event: E) => void): () => void;
}

/** A listener that throws does not stop the others. */
export function createEmitter<E>(): Emitter<E> {
  const listeners = new Set<(event: E) => void>();
  return {
    emit(event) {
      for (const l of [...listeners]) {
        try {
          l(event);
        } catch {
          // A faulty listener must not break delivery to the rest.
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** While not listening, receive events are dropped. Everything else is still forwarded. */
export function dropWhileDeaf(kind: string, listening: boolean): boolean {
  return (
    !listening &&
    (kind === "frame" || kind === "rejected" || kind === "carrier")
  );
}
