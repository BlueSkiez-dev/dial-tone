import { frameOverhead, utf8ByteLength } from "../../protocol/index";
import { type MeterView, meterView, wellLimit } from "./meter";

export interface DraftView {
  readonly text: string;
  /** utf8ByteLength(text), never text.length */
  readonly bytes: number;
  /** The open-channel single-frame limit. */
  readonly limit: number;
  readonly meter: MeterView;
  readonly status: "empty" | "ok" | "too-long";
  /** bytes + frameOverhead(1) for airtime, null when empty or too long */
  readonly wireLength: number | null;
}

export function draftView(text: string): DraftView {
  const bytes = utf8ByteLength(text);
  const limit = wellLimit();
  const status = bytes === 0 ? "empty" : bytes > limit ? "too-long" : "ok";
  return {
    text,
    bytes,
    limit,
    meter: meterView(bytes, limit),
    status,
    wireLength: status === "ok" ? bytes + frameOverhead(1) : null,
  };
}
