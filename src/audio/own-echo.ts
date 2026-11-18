export const OWN_ECHO_RING = 8; // design parameter
export const OWN_ECHO_WINDOW_MS = 30_000; // design parameter

export interface OwnEcho {
  note(wire: Uint8Array, atFrame: number): void;
  /** True when payload equals one of the last OWN_ECHO_RING sent wires and atFrame is within the window. */
  isEcho(payload: Uint8Array, atFrame: number): boolean;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Remembers our own sent wires (copies). Comparison is byte equality only, so
 * the check does not depend on family or speed.
 */
export function createOwnEcho(sampleRate: number): OwnEcho {
  const windowFrames = Math.round((OWN_ECHO_WINDOW_MS / 1000) * sampleRate);
  const ring: { wire: Uint8Array; atFrame: number }[] = [];

  return {
    note(wire, atFrame) {
      ring.push({ wire: wire.slice(), atFrame });
      while (ring.length > OWN_ECHO_RING) ring.shift();
    },
    isEcho(payload, atFrame) {
      for (const entry of ring) {
        const delta = atFrame - entry.atFrame;
        if (delta < 0 || delta > windowFrames) continue;
        if (bytesEqual(entry.wire, payload)) return true;
      }
      return false;
    },
  };
}
