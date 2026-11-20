import { describe, expect, it } from "vitest";
import {
  createStore,
  parseSaved,
  type SavedState,
  type StorageLike,
  serialize,
  storedSlip,
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

  it("accepts the unreadable and relay-failed notice keys", () => {
    const raw = JSON.stringify({
      v: 1,
      tape: [
        { kind: "system", id: "a", at: 1, noticeKey: "unreadable" },
        { kind: "system", id: "b", at: 2, noticeKey: "relay-failed" },
        { kind: "system", id: "c", at: 3, noticeKey: "nope" },
      ],
    });
    expect(parseSaved(raw)?.tape.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("keeps passedOn only when it is true and never drops the slip", () => {
    const mk = (id: string, passedOn: unknown) => ({
      kind: "heard",
      id,
      at: 1,
      text: "hi",
      hop: 1,
      passedOn,
    });
    const raw = JSON.stringify({
      v: 1,
      tape: [
        mk("t", true),
        mk("f", false),
        mk("s", "true"),
        mk("n", 1),
        {
          kind: "system",
          id: "y",
          at: 2,
          noticeKey: "unreadable",
          passedOn: true,
        },
        {
          kind: "system",
          id: "z",
          at: 3,
          noticeKey: "unreadable",
          passedOn: 0,
        },
      ],
    });
    const tape = parseSaved(raw)?.tape ?? [];
    expect(tape.map((t) => t.id)).toEqual(["t", "f", "s", "n", "y", "z"]);
    const flagged = tape.filter((t) => "passedOn" in t).map((t) => t.id);
    expect(flagged).toEqual(["t", "y"]);
  });

  it("storedSlip drops relay metadata and a false passedOn", () => {
    const relay = { hop: 1, ttl: 2, multi: false, keyOffer: false };
    const heard = {
      kind: "heard" as const,
      id: "a",
      at: 1,
      text: "hi",
      bytes: 2,
      hop: 1,
      relay,
    };
    expect(storedSlip(heard)).toEqual({ ...heard, relay: undefined });
    expect("relay" in storedSlip(heard)).toBe(false);
    expect(storedSlip({ ...heard, passedOn: true })).toMatchObject({
      passedOn: true,
    });
    const raw = serialize({
      tape: [{ ...heard, passedOn: true }],
      draft: "",
      channel: "room",
      flags,
    });
    expect(raw).not.toContain("relay");
    expect(raw).toContain('"passedOn":true');
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
