// Strings for the channel switch, its mode notes and the Quiet notice (task 4.4).
// Kept beside the component so parallel tasks do not collide in copy.ts. Move into
// copy.ts when the sibling tasks have landed.
//
// "Figma" strings are verbatim: switch 213:252, State 09 note 279:126, State 03 note 273:126,
// State 10 note 280:126 and notice 280:131. Everything else is written for this task.
// The copy says how THIS phone sends. It never says what the phone listens to.

import type { ProfileId } from "../../audio/index";

export const channelCopy = {
  /** Written for this task. */
  switchLabel: "Channel switch",
  /** Written for this task: description of how the switch is used. */
  switchHint: "How this phone sends.",
  /** Written for this task: appended to the accessible name while sending. */
  unavailable: "unavailable while sending",
  /** Figma 213:200 to 213:250 */
  positions: {
    room: { name: "Room", caption: "Speaker to mic" },
    call: { name: "Call", caption: "Phone line" },
    quiet: { name: "Quiet", caption: "Near-silent" },
  } satisfies Record<ProfileId, { name: string; caption: string }>,
  /** Figma 273:126, 279:126, 280:126 */
  notes: {
    room: "Loudest and fastest. Hold the phones within a few meters.",
    call: "Fits through a phone call or a voice note. Hold the phone to the call\u2019s mic.",
    quiet: "Near-silent, same room only. Some older phones can\u2019t hear it.",
  } satisfies Record<ProfileId, string>,
  /** Figma 280:131, split around the bold band. The band text itself is built from PROFILES. */
  quietNotice: {
    before: "Near-silent needs both phones to handle ",
    after:
      ", and some older phones can\u2019t. If nothing arrives within 10 seconds, switch to Room.",
  },
} as const;

/** "Channel switch, Room, unavailable while sending" */
export function channelSwitchSendingName(channel: ProfileId): string {
  return `${channelCopy.switchLabel}, ${channelCopy.positions[channel].name}, ${channelCopy.unavailable}`;
}
