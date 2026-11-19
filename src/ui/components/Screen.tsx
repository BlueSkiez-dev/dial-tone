import type { SpectrumSource } from "../../audio/index";
import type { Controller } from "../controller";
import { draftView } from "../model/draft";
import type { GalleryExtras } from "../model/gallery";
import type { UiState } from "../model/reducer";
import { formatKHz, scopeWindow } from "../model/scope-map";
import {
  listenState,
  signalDirection,
  statusView,
  transmitFlash,
  transmitState,
} from "../model/status";
import type { Slip as SlipModel } from "../model/tape";
import { App } from "./App";
import { ChannelModeNote, ChannelSwitch, QuietNotice } from "./ChannelSwitch";
import { channelCopy } from "./channel-copy";
import { GroupKeyBar } from "./GroupKeyBar";
import { ListenLatch } from "./ListenLatch";
import { MessageWell } from "./MessageWell";
import { Notice } from "./Notice";
import { QuickKeys } from "./QuickKeys";
import { Rocker } from "./Rocker";
import { Scope } from "./Scope";
import {
  InstallSheet,
  MicrophoneSheet,
  Onboarding1,
  Onboarding2,
  Onboarding3,
} from "./SheetContent";
import { Slip } from "./Slip";
import { SosButton } from "./SosButton";
import { StatusWindow } from "./StatusWindow";
import type { MicSheetReason } from "./sheet-copy";
import { Tape } from "./Tape";
import { TransmitKey } from "./TransmitKey";

/** What the screen asks of the controller. The gallery passes no-ops. */
export type ScreenActions = Pick<
  Controller,
  | "powerTap"
  | "latchTap"
  | "setChannel"
  | "setDraft"
  | "transmit"
  | "tapeToggle"
  | "legendToggle"
  | "sheetOpen"
  | "sheetClose"
  | "onboardingNext"
  | "onboardingSkip"
  | "onboardingDone"
  | "micRetry"
>;

/** Hooks for the PWA runtime (task 5.3). Absent hooks leave the buttons inert or hidden. */
export interface PwaHooks {
  /** Primary button of the Install sheet when the browser gave a prompt. */
  onInstall?: () => void;
  /** "Restart now" on the Update ready slip. The runtime applies `canRestartNow`. */
  onRestart?: () => void;
  /** "Later" on the Update ready slip. */
  onLater?: () => void;
}

export interface ScreenProps {
  state: UiState;
  /** Frozen in the gallery, the controller clock in the live app. */
  now: number;
  actions: ScreenActions;
  /** `UiTransport.analyser`. Null in the gallery. */
  source: SpectrumSource | null;
  reducedMotion: boolean;
  /** Id of the slip that was just added. */
  freshId?: string | null;
  /** Gallery only. The live app passes none and the reserved slots stay empty. */
  extras?: GalleryExtras;
  pwa?: PwaHooks;
}

const MIC_REASONS: readonly MicSheetReason[] = [
  "busy",
  "no_device",
  "insecure",
  "error",
  "lost",
];

function micReason(state: UiState): MicSheetReason {
  if (state.sheet === "mic-denied") return "denied";
  if (state.sheet === "mic-reset") return "reset";
  const hit = MIC_REASONS.find((r) => r === state.mic);
  return hit ?? "error";
}

function Sheets(props: ScreenProps) {
  const { state, actions, pwa } = props;
  switch (state.sheet) {
    case "onboarding-1":
      return (
        <Onboarding1
          onSkip={actions.onboardingSkip}
          onNext={actions.onboardingNext}
        />
      );
    case "onboarding-2":
      return (
        <Onboarding2
          onBack={() => actions.sheetOpen("onboarding-1")}
          onNext={actions.onboardingNext}
          onClose={actions.onboardingSkip}
        />
      );
    case "onboarding-3":
      return (
        <Onboarding3
          onBack={() => actions.sheetOpen("onboarding-2")}
          onDone={actions.onboardingDone}
          onClose={actions.onboardingDone}
        />
      );
    case "mic-denied":
    case "mic-reset":
    case "mic-error":
      return (
        <MicrophoneSheet
          reason={micReason(state)}
          onSendOnly={actions.sheetClose}
          onTryAgain={actions.micRetry}
        />
      );
    case "install":
      return (
        <InstallSheet onClose={actions.sheetClose} onInstall={pwa?.onInstall} />
      );
    case null:
      return null;
  }
}

