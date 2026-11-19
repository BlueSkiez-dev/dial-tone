import { describe, expect, it } from "vitest";
import {
  createStore,
  parseSaved,
  type SavedState,
  type StorageLike,
  serialize,
  type Timer,
} from "./persist";
import { TAPE_MAX } from "./tape";

const flags = { onboarded: true, micWasGranted: false, firstPowerShown: true };

function fakeTimer(): Timer & { fire(): void; pending: number } {
  let fn: (() => void) | null = null;
  return {
    set(f) {
      fn = f;
      return 1;
    },
    clear() {
      fn = null;
    },
    fire() {
      const f = fn;
      fn = null;
      f?.();
    },
    get pending() {
      return fn ? 1 : 0;
    },
  };
}

function memStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

describe("parseSaved", () => {
  it("drops a bad slip and keeps the others", () => {
    const raw = JSON.stringify({
      v: 1,
      tape: [
        { kind: "heard", id: "a", at: 1, text: "hi", hop: 1 },
        { kind: "bogus", id: "b", at: 2 },
        { kind: "heard", id: "c", at: 3, text: "x", hop: 99 },
        { kind: "update-ready", id: "d", at: 4 },
      ],
      draft: "d",
      channel: "call",
      flags,
    });
    const s = parseSaved(raw);
    expect(s?.tape.map((t) => t.id)).toEqual(["a", "d"]);
    expect(s?.channel).toBe("call");
  });

  it("recomputes bytes and returns null for junk", () => {
    const raw = JSON.stringify({
      v: 1,
      tape: [{ kind: "heard", id: "a", at: 1, text: "é", hop: 0, bytes: 99 }],
    });
    const s = parseSaved(raw);
    expect(s?.tape[0]).toMatchObject({ bytes: 2 });
    expect(s?.channel).toBe("room");
    expect(parseSaved("not json")).toBeNull();
    expect(parseSaved(null)).toBeNull();
    expect(parseSaved('{"v":2}')).toBeNull();
  });

  it("cuts the tape to TAPE_MAX keeping the newest", () => {
    const tape = Array.from({ length: TAPE_MAX + 5 }, (_, i) => ({
      kind: "update-ready",
      id: `s${i}`,
      at: i,
    }));
    const s = parseSaved(JSON.stringify({ v: 1, tape }));
    expect(s?.tape.length).toBe(TAPE_MAX);
    expect(s?.tape[TAPE_MAX - 1]?.id).toBe(`s${TAPE_MAX + 4}`);
  });
});

describe("createStore", () => {
  const state: SavedState = {
    tape: [{ kind: "update-ready", id: "u", at: 5 }],
    draft: "hello",
    channel: "quiet",
    flags,
  };

  it("debounces writes and loads them back", () => {
    const storage = memStorage();
    const timer = fakeTimer();
    const store = createStore(storage, { timer, enabled: true });
    store.save(state);
    store.save(state);
    expect(storage.data.size).toBe(0);
    timer.fire();
    expect(createStore(storage, { enabled: true }).load()).toEqual(state);
    expect(parseSaved(serialize(state))).toEqual(state);
  });

  it("disabled: flags and channel persist, tape and draft do not", () => {
    const storage = memStorage();
    const store = createStore(storage, { timer: fakeTimer(), enabled: false });
    store.save(state);
    store.flush();
    expect([...storage.data.keys()].sort()).toEqual([
      "dialtone.v1.channel",
      "dialtone.v1.flags",
    ]);
    const loaded = store.load();
    expect(loaded?.flags).toEqual(flags);
    expect(loaded?.tape).toEqual([]);
  });

  it("swallows storage exceptions", () => {
    const bad: StorageLike = {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("quota");
      },
    };
    const store = createStore(bad, { timer: fakeTimer(), enabled: true });
    expect(store.load()).toBeNull();
    expect(() => {
      store.save(state);
      store.flush();
    }).not.toThrow();
  });
});
