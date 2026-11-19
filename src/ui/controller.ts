/**
 * Controller: the only stateful glue between components, model and transport.
 * It holds the UiState in a tiny store, runs the effects that events imply and
 * owns the timers. Decisions live in src/ui/model.
 */

import type { ProfileId, TransportEvent } from "../audio";
import { draftView } from "./model/draft";
import {
  createStore,
  type SavedState,
  type StorageLike,
  type Store,
} from "./model/persist";
import { EMPTY_RECEIVE, receiveFrame } from "./model/receive";
import {
  initialState,
  reduce,
  SELF_TEST_MS,
  type SheetId,
  type UiEvent,
  type UiState,
} from "./model/reducer";
import { buildWire } from "./model/send";
import { transmitState } from "./model/status";
import type { Slip } from "./model/tape";
import type { UiTransport } from "./transport-seam";

/** Design parameter: how often `now` advances while a hold or a send is running. */
export const TICK_MS = 250;

export interface Clock {
  now(): number;
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface ControllerDeps {
  readonly transport: UiTransport;
  /** null: no persistence. */
  readonly storage?: StorageLike | null;
  readonly clock?: Clock;
  /** Haptic cue. Defaults to navigator.vibrate where it exists. */
  readonly vibrate?: ((pattern: number | number[]) => void) | null;
}

export interface Controller {
  getState(): UiState;
  /** Current time from the injected clock. Components read it on each render. */
  now(): number;
  subscribe(listener: () => void): () => void;
  powerTap(): void;
  latchTap(): void;
  setChannel(channel: ProfileId): void;
  setDraft(text: string): void;
  transmit(): void;
  tapeToggle(): void;
  legendToggle(): void;
  sheetOpen(sheet: SheetId): void;
  sheetClose(): void;
  onboardingNext(): void;
  onboardingSkip(): void;
  onboardingDone(): void;
  /** Primary button of the Microphone sheet. Call it from the tap. */
  micRetry(): void;
  installAvailable(available: boolean): void;
  /** A new version is waiting: prints the Update ready slip. */
  updateReady(): void;
  /** "Later" on the Update ready slip. */
  updateLater(): void;
  /** Writes pending state now (page hide). */
  flush(): void;
  dispose(): void;
}

const VIBRATE_SENT = 30;
const VIBRATE_HEARD = [40, 60, 40];

function hex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

function savedOf(s: UiState): SavedState {
  return {
    tape: s.tape,
    draft: s.draft,
    channel: s.channel,
    flags: {
      onboarded: s.flags.onboarded,
      micWasGranted: s.flags.micWasGranted,
      firstPowerShown: s.flags.firstPowerShown,
    },
  };
}

function defaultVibrate(): ((p: number | number[]) => void) | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & {
    vibrate?: (p: number | number[]) => boolean;
  };
  const fn = nav.vibrate;
  return typeof fn === "function"
    ? (p) => void (fn as (p: number | number[]) => boolean).call(nav, p)
    : null;
}

