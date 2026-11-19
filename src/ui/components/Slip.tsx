import type { ComponentChildren } from "preact";
import { copy } from "../copy";
import type { GallerySlip, Slip as SlipModel } from "../model/tape";
import { GhostText } from "./GhostText";
import "./Slip.css";
import { SosSlip } from "./SosSlip";
import { formatSlipTime, MetaItem, PassOn, SlipButton } from "./slip-parts";

/** Optional gallery-only detail for the component-only slip types. */
export interface SlipExtra {
  /** Locked: the group name. */
  group?: string;
  /** Relayed: how many times it was passed on. */
  passedOn?: number;
  /** Location: the coordinates line. */
  coords?: string;
  /** Location: the bearing line. */
  bearing?: string;
}

export interface SlipProps {
  slip: SlipModel | GallerySlip;
  /** Hop shown on the "Pass it on → hop N" button. The button renders only when this is given. */
  passOn?: number;
  onPassOn?: () => void;
  /** Update ready buttons. */
  onLater?: () => void;
  onRestart?: () => void;
  /** True for a slip that was just added: print line by line, and resolve Heard text out of static. */
  fresh?: boolean;
  extra?: SlipExtra;
}

/** Text of a System notice slip: its title and body, by key. */
export function noticeCopy(key: string): { title: string; text: string } {
  const table: Record<string, { title: string; text: string }> =
    copy.slip.notices;
  return table[key] ?? copy.slip.notices.unsupported;
}

function Meta(props: { children: ComponentChildren }) {
  return <div class="slip-meta">{props.children}</div>;
}

function Text(props: { children: ComponentChildren }) {
  return <p class="slip-text">{props.children}</p>;
}

function Redacted() {
  return (
    <div class="slip-redacted" aria-hidden="true">
      <span class="slip-redacted-bar" data-bar="1" />
      <span class="slip-redacted-bar" data-bar="2" />
    </div>
  );
}

function Stamp(props: { label: string }) {
  return (
    <div class="slip-stamp">
      <span>{props.label}</span>
    </div>
  );
}

function body(props: SlipProps): ComponentChildren {
  const { slip, extra } = props;
  const pass =
    props.passOn === undefined ? null : (
      <PassOn hop={props.passOn} onTap={props.onPassOn} />
    );
  switch (slip.kind) {
    case "sent":
      return (
        <>
          <Meta>
            <MetaItem>{copy.slip.sent}</MetaItem>
            <MetaItem>{slip.mode}</MetaItem>
            <MetaItem>{formatSlipTime(slip.at)}</MetaItem>
          </Meta>
          <Text>{slip.text}</Text>
        </>
      );
    case "heard":
      return (
        <>
          <Meta>
            <MetaItem>{copy.slip.heard}</MetaItem>
            <MetaItem tone="hop">{copy.slip.hop(slip.hop)}</MetaItem>
            <MetaItem>{formatSlipTime(slip.at)}</MetaItem>
          </Meta>
          <Text>
            <GhostText text={slip.text} active={props.fresh === true} />
          </Text>
          {pass}
        </>
      );
    case "system": {
      const n = noticeCopy(slip.noticeKey);
      return (
        <>
          <Meta>
            <MetaItem tone="ink">{copy.slip.systemTitle(n.title)}</MetaItem>
            <MetaItem tone="ink">{formatSlipTime(slip.at)}</MetaItem>
          </Meta>
          <Text>{n.text}</Text>
        </>
      );
    }
    case "update-ready":
      return (
        <>
          <Meta>
            <MetaItem tone="ink">{copy.slip.updateTitle}</MetaItem>
            <MetaItem tone="ink">{formatSlipTime(slip.at)}</MetaItem>
          </Meta>
          <Text>{copy.slip.updateText}</Text>
          <div class="slip-actions">
            <SlipButton label={copy.slip.later} onTap={props.onLater} />
            <SlipButton label={copy.slip.restartNow} onTap={props.onRestart} />
          </div>
        </>
      );
    case "relayed":
      return (
        <>
          <Meta>
            <MetaItem>{copy.slip.heard}</MetaItem>
            <MetaItem tone="hop">{copy.slip.hop(slip.hop ?? 1)}</MetaItem>
            <MetaItem>{slip.mode ?? "room"}</MetaItem>
            <MetaItem>{formatSlipTime(slip.at)}</MetaItem>
            <span class="slip-meta-break" />
            <MetaItem>{copy.slip.passedOn(extra?.passedOn ?? 1)}</MetaItem>
          </Meta>
          <Text>{slip.text ?? ""}</Text>
          {pass}
        </>
      );
    case "sos":
      return (
        <SosSlip slip={slip} passOn={props.passOn} onPassOn={props.onPassOn} />
      );
    case "locked":
    case "locked-no-key":
      return (
        <>
          <Meta>
            <MetaItem>{copy.slip.heard}</MetaItem>
            <MetaItem tone="hop">{copy.slip.hop(slip.hop ?? 1)}</MetaItem>
            <MetaItem tone="hop">
              {copy.slip.lockedLabel(extra?.group ?? "")}
            </MetaItem>
            <span class="slip-meta-break" />
            <MetaItem>{slip.mode ?? "room"}</MetaItem>
            <MetaItem>{formatSlipTime(slip.at)}</MetaItem>
          </Meta>
          {slip.kind === "locked" ? (
            <Text>{slip.text ?? ""}</Text>
          ) : (
            <>
              <Redacted />
              <p class="slip-note">{copy.slip.lockedNoKey}</p>
            </>
          )}
          {pass}
        </>
      );
    case "location":
      return (
        <>
          <Meta>
            <MetaItem>{copy.slip.heard}</MetaItem>
            <MetaItem tone="hop">{copy.slip.hop(slip.hop ?? 1)}</MetaItem>
            <MetaItem>{slip.mode ?? "call"}</MetaItem>
            <MetaItem>{formatSlipTime(slip.at)}</MetaItem>
          </Meta>
          <Stamp label={copy.slip.locationStamp} />
          {extra?.coords === undefined ? null : (
            <p class="slip-coords">{extra.coords}</p>
          )}
          <Text>{slip.text ?? ""}</Text>
          {extra?.bearing === undefined ? null : (
            <div class="slip-bearing">
              <span class="slip-bearing-arrow" aria-hidden="true">
                ↗
              </span>
              <span>{extra.bearing}</span>
            </div>
          )}
          {pass}
        </>
      );
    case "safe":
      return (
        <>
          <Meta>
            <MetaItem>{copy.slip.heard}</MetaItem>
            <MetaItem>{slip.mode ?? "room"}</MetaItem>
            <MetaItem>{formatSlipTime(slip.at)}</MetaItem>
          </Meta>
          <Stamp label={copy.slip.safeStamp} />
          <Text>{slip.text ?? ""}</Text>
          {pass}
        </>
      );
  }
}

/**
 * One thermal slip. All ten Figma types, node 213:481. Text is always rendered as text.
 * The red SOS band lives in SosSlip.tsx only.
 */
export function Slip(props: SlipProps) {
  const { slip } = props;
  return (
    <article
      class="slip"
      data-kind={slip.kind}
      data-printing={props.fresh === true ? "true" : undefined}
      data-bytes={
        slip.kind === "sent" || slip.kind === "heard" ? slip.bytes : undefined
      }
      data-airtime-ms={slip.kind === "sent" ? slip.airtimeMs : undefined}
    >
      <div class="slip-paper">{body(props)}</div>
    </article>
  );
}
