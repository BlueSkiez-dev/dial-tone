// Copy for the Sheet content, the Install notice and the app icon (task 4.8).
// "Figma" strings are copied from the Sheet set (270:345), Notice (270:401) and
// the New screens page. "Written" strings are not in Figma.

export type MicSheetReason =
  | "denied"
  | "reset"
  | "busy"
  | "no_device"
  | "insecure"
  | "error"
  | "lost";

export const sheetCopy = {
  /** Figma 270:41, 270:79, 270:127 */
  onboarding1: {
    kicker: "Welcome · 1 / 3",
    title: "Messages that travel as sound",
    body: "Dial Tone turns short text into modem sound. Any phone that hears it decodes it: across a room, through a phone call, or in a voice note.",
    note: "No internet, no accounts, no servers.",
    glassYou: "YOU",
    glassAnyPhone: "ANY PHONE",
    skip: "Skip",
    next: "Next",
  },
  onboarding2: {
    kicker: "Welcome · 2 / 3",
    title: "It listens only while open",
    bodyBefore: "Dial Tone uses the microphone to hear messages, ",
    bodyStrong: "only while this screen is on",
    bodyAfter: ". Nothing is recorded, stored or sent anywhere.",
    note: "Your phone asks for permission when you flip the power switch.",
    glassLed: "AA",
    glassCaption: "SCREEN ON = LISTENING",
    next: "Next",
    /** Written: Figma shows only Skip on Onboarding 1 and Next on 2. */
    back: "Back",
  },
  onboarding3: {
    kicker: "Welcome · 3 / 3",
    title: "Install it before you need it",
    bodyBefore: "Installed, Dial Tone opens with ",
    bodyStrong: "no internet at all",
    bodyAfter: ".",
    back: "Back",
    gotIt: "Got it",
  },
  /** Figma 270:155 for the title, the "send" line and the platform steps. */
  microphone: {
    kicker: "Microphone",
    title: "Microphone is off",
    bodyBefore: "You can still ",
    bodyStrong: "send",
    bodyAfter: ", but you won’t hear messages until the microphone is allowed.",
    iphoneLabel: "iPhone:",
    iphoneStep: " tap ",
    iphoneKey: "aA",
    iphoneRest:
      " in Safari’s address bar › Website Settings › Microphone › Allow.",
    androidLabel: "Android:",
    androidStep:
      " tap the icon left of the address › Permissions › Microphone › Allow.",
    sendOnly: "Send only",
    tryAgain: "Try again",
    /** Figma 270:2 screen 06 (Microphone reset) has its own title and body. */
    resetTitle: "Microphone access was reset",
    resetBody:
      "Your phone forgot the permission. iPhones do this after a while. Allow it again to keep hearing messages.",
    /** Written: the first line for each cause (screens 05 and 06 differ only here). */
    firstLine: {
      denied: "The browser blocked the microphone.",
      reset: "The browser reset the microphone permission.",
      busy: "Another app is using the microphone.",
      no_device: "No microphone was found on this phone.",
      insecure: "The microphone needs a secure (https) page.",
      error: "The microphone could not start.",
      lost: "The microphone stopped working.",
    } satisfies Record<MicSheetReason, string>,
  },
  /** Figma 270:344 */
  install: {
    kicker: "Install",
    title: "Install Dial Tone",
    bodyBefore: "Installed, Dial Tone opens with ",
    bodyStrong: "no internet at all",
    bodyAfter: ".",
    step1: "Open the browser menu (the three dots).",
    step2Before: "Choose ",
    step2Install: "Install app",
    step2Or: " or ",
    step2Add: "Add to Home screen",
    step2After: ".",
    /** Written: iPhone has no menu entry named "Install app". */
    iphone: "iPhone: tap Share, then Add to Home Screen.",
    gotIt: "Got it",
    /** Written: the primary button when the browser gave us an install prompt. */
    installApp: "Install app",
    /** Written: the secondary button when a prompt exists. */
    notNow: "Not now",
  },
  /** Figma 270:401 */
  notice: {
    strong: "Install Dial Tone",
    rest: " so it opens with no internet at all.",
    key: "Install",
  },
  /** Written: accessible names. */
  iconLabel: "Dial Tone app icon",
  noticeLabel: "Install notice",
} as const;
