import { describe, expect, it, vi } from "vitest";
import type { Controller } from "./controller";
import { initialState, type UiState } from "./model/reducer";
import { type RegisterSw, startPwa } from "./pwa";

function setup(state: UiState, standalone = false) {
  const calls: string[] = [];
  const controller = {
    getState: () => state,
    now: () => 1000,
    installAvailable: (a: boolean) => calls.push(`avail:${a}`),
    updateReady: () => calls.push("ready"),
    updateLater: () => calls.push("later"),
    sheetClose: () => calls.push("close"),
  } as unknown as Controller;
  const listeners = new Map<string, (e: Event) => void>();
  const target = {
    addEventListener: (t: string, fn: (e: Event) => void) => {
      listeners.set(t, fn);
    },
  };
  const update = vi.fn(async () => {});
  let needRefresh: (() => void) | undefined;
  const register: RegisterSw = (o) => {
    needRefresh = o.onNeedRefresh;
    return update;
  };
  const pwa = startPwa({
    controller,
    register,
    target,
    isStandalone: () => standalone,
  });
  return { calls, listeners, update, pwa, needRefresh: () => needRefresh?.() };
}

describe("startPwa", () => {
  it("turns beforeinstallprompt into install-available and keeps the prompt", async () => {
    const s = setup(initialState(null));
    expect(s.pwa.onInstall).toBeUndefined();
    const prompt = vi.fn(async () => {});
    const ev = Object.assign(new Event("beforeinstallprompt"), {
      prompt,
      userChoice: Promise.resolve({ outcome: "dismissed" as const }),
    });
    s.listeners.get("beforeinstallprompt")?.(ev);
    expect(s.calls).toContain("avail:true");
    s.pwa.onInstall?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(prompt).toHaveBeenCalledOnce();
    expect(s.calls).toContain("avail:false");
    expect(s.pwa.onInstall).toBeUndefined();
  });

  it("does not listen for the install prompt when standalone", () => {
    const s = setup(initialState(null), true);
    expect(s.listeners.has("beforeinstallprompt")).toBe(false);
  });

  it("prints the update slip on need-refresh and dismisses on Later", () => {
    const s = setup(initialState(null));
    s.needRefresh();
    s.pwa.onLater?.();
    expect(s.calls).toEqual(["ready", "later"]);
  });

  it("restarts only when canRestartNow is true", () => {
    const idle = setup(initialState(null));
    idle.pwa.onRestart?.();
    expect(idle.update).toHaveBeenCalledWith(true);

    const busy = setup({
      ...initialState(null),
      carrier: { active: true, shownUntil: 0 },
    } as UiState);
    busy.pwa.onRestart?.();
    expect(busy.update).not.toHaveBeenCalled();
  });
});
