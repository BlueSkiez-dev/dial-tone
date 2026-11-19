/**
 * Microphone access: getUserMedia with the processing-off constraints, track events, and the
 * state machine from mic-state.ts. No logic beyond wiring.
 */

import {
  classifyMicError,
  MIC_CONSTRAINTS,
  type MicErrorCode,
  type MicEvent,
  type MicState,
  micReducer,
  processingDisabled,
} from "./mic-state";
import type { MicStreamLike, TransportDeps } from "./transport-deps";

export interface MicController {
  readonly state: MicState;
  readonly stream: MicStreamLike | null;
  /** The code of the last failure, or null. */
  readonly lastError: MicErrorCode | null;
  /** Ask for the stream. Returns null when the mic is not available (the state says why). */
  acquire(): Promise<MicStreamLike | null>;
  /** Record a failure after the stream was granted (for example the context refused to connect it). */
  fail(code: MicErrorCode): void;
  /** Stop the tracks and go back to idle. */
  release(): void;
}

export function createMic(
  deps: Pick<TransportDeps, "getUserMedia" | "onDeviceChange">,
  emit: (state: MicState, processingDisabled?: boolean) => void,
): MicController {
  let state: MicState = "idle";
  let stream: MicStreamLike | null = null;
  let lastError: MicErrorCode | null = null;

  const dispatch = (event: MicEvent, pd?: boolean) => {
    const next = micReducer(state, event);
    if (next === state) return;
    state = next;
    emit(state, pd);
  };

  const stopTracks = () => {
    for (const t of stream?.getAudioTracks() ?? []) t.stop();
    stream = null;
  };

  deps.onDeviceChange(() => {
    // A new device may make a retry work. Say so, but do not retry without a tap.
    if (state === "lost") emit(state);
  });

  return {
    get state() {
      return state;
    },
    get stream() {
      return stream;
    },
    get lastError() {
      return lastError;
    },
    async acquire() {
      if ((state === "live" || state === "muted") && stream) return stream;
      dispatch({ type: "request" });
      lastError = null;
      let granted: MicStreamLike;
      try {
        granted = await deps.getUserMedia(MIC_CONSTRAINTS);
      } catch (e) {
        lastError = classifyMicError((e as { name?: string } | null)?.name);
        dispatch({ type: "failed", code: lastError });
        return null;
      }
      const track = granted.getAudioTracks()[0];
      if (!track) {
        lastError = "UNKNOWN";
        dispatch({ type: "failed", code: lastError });
        return null;
      }
      stream = granted;
      const current = granted;
      const guard = (event: MicEvent) => () => {
        if (stream === current) dispatch(event);
      };
      track.addEventListener("ended", guard({ type: "track-ended" }));
      track.addEventListener("mute", guard({ type: "track-muted" }));
      track.addEventListener("unmute", guard({ type: "track-unmuted" }));
      dispatch({ type: "granted" }, processingDisabled(track.getSettings()));
      return granted;
    },
    fail(code) {
      stopTracks();
      lastError = code;
      dispatch({ type: "stop" });
      dispatch({ type: "request" });
      dispatch({ type: "failed", code });
    },
    release() {
      stopTracks();
      dispatch({ type: "stop" });
    },
  };
}