function sosState(extras: GalleryExtras): "holding" | "default" {
  return extras.sosRing > 0 ? "holding" : "default";
}

/**
 * The whole screen as a pure function of state, so the live app and the state
 * gallery render through the same components.
 */
export function Screen(props: ScreenProps) {
  const { state, now, actions, extras, pwa } = props;
  const draft = draftView(state.draft);
  const airtimeMs =
    draft.wireLength === null
      ? null
      : (state.airtimeByWire[draft.wireLength] ?? null);
  const sending = state.tx.phase === "sending";
  const progress =
    sending && state.tx.airtimeMs
      ? (now - state.tx.startedAt) / state.tx.airtimeMs
      : 0;
  const installNotice =
    state.install.available &&
    !state.install.dismissed &&
    !state.install.standalone;
  const passOn = extras?.passOn
    ? (slip: SlipModel) => (slip.kind === "heard" ? slip.hop + 1 : undefined)
    : undefined;
  const win = scopeWindow(state.channel);
  const bandLabel = win.bandHz
    ? `${channelCopy.positions[state.channel].name} · ${formatKHz(win.bandHz[0])}-${formatKHz(win.bandHz[1])} kHz`
    : `${channelCopy.positions[state.channel].name} band`;

  return (
    <App
      signal={signalDirection(state, now)}
      power={
        <Rocker
          on={state.power !== "off"}
          pulseAmber={state.flags.rockerHint && state.power === "off"}
          onTap={actions.powerTap}
        />
      }
      statusWindow={
        <StatusWindow
          view={statusView(state, now)}
          power={state.power}
          legendOpen={state.legendOpen}
          onLedTap={actions.legendToggle}
        />
      }
      scope={
        <Scope
          source={props.source}
          window={scopeWindow(state.channel)}
          power={state.power}
          reducedMotion={props.reducedMotion}
          bandLabel={bandLabel}
        />
      }
      channel={
        <>
          <ChannelSwitch
            value={state.channel}
            disabled={sending}
            onChange={actions.setChannel}
          />
          <ChannelModeNote value={state.channel} />
          {state.channel === "quiet" ? <QuietNotice /> : null}
        </>
      }
      messageWell={
        <MessageWell
          value={state.draft}
          onInput={actions.setDraft}
          meter={draft.meter}
          airtimeMs={airtimeMs}
          disabled={state.power === "off"}
        />
      }
      transmit={
        <TransmitKey
          state={transmitState(state)}
          airtimeMs={airtimeMs}
          progress={progress}
          flash={transmitFlash(state, now)}
          onTap={actions.transmit}
        />
      }
      groupKey={extras?.showGroupKeyBar ? <GroupKeyBar state="open" /> : null}
      quickKeys={extras?.showQuickKeys ? <QuickKeys /> : null}
      sos={
        extras?.showSosSlot ? (
          <SosButton state={sosState(extras)} progress={extras.sosRing} />
        ) : null
      }
      tape={
        <>
          {/* ListenLatch carries the "Tape" caption, so the Tape adds none. */}
          <ListenLatch state={listenState(state)} onTap={actions.latchTap} />
          {extras?.demoSlips.map((slip) => (
            <Slip key={slip.id} slip={slip} />
          ))}
          <Tape
            slips={state.tape}
            expanded={state.tapeExpanded}
            onToggle={actions.tapeToggle}
            freshId={props.freshId}
            passOn={passOn}
            onLater={pwa?.onLater}
            onRestart={pwa?.onRestart}
          />
          {/* Figma State 16 (258:2): the Install notice sits under the Tape. */}
          {installNotice ? (
            <Notice onKey={() => actions.sheetOpen("install")} />
          ) : null}
        </>
      }
      sheets={<Sheets {...props} />}
    />
  );
}
