// Strings for the message well and byte meter.
// "Too long" and "~2.2 s on air" come from Figma (nodes 213:317 and 213:285).
// The rest were written for this task.

export const wellCopy = {
  /** Figma, node 213:317 */
  tooLong: "Too long",
  /** Written for this task: accessible name of the textarea. */
  fieldLabel: "Message",
  /** Written for this task: placeholder shown in the empty well. */
  placeholder: "Type a message",
  /** Written for this task: shown in place of the airtime while it is unknown. */
  airtimeUnknown: "—",
  /** Written for this task: accessible name of the meter. */
  meterLabel: "Message size",
} as const;

/** "41 / 128 B" */
export function meterLabel(bytes: number, limit: number): string {
  return `${bytes} / ${limit} B`;
}

/** "~2.2 s on air" (Figma 213:285), or a dash while unknown. */
export function airtimeLabel(airtimeMs: number | null | undefined): string {
  if (
    airtimeMs === null ||
    airtimeMs === undefined ||
    !Number.isFinite(airtimeMs)
  ) {
    return `${wellCopy.airtimeUnknown} s on air`;
  }
  return `~${(airtimeMs / 1000).toFixed(1)} s on air`;
}
