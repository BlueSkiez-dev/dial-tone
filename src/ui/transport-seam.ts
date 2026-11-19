/**
 * The seam between src/ui and src/audio. The UI talks to audio only through UiTransport.
 * This is the only runtime import of createAudioTransport in src/ui.
 */

import type { AudioTransport } from "../audio";
import { createAudioTransport } from "../audio";

/** What the UI needs from src/audio. The real AudioTransport satisfies it structurally. */
export type UiTransport = Pick<
  AudioTransport,
  | "start"
  | "restartMic"
  | "stop"
  | "setProfile"
  | "send"
  | "airtimeMs"
  | "setListening"
  | "subscribe"
  | "analyser"
  | "profile"
>;

/** Builds the real transport. Real audio is verified on `npm run build` plus `npm run preview`. */
export function createRealTransport(): UiTransport {
  return createAudioTransport();
}
