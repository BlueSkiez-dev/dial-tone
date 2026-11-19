import { describe, expect, it } from "vitest";
import { installE2eHook, isE2eEnabled } from "./e2e-hook";

const controller = { getState: () => ({ marker: 1 }) as never };

function fakeTransport() {
  const listeners: Array<(e: never) => void> = [];
  return {
    transport: {
      subscribe(l: (e: never) => void) {
        listeners.push(l);
        return () => {};
      },
    },
    emit: (e: unknown) => {
      for (const l of listeners) l(e as never);
    },
  };
}

describe("e2e hook", () => {
  it("is enabled only by e2e=1", () => {
    expect(isE2eEnabled("?e2e=1")).toBe(true);
    expect(isE2eEnabled("?state=off&e2e=1")).toBe(true);
    expect(isE2eEnabled("")).toBe(false);
    expect(isE2eEnabled("?e2e=0")).toBe(false);
    expect(isE2eEnabled("?e2e")).toBe(false);
  });

  it("does not create __dialtone or subscribe without the flag", () => {
    const target: Record<string, unknown> = {};
    const t = fakeTransport();
    let subscribed = false;
    const spy = {
      subscribe: (l: (e: never) => void) => {
        subscribed = true;
        return t.transport.subscribe(l);
      },
    };
    expect(installE2eHook(target, "?x=1", controller, spy)).toBe(false);
    expect("__dialtone" in target).toBe(false);
    expect(subscribed).toBe(false);
  });

  it("exposes state and records events with the flag", () => {
    const target: Record<string, unknown> = {};
    const t = fakeTransport();
    expect(installE2eHook(target, "?e2e=1", controller, t.transport)).toBe(
      true,
    );
    const hook = target.__dialtone as {
      getState(): unknown;
      events: unknown[];
    };
    t.emit({ type: "x" });
    expect(hook.getState()).toEqual({ marker: 1 });
    expect(hook.events).toEqual([{ type: "x" }]);
  });
});