export function createController(deps: ControllerDeps): Controller {
  const { transport } = deps;
  const clock = deps.clock ?? realClock;
  const vibrate = deps.vibrate === undefined ? defaultVibrate() : deps.vibrate;
  const store: Store | null = deps.storage
    ? createStore(deps.storage, {
        timer: {
          set: (fn, ms) => clock.set(fn, ms),
          clear: (h) => clock.clear(h),
        },
      })
    : null;

  let state = initialState(store?.load() ?? null);
  let receive = EMPTY_RECEIVE;
  const listeners = new Set<() => void>();
  let powerGen = 0;
  let selfTestTimer: unknown = null;
  let tickTimer: unknown = null;
  let sendInFlight = false;
  let lastSaved = savedOf(state);
  /** `${channel}:${wireLength}` keys already asked for on the current channel. */
  const airtimeAsked = new Set<string>();

  const cue = (pattern: number | number[]): void => {
    try {
      vibrate?.(pattern);
    } catch {
      // A failing haptic never blocks the screen.
    }
  };

  const holdActive = (): boolean => {
    const t = clock.now();
    return (
      state.tx.phase === "sending" ||
      t < state.connectUntil ||
      t < state.carrier.shownUntil ||
      t < state.errorUntil ||
      t < state.busyUntil
    );
  };

  function scheduleTick(): void {
    if (tickTimer !== null || !holdActive()) return;
    tickTimer = clock.set(() => {
      tickTimer = null;
      notify();
      scheduleTick();
    }, TICK_MS);
  }

  function notify(): void {
    for (const l of [...listeners]) l();
  }

  function persist(): void {
    if (store === null) return;
    const next = savedOf(state);
    if (
      next.tape === lastSaved.tape &&
      next.draft === lastSaved.draft &&
      next.channel === lastSaved.channel &&
      next.flags.onboarded === lastSaved.flags.onboarded &&
      next.flags.micWasGranted === lastSaved.flags.micWasGranted &&
      next.flags.firstPowerShown === lastSaved.flags.firstPowerShown
    ) {
      return;
    }
    lastSaved = next;
    store.save(next);
  }

  function dispatch(e: UiEvent): void {
    const next = reduce(state, e);
    if (next === state) return;
    state = next;
    persist();
    notify();
    scheduleTick();
  }

  /** One airtime request per distinct wire length per channel, the first time only. */
  function syncAirtime(): void {
    if (state.power !== "on") return;
    const len = draftView(state.draft).wireLength;
    if (len === null) return;
    if (state.airtimeByWire[len] !== undefined) return;
    const key = `${state.channel}:${len}`;
    if (airtimeAsked.has(key)) return;
    airtimeAsked.add(key);
    const hit = transport.airtimeMs(len);
    if (hit !== null) {
      dispatch({
        type: "airtime",
        wireLength: len,
        ms: hit,
        channel: state.channel,
      });
    }
  }

  function onSlip(slip: Slip): void {
    dispatch({ type: "slip", slip, now: clock.now() });
    if (slip.kind === "heard") cue(VIBRATE_HEARD);
  }

  function onTransportEvent(ev: TransportEvent): void {
    switch (ev.kind) {
      case "mic":
        dispatch({
          type: "mic",
          mic: ev.state,
          now: clock.now(),
          ...(ev.processingDisabled === undefined
            ? {}
            : { processingDisabled: ev.processingDisabled }),
        });
        return;
      case "tx":
        if (ev.phase === "start") {
          dispatch({
            type: "tx-start",
            now: clock.now(),
            airtimeMs: ev.airtimeMs,
          });
        }
        // The end is handled when send() resolves, because that carries the result.
        return;
      case "airtime":
        dispatch({
          type: "airtime",
          wireLength: ev.byteLength,
          ms: ev.ms,
          channel: ev.profile,
        });
        return;
      case "carrier":
        dispatch({ type: "carrier", active: ev.active, now: clock.now() });
        return;
      case "frame": {
        const r = receiveFrame(receive, {
          frame: ev.frame,
          ownEcho: ev.ownEcho,
          atMs: clock.now(),
        });
        receive = r.next;
        if (r.slip !== null) onSlip(r.slip);
        return;
      }
      case "foreground":
        dispatch({ type: "foreground", visible: ev.visible });
        return;
      default:
        return;
    }
  }

  const unsubscribe = transport.subscribe(onTransportEvent);

  function clearSelfTest(): void {
    if (selfTestTimer !== null) {
      clock.clear(selfTestTimer);
      selfTestTimer = null;
    }
  }

  function powerOn(): void {
    const gen = ++powerGen;
    dispatch({ type: "power-tap", now: clock.now() });
    airtimeAsked.clear();
    // start() is called synchronously inside the tap: the browser gesture.
    const started = transport.start();
    clearSelfTest();
    selfTestTimer = clock.set(() => {
      selfTestTimer = null;
      if (gen !== powerGen) return;
      dispatch({ type: "self-test-done", now: clock.now() });
      syncAirtime();
    }, SELF_TEST_MS);
    void started.then(
      (r) => {
        if (gen !== powerGen) {
          if (r.ok) void transport.stop();
          return;
        }
        if (r.ok) {
          dispatch({
            type: "started",
            now: clock.now(),
            mic: r.value.mic,
          });
          // The persisted channel applies to the fresh transport.
          if (state.channel !== transport.profile) {
            transport.setProfile(state.channel);
          }
        } else {
          dispatch({ type: "start-failed", code: r.error.code });
        }
      },
      () => {
        if (gen === powerGen) {
          dispatch({ type: "start-failed", code: "SEND_UNAVAILABLE" });
        }
      },
    );
  }

  function powerOff(): void {
    powerGen++;
    clearSelfTest();
    sendInFlight = false;
    dispatch({ type: "power-tap", now: clock.now() });
    void transport.stop();
  }

  async function runSend(
    wire: Uint8Array,
    messageId: Uint8Array,
    text: string,
    bytes: number,
    mode: ProfileId,
  ): Promise<void> {
    sendInFlight = true;
    try {
      const r = await transport.send(wire);
      if (r.ok) {
        if (state.tx.phase !== "sending") {
          dispatch({
            type: "tx-start",
            now: clock.now(),
            airtimeMs: r.value.airtimeMs,
          });
        }
        const now = clock.now();
        dispatch({
          type: "tx-end",
          now,
          ok: true,
          slip: {
            kind: "sent",
            id: hex(messageId),
            at: now,
            text,
            bytes,
            mode,
            airtimeMs: r.value.airtimeMs,
          },
        });
        cue(VIBRATE_SENT);
        syncAirtime();
      } else if (r.error.code === "BUSY") {
        dispatch({ type: "send-busy", now: clock.now() });
      } else {
        dispatch({ type: "tx-end", now: clock.now(), ok: false, slip: null });
      }
    } catch {
      dispatch({ type: "tx-end", now: clock.now(), ok: false, slip: null });
    } finally {
      sendInFlight = false;
    }
  }

  return {
    getState: () => state,
    now: () => clock.now(),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    powerTap() {
      if (state.power === "off") powerOn();
      else if (state.power === "on") powerOff();
    },

    latchTap() {
      const before = state.latchPressed;
      dispatch({ type: "latch-tap" });
      if (state.latchPressed !== before) {
        transport.setListening(state.latchPressed);
      }
    },

    setChannel(channel) {
      const before = state.channel;
      dispatch({ type: "channel", channel });
      if (state.channel === before) return;
      airtimeAsked.clear();
      if (state.power !== "off") transport.setProfile(state.channel);
      syncAirtime();
    },

    setDraft(text) {
      dispatch({ type: "draft", text });
      syncAirtime();
    },

    transmit() {
      if (sendInFlight || transmitState(state) !== "default") return;
      const text = state.draft;
      const built = buildWire(text);
      if (!built.ok) {
        dispatch({ type: "tx-end", now: clock.now(), ok: false, slip: null });
        return;
      }
      dispatch({ type: "transmit", now: clock.now() });
      void runSend(
        built.value.wire,
        built.value.messageId,
        text,
        built.value.bytes,
        state.channel,
      );
    },

    tapeToggle: () => dispatch({ type: "tape-toggle" }),
    legendToggle: () => dispatch({ type: "legend-toggle" }),
    sheetOpen: (sheet) => dispatch({ type: "sheet-open", sheet }),
    sheetClose: () => dispatch({ type: "sheet-close" }),
    onboardingNext: () => dispatch({ type: "onboarding-next" }),
    onboardingSkip: () => dispatch({ type: "onboarding-skip" }),
    onboardingDone: () => dispatch({ type: "onboarding-done" }),

    micRetry() {
      dispatch({ type: "sheet-close" });
      void transport.restartMic();
    },

    installAvailable: (available) =>
      dispatch({ type: "install-available", available }),
    updateReady: () => dispatch({ type: "update-ready", now: clock.now() }),
    updateLater: () => dispatch({ type: "update-dismiss" }),

    flush() {
      store?.flush();
    },

    dispose() {
      powerGen++;
      clearSelfTest();
      if (tickTimer !== null) clock.clear(tickTimer);
      tickTimer = null;
      store?.flush();
      unsubscribe();
      listeners.clear();
    },
  };
}
