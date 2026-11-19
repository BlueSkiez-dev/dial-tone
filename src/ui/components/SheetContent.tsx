import { AppIcon } from "./AppIcon";
import { Sheet } from "./Sheet";
import { type MicSheetReason, sheetCopy } from "./sheet-copy";

const BASE = import.meta.env.BASE_URL;

/** Onboarding step 1 (Figma 270:41). */
export function Onboarding1(props: { onSkip: () => void; onNext: () => void }) {
  const c = sheetCopy.onboarding1;
  return (
    <Sheet
      type="onboarding-1"
      kicker={c.kicker}
      title={c.title}
      onClose={props.onSkip}
      secondary={{ label: c.skip }}
      primary={{ label: c.next, onClick: props.onNext }}
      step={1}
      art={
        <div class="sheet-art-icon">
          <img
            class="sheet-art-img"
            src={`${BASE}art/sheet-onboarding-1.svg`}
            width={280}
            height={110}
            alt=""
          />
          <span class="sheet-art-label sheet-art-you">{c.glassYou}</span>
          <span class="sheet-art-label sheet-art-any">{c.glassAnyPhone}</span>
        </div>
      }
    >
      <p>{c.body}</p>
      <p class="sheet-strong">{c.note}</p>
    </Sheet>
  );
}

/** Onboarding step 2 (Figma 270:79). Back goes to step 1 and does not close the Sheet. */
export function Onboarding2(props: {
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const c = sheetCopy.onboarding2;
  return (
    <Sheet
      type="onboarding-2"
      kicker={c.kicker}
      title={c.title}
      onClose={props.onClose}
      secondary={{ label: c.back, onClick: props.onBack, closes: false }}
      primary={{ label: c.next, onClick: props.onNext }}
      step={2}
      art={
        <div class="sheet-art-icon">
          <img
            class="sheet-art-img"
            src={`${BASE}art/sheet-onboarding-2.svg`}
            width={280}
            height={110}
            alt=""
          />
          <span class="sheet-art-label sheet-art-led">{c.glassLed}</span>
          <span class="sheet-art-label sheet-art-caption">
            {c.glassCaption}
          </span>
        </div>
      }
    >
      <p>
        {c.bodyBefore}
        <strong>{c.bodyStrong}</strong>
        {c.bodyAfter}
      </p>
      <p>{c.note}</p>
    </Sheet>
  );
}

/** Onboarding step 3 (Figma 270:127). */
export function Onboarding3(props: {
  onBack: () => void;
  onDone: () => void;
  onClose: () => void;
}) {
  const c = sheetCopy.onboarding3;
  const i = sheetCopy.install;
  return (
    <Sheet
      type="onboarding-3"
      kicker={c.kicker}
      title={c.title}
      onClose={props.onClose}
      secondary={{ label: c.back, onClick: props.onBack, closes: false }}
      primary={{ label: c.gotIt, onClick: props.onDone }}
      step={3}
      art={<AppIcon />}
      artPlain
    >
      <p>
        {c.bodyBefore}
        <strong>{c.bodyStrong}</strong>
        {c.bodyAfter}
      </p>
      {/* Figma 270:127 shows the same two steps as the Install sheet. */}
      <ol>
        <li>{i.step1}</li>
        <li>
          {i.step2Before}
          <strong>{i.step2Install}</strong>
          {i.step2Or}
          <strong>{i.step2Add}</strong>
          {i.step2After}
        </li>
      </ol>
    </Sheet>
  );
}

/** Microphone sheet (Figma 270:155). The first line depends on the cause. */
export function MicrophoneSheet(props: {
  reason: MicSheetReason;
  onSendOnly: () => void;
  onTryAgain: () => void;
}) {
  const c = sheetCopy.microphone;
  const reset = props.reason === "reset";
  return (
    <Sheet
      type="microphone"
      kicker={c.kicker}
      title={reset ? c.resetTitle : c.title}
      onClose={props.onSendOnly}
      secondary={{ label: c.sendOnly }}
      primary={{ label: c.tryAgain, onClick: props.onTryAgain }}
    >
      {reset ? (
        <p>{c.resetBody}</p>
      ) : (
        <>
          <p>{c.firstLine[props.reason]}</p>
          <p>
            {c.bodyBefore}
            <strong>{c.bodyStrong}</strong>
            {c.bodyAfter}
          </p>
        </>
      )}
      <p>
        <strong>{c.iphoneLabel}</strong>
        {c.iphoneStep}
        <strong>{c.iphoneKey}</strong>
        {c.iphoneRest}
      </p>
      <p>
        <strong>{c.androidLabel}</strong>
        {c.androidStep}
      </p>
    </Sheet>
  );
}

/**
 * Install sheet (Figma 270:344). With `onInstall` (the browser gave a prompt) the
 * primary button is "Install app" and the secondary is "Not now".
 */
export function InstallSheet(props: {
  onClose: () => void;
  onInstall?: () => void;
}) {
  const c = sheetCopy.install;
  const { onClose, onInstall } = props;
  return (
    <Sheet
      type="install"
      kicker={c.kicker}
      title={c.title}
      onClose={onClose}
      secondary={onInstall ? { label: c.notNow } : undefined}
      primary={
        onInstall
          ? { label: c.installApp, onClick: onInstall }
          : { label: c.gotIt, onClick: onClose }
      }
      art={<AppIcon />}
      artPlain
    >
      <p>
        {c.bodyBefore}
        <strong>{c.bodyStrong}</strong>
        {c.bodyAfter}
      </p>
      <ol>
        <li>{c.step1}</li>
        <li>
          {c.step2Before}
          <strong>{c.step2Install}</strong>
          {c.step2Or}
          <strong>{c.step2Add}</strong>
          {c.step2After}
        </li>
      </ol>
      <p>{c.iphone}</p>
    </Sheet>
  );
}
