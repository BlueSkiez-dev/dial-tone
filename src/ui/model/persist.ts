import type { ProfileId } from "../../audio/index";
import { PROFILES } from "../../audio/index";
import { utf8ByteLength } from "../../protocol/index";
import {
  type NoticeKey,
  SLIP_TEXT_MAX,
  type Slip,
  sanitizeText,
  TAPE_MAX,
} from "./tape";

/** One constant turns tape and draft persistence off. Flags and channel still persist. */
export const PERSIST_ENABLED = true;
export const STORAGE_PREFIX = "dialtone.v1.";
export const DEBOUNCE_MS = 300;
export const HOP_MAX = 15;

export interface SavedFlags {
  readonly onboarded: boolean;
  readonly micWasGranted: boolean;
  readonly firstPowerShown: boolean;
}

export interface SavedState {
  readonly tape: readonly Slip[];
  readonly draft: string;
  readonly channel: ProfileId;
  readonly flags: SavedFlags;
}

const NOTICE_KEYS: readonly NoticeKey[] = [
  "unsupported",
  "mic-again",
  "listening-open",
  "unreadable",
  "relay-failed",
];

/** The shape written to storage: no relay metadata, passedOn only when true. */
export function storedSlip(slip: Slip): Slip {
  if (slip.kind !== "heard" && slip.kind !== "system") return slip;
  const { relay: _relay, passedOn, ...rest } = slip;
  return passedOn === true
    ? ({ ...rest, passedOn: true } as Slip)
    : (rest as Slip);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isProfileId(v: unknown): v is ProfileId {
  return typeof v === "string" && Object.hasOwn(PROFILES, v);
}

function capText(v: unknown): string {
  if (typeof v !== "string") return "";
  return sanitizeText(v);
}

function capDraft(v: unknown): string {
  if (typeof v !== "string") return "";
  return Array.from(v).slice(0, SLIP_TEXT_MAX).join("");
}

function validSlip(v: unknown): Slip | null {
  if (!isObject(v)) return null;
  const { id, at } = v;
  if (typeof id !== "string" || id === "") return null;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  switch (v.kind) {
    case "sent": {
      if (typeof v.text !== "string" || !isProfileId(v.mode)) return null;
      const air = v.airtimeMs;
      if (typeof air !== "number" || !Number.isFinite(air) || air < 0)
        return null;
      const text = capText(v.text);
      return {
        kind: "sent",
        id,
        at,
        text,
        bytes: utf8ByteLength(text),
        mode: v.mode,
        airtimeMs: air,
      };
    }
    case "heard": {
      if (typeof v.text !== "string") return null;
      const hop = v.hop;
      if (
        typeof hop !== "number" ||
        !Number.isInteger(hop) ||
        hop < 0 ||
        hop > HOP_MAX
      )
        return null;
      const text = capText(v.text);
      return {
        kind: "heard",
        id,
        at,
        text,
        bytes: utf8ByteLength(text),
        hop,
        ...(v.passedOn === true ? { passedOn: true as const } : {}),
      };
    }
    case "system": {
      const key = NOTICE_KEYS.find((k) => k === v.noticeKey);
      if (key === undefined) return null;
      return {
        kind: "system",
        id,
        at,
        noticeKey: key,
        ...(v.passedOn === true ? { passedOn: true as const } : {}),
      };
    }
    case "update-ready":
      return { kind: "update-ready", id, at };
    default:
      return null;
  }
}

function validFlags(v: unknown): SavedFlags {
  const o = isObject(v) ? v : {};
  return {
    onboarded: o.onboarded === true,
    micWasGranted: o.micWasGranted === true,
    firstPowerShown: o.firstPowerShown === true,
  };
}

export function serialize(s: SavedState): string {
  return JSON.stringify({
    v: 1,
    tape: s.tape.map(storedSlip),
    draft: s.draft,
    channel: s.channel,
    flags: s.flags,
  });
}

/** Never throws. Invalid slips are dropped one by one. */
export function parseSaved(raw: string | null): SavedState | null {
  if (raw === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(data) || data.v !== 1) return null;
  const tape: Slip[] = [];
  if (Array.isArray(data.tape)) {
    for (const item of data.tape as unknown[]) {
      const slip = validSlip(item);
      if (slip !== null) tape.push(slip);
    }
  }
  return {
    tape: tape.slice(-TAPE_MAX),
    draft: capDraft(data.draft),
    channel: isProfileId(data.channel) ? data.channel : "room",
    flags: validFlags(data.flags),
  };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface Timer {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface StoreOptions {
  readonly timer?: Timer;
  readonly enabled?: boolean;
  readonly debounceMs?: number;
}

export interface Store {
  /** Reads saved state, or null when nothing is saved or storage fails. */
  load(): SavedState | null;
  /** Debounced write of the latest state. */
  save(s: SavedState): void;
  /** Writes any pending state now. */
  flush(): void;
}

const realTimer: Timer = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

function readJson(storage: StorageLike, name: string): unknown {
  const raw = storage.getItem(STORAGE_PREFIX + name);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function createStore(
  storage: StorageLike,
  opts: StoreOptions = {},
): Store {
  const timer = opts.timer ?? realTimer;
  const enabled = opts.enabled ?? PERSIST_ENABLED;
  const delay = opts.debounceMs ?? DEBOUNCE_MS;
  let broken = false;
  let pending: SavedState | null = null;
  let handle: unknown = null;

  function write(s: SavedState): void {
    if (broken) return;
    try {
      if (enabled) {
        storage.setItem(
          `${STORAGE_PREFIX}tape`,
          JSON.stringify(s.tape.map(storedSlip)),
        );
        storage.setItem(`${STORAGE_PREFIX}draft`, JSON.stringify(s.draft));
      }
      storage.setItem(`${STORAGE_PREFIX}channel`, JSON.stringify(s.channel));
      storage.setItem(`${STORAGE_PREFIX}flags`, JSON.stringify(s.flags));
    } catch {
      broken = true;
    }
  }

  function flush(): void {
    if (handle !== null) {
      timer.clear(handle);
      handle = null;
    }
    const s = pending;
    pending = null;
    if (s !== null) write(s);
  }

  return {
    load() {
      if (broken) return null;
      try {
        const raw = JSON.stringify({
          v: 1,
          tape: enabled ? readJson(storage, "tape") : undefined,
          draft: enabled ? readJson(storage, "draft") : undefined,
          channel: readJson(storage, "channel"),
          flags: readJson(storage, "flags"),
        });
        const parsed = parseSaved(raw);
        const any = ["tape", "draft", "channel", "flags"].some(
          (k) => storage.getItem(STORAGE_PREFIX + k) !== null,
        );
        return any ? parsed : null;
      } catch {
        broken = true;
        return null;
      }
    },
    save(s) {
      if (broken) return;
      pending = s;
      if (handle !== null) timer.clear(handle);
      handle = timer.set(() => {
        handle = null;
        flush();
      }, delay);
    },
    flush,
  };
}
