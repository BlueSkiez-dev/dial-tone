/**
 * Bounded FIFO for capture chunks waiting for the decoders (backpressure rule).
 * When it is full the oldest items are dropped and counted.
 */

export interface ChunkQueue<T> {
  /** Returns how many old items were dropped to make room. */
  push(item: T): number;
  shift(): T | undefined;
  clear(): void;
  readonly length: number;
}

export function createChunkQueue<T>(max: number): ChunkQueue<T> {
  const items: T[] = [];
  return {
    push(item) {
      items.push(item);
      const excess = Math.max(0, items.length - max);
      if (excess > 0) items.splice(0, excess);
      return excess;
    },
    shift: () => items.shift(),
    clear() {
      items.length = 0;
    },
    get length() {
      return items.length;
    },
  };
}
