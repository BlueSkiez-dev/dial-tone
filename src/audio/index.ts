/**
 * Public API of src/audio. Other layers import from here only.
 * MIC_CONSTRAINTS is internal and not exported. No ggwave type is exported.
 */

export { airtimeMs } from "./airtime";
export { CPU_CHANNEL } from "./cpu-debug";
export type { CpuReport } from "./cpu-probe";
export { cpuFlagFromSearch, formatCpuReport } from "./cpu-probe";
export type { MicState } from "./mic-state";
export type {
  ChannelProfile,
  Family,
  ProfileId,
  ProtocolId,
  Speed,
} from "./profiles";
export {
  allRxProtocols,
  PROFILES,
  protocolFor,
  RX_LISTEN_SCOPE,
  rxProtocols,
  speedFor,
} from "./profiles";
export { createAudioTransport } from "./transport";
export type {
  AudioTransport,
  SendErrorCode,
  SendReport,
  SpectrumSource,
  StartError,
  TransportEvent,
} from "./transport-types";
