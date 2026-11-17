/** Single public entry point of src/protocol. */

export {
  CRC_LEN,
  frameOverhead,
  GGWAVE_MAX_PAYLOAD,
  HEADER_LEN_MULTI,
  HEADER_LEN_SINGLE,
  headerLength,
  IV_LEN,
  MAX_FRAMES,
  MAX_HOP,
  MAX_TTL,
  MESSAGE_ID_LEN,
  plaintextCapacity,
  TAG_LEN,
  utf8ByteLength,
  VERSION,
  wireBodyCapacity,
} from "./budget";
export { decodeFrame, encodeFrame, frameKey, patchRouting } from "./frame";
export { aadFor, ivFor } from "./frame-crypto-inputs";
export { newMessageId } from "./message-id";
export type {
  FrameTemplate,
  MessageInfo,
  Reassembly,
  SplitOptions,
} from "./segment";
export { makeFrames, reassemble, splitPayload } from "./segment";
export type {
  CryptoInputError,
  CryptoInputErrorCode,
  DecodeError,
  DecodeErrorCode,
  EncodeError,
  EncodeErrorCode,
  Frame,
  FrameHeader,
  MakeFramesError,
  MakeFramesErrorCode,
  MessageIdError,
  MessageIdErrorCode,
  MessageType,
  PatchRoutingError,
  PatchRoutingErrorCode,
  ReassembleError,
  ReassembleErrorCode,
  Result,
  SegmentError,
  SegmentErrorCode,
} from "./types";
