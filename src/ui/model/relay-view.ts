import type { Slip } from "./tape";

/** What a slip shows for the Pass it on feature. `hop` in `action` is N in "Pass it on → hop N". */
export type SlipRelayView =
  | { kind: "none" }
  | { kind: "action"; hop: number; disabled: boolean }
  | {
      kind: "reason";
      key: "no-hops" | "hop-limit" | "multi" | "key-offer";
    }
  | { kind: "passed" };

/** Highest hop count the 4-bit routing field holds. */
const HOP_MAX = 15;

/**
 * Pure decision for the Pass it on action of a Heard slip or an unreadable
 * System slip. Any other slip returns `none`. The reason order follows
 * `checkRelay` (multi, key offer, no hops, hop limit). A slip that can't be
 * passed on only because of a restart (no relay meta, or no Held_Wire) gets
 * `none`: no action and no reason line (4.6). The held check comes last so a
 * KEY_OFFER, which is never held, still shows its own reason.
 */
export function relayView(
  slip: Slip,
  ctx: { held: boolean; canSendNow: boolean },
): SlipRelayView {
  const relayable =
    slip.kind === "heard" ||
    (slip.kind === "system" && slip.noticeKey === "unreadable");
  if (!relayable) return { kind: "none" };

  if (slip.passedOn === true) return { kind: "passed" };

  const relay = slip.relay;
  if (!relay) return { kind: "none" };
  if (relay.multi) return { kind: "reason", key: "multi" };
  if (relay.keyOffer) return { kind: "reason", key: "key-offer" };
  if (relay.ttl < 1) return { kind: "reason", key: "no-hops" };
  if (relay.hop >= HOP_MAX) return { kind: "reason", key: "hop-limit" };
  if (!ctx.held) return { kind: "none" };

  return { kind: "action", hop: relay.hop + 1, disabled: !ctx.canSendNow };
}
