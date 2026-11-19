/** Main-thread cache of worker-computed airtimes, keyed by profile, speed class and byte length. */

import { airtimeKey } from "./transport-math";

export interface AirtimeCache {
  get(profile: string, attempt: number, byteLength: number): number | undefined;
  /** True the first time a key is asked for, so one request goes out per miss. */
  firstAsk(profile: string, attempt: number, byteLength: number): boolean;
  store(profile: string, attempt: number, byteLength: number, ms: number): void;
  clear(): void;
}

export function createAirtimeCache(): AirtimeCache {
  const values = new Map<string, number>();
  const asked = new Set<string>();
  return {
    get: (p, a, n) => values.get(airtimeKey(p, a, n)),
    firstAsk(p, a, n) {
      const key = airtimeKey(p, a, n);
      if (asked.has(key)) return false;
      asked.add(key);
      return true;
    },
    store(p, a, n, ms) {
      const key = airtimeKey(p, a, n);
      values.set(key, ms);
      asked.delete(key);
    },
    clear() {
      values.clear();
      asked.clear();
    },
  };
}
