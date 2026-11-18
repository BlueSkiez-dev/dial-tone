/**
 * Channel profile table, the send-speed rule and the receive set.
 * A profile decides how this phone SENDS. It does not decide what this phone hears.
 * NORMAL ggwave speeds are deliberately not representable.
 */

export type ProfileId = "room" | "call" | "quiet";
export type Family = "AUDIBLE" | "DT" | "ULTRASOUND";
export type Speed = "FASTEST" | "FAST";
export type ProtocolId = `${Family}_${Speed}`;

export interface ChannelProfile {
  readonly id: ProfileId;
  readonly family: Family;
  readonly firstSpeed: Speed;
  readonly retrySpeed: Speed;
  /** Inclusive band in Hz for this profile's carrier detector. null until measured: no detector is created. */
  readonly carrierBandHz: readonly [lowHz: number, highHz: number] | null;
  /** ggwave encode volume, 0..100. */
  readonly volume: number;
}

export const PROFILES: Readonly<Record<ProfileId, ChannelProfile>> = {
  room: {
    id: "room",
    family: "AUDIBLE",
    firstSpeed: "FASTEST",
    retrySpeed: "FAST",
    carrierBandHz: [1900, 6400],
    volume: 25,
  },
  call: {
    id: "call",
    family: "DT",
    firstSpeed: "FASTEST",
    retrySpeed: "FAST",
    carrierBandHz: [1120, 2580],
    volume: 25,
  },
  quiet: {
    id: "quiet",
    family: "ULTRASOUND",
    firstSpeed: "FASTEST",
    retrySpeed: "FASTEST",
    // Task 3.1: central 95% of ULTRASOUND_FASTEST energy at 48 kHz, rounded outward to 100 Hz.
    carrierBandHz: [15000, 19400],
    volume: 25,
  },
};

/** Receive scope. "all" is the decision. "active" is the CPU fallback decided by task 13.2. */
export const RX_LISTEN_SCOPE: "all" | "active" = "all";

/** First speed for attempt 0 or less, any non-integer or non-number. Retry speed for integers >= 1. */
export function speedFor(profile: ChannelProfile, attempt: number): Speed {
  if (
    typeof attempt === "number" &&
    Number.isInteger(attempt) &&
    attempt >= 1
  ) {
    return profile.retrySpeed;
  }
  return profile.firstSpeed;
}

export function protocolFor(
  profile: ChannelProfile,
  attempt: number,
): ProtocolId {
  return `${profile.family}_${speedFor(profile, attempt)}`;
}

function dedupe(ids: readonly ProtocolId[]): ProtocolId[] {
  return [...new Set(ids)];
}

/** First and retry protocol of one profile, deduplicated. */
export function rxProtocols(profile: ChannelProfile): readonly ProtocolId[] {
  return dedupe([
    `${profile.family}_${profile.firstSpeed}`,
    `${profile.family}_${profile.retrySpeed}`,
  ]);
}

/** First and retry protocols of every profile in PROFILES, deduplicated. Derived from the table. */
export function allRxProtocols(): readonly ProtocolId[] {
  return dedupe(Object.values(PROFILES).flatMap((p) => rxProtocols(p)));
}

/** What a pipeline listens for: every family when scope is "all", else the profile's own. */
export function rxSet(
  scope: "all" | "active",
  profile: ChannelProfile,
): readonly ProtocolId[] {
  return scope === "all" ? allRxProtocols() : rxProtocols(profile);
}
