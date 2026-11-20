/**
 * Controller: the only stateful glue between components, model and transport.
 * It holds the UiState in a tiny store, runs the effects that events imply and
 * owns the timers. Decisions live in src/ui/model.
 */

import type { ProfileId, TransportEvent } from "../audio";
import { decodeFrame, frameKey, markSeen, relayWire } from "../protocol/index";
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
  /** Tap on "Pass it on": sends the patched Held_Wire of the slip once. */
  passOn(slipId: string): void;
  /** True while the Held_Wire of this slip is in memory. */
  holdsWire(slipId: string): boolean;
  /** Writes pending state now (page hide). */
  flush(): void;
  dispose(): void;
}

/** relayWire refusals: the rule says no, so nothing is sent or printed. */
const REFUSALS: ReadonlySet<string> = new Set([
  "MULTI_FRAME",
  "NOT_RELAYED_TYPE",
  "NO_HOPS_LEFT",
  "HOP_LIMIT",
]);

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
  /** Held_Wires of heard slips. Memory only, never in UiState or storage. */
  const held = new Map<string, Uint8Array>();
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

  /** Drops every Held_Wire whose slip is no longer on the tape (50-slip cap). */
  function pruneHeld(): void {
    if (held.size === 0) return;
    const ids = new Set<string>();
    for (const s of state.tape) ids.add(s.id);
    for (const id of [...held.keys()]) {
      if (!ids.has(id)) held.delete(id);
    }
  }

  function dispatch(e: UiEvent): void {
    const next = reduce(state, e);
    if (next === state) return;
    state = next;
    pruneHeld();
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
        if (r.slip !== null) {
          // Kept before the dispatch so the first render already finds the wire.
          // Hearing a frame never sends anything.
          if (r.holdsWire) held.set(r.slip.id, ev.wire);
          onSlip(r.slip);
        }
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

  /**
   * Shared send path for a new message and for a relay pass-on. `onOk` builds
   * the slip printed on success (null prints none). Resolves to the outcome so
   * callers can add their own follow-up.
   */
  async function sendWire(
    wire: Uint8Array,
    onOk: (
      airtimeMs: number,
      now: number,
    ) => Extract<Parameters<typeof dispatch>[0], { type: "tx-end" }>["slip"],
  ): Promise<"ok" | "busy" | "failed"> {
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
          slip: onOk(r.value.airtimeMs, now),
        });
        cue(VIBRATE_SENT);
        syncAirtime();
        return "ok";
      }
      if (r.error.code === "BUSY") {
        dispatch({ type: "send-busy", now: clock.now() });
        return "busy";
      }
      dispatch({ type: "tx-end", now: clock.now(), ok: false, slip: null });
      return "failed";
    } catch {
      dispatch({ type: "tx-end", now: clock.now(), ok: false, slip: null });
      return "failed";
    } finally {
      sendInFlight = false;
    }
  }

  function printRelayFailed(slipId: string): void {
    const at = clock.now();
    dispatch({
      type: "slip",
      slip: {
        kind: "system",
        id: `relay-failed:${slipId}:${at}`,
        at,
        noticeKey: "relay-failed",
      },
      now: at,
    });
  }

  async function runSend(
    wire: Uint8Array,
    messageId: Uint8Array,
    text: string,
    bytes: number,
    mode: ProfileId,
  ): Promise<void> {
    const outcome = await sendWire(wire, (airtimeMs, now) => ({
      kind: "sent",
      id: hex(messageId),
      at: now,
      text,
      bytes,
      mode,
      airtimeMs,
    }));
    // Record the sent frame's Message_Key so a passed-on copy of this message,
    // whose bytes differ from the direct echo, is ignored as a duplicate (3.12).
    if (outcome !== "ok") return;
    const sent = decodeFrame(wire);
    if (sent.ok) {
      receive = {
        ...receive,
        seen: markSeen(receive.seen, frameKey(sent.value)),
      };
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

    holdsWire: (slipId) => held.has(slipId),

    passOn(slipId) {
      // The draft plays no part: only power, fault and an in-flight send gate it.
      if (
        sendInFlight ||
        state.power !== "on" ||
        state.fault !== null ||
        state.tx.phase === "sending"
      )
        return;
      const slip = state.tape.find((s) => s.id === slipId);
      if (slip === undefined) return;
      if ((slip.kind === "heard" || slip.kind === "system") && slip.passedOn) {
        return;
      }
      const wire = held.get(slipId);
      if (wire === undefined) return;
      const patched = relayWire(wire);
      if (!patched.ok) {
        // A refusal sends nothing and prints nothing. A decode error prints a notice.
        if (!REFUSALS.has(patched.error.code)) printRelayFailed(slipId);
        return;
      }
      void sendWire(patched.value, () => null).then((outcome) => {
        if (outcome === "ok") {
          receive = { ...receive, seen: markSeen(receive.seen, slipId) };
          dispatch({ type: "passed-on", id: slipId });
        } else if (outcome === "failed") {
          printRelayFailed(slipId);
        }
        // "busy": send-busy was dispatched, nothing else changes.
      });
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
      held.clear();
      listeners.clear();
    },
  };
}
