import { copy } from "../copy";
import type { GallerySlip } from "../model/tape";
import "./SosSlip.css";
import { formatSlipTime, MetaItem, PassOn } from "./slip-parts";

export interface SosSlipProps {
  slip: GallerySlip;
  /** Hop for the "Pass it on" button. Omit to hide it. */
  passOn?: number;
  onPassOn?: () => void;
}

/**
 * Body of the SOS slip: the red band, the meta line, the text. Figma 213:480.
 * The only slip file that uses the red Tokens.
 */
export function SosSlip(props: SosSlipProps) {
  const { slip } = props;
  return (
    <>
      <div class="sos-slip-band">{copy.slip.sos}</div>
      <div class="slip-meta sos-slip-meta">
        <MetaItem>{copy.slip.heard}</MetaItem>
        <MetaItem tone="hop">{copy.slip.hop(slip.hop ?? 1)}</MetaItem>
        <MetaItem>{slip.mode ?? "call"}</MetaItem>
        <MetaItem>{formatSlipTime(slip.at)}</MetaItem>
      </div>
      <p class="slip-text">{slip.text ?? ""}</p>
      {props.passOn === undefined ? null : (
        <PassOn hop={props.passOn} onTap={props.onPassOn} />
      )}
    </>
  );
}
