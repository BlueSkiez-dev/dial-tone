/**
 * Public API of src/audio. Other layers import from here only.
 * MIC_CONSTRAINTS is internal and not exported. No ggwave type is exported.
 */

export { airtimeMs } from "./airtime";
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
