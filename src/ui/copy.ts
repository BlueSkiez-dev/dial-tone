// UI strings. Strings marked "Figma" are copied verbatim from the Figma file
// (State 03, node 273:2). Add more here as components are built.

export const copy = {
  /** Figma, node 273:26 */
  deviceTitle: "Dial Tone",
  /** Figma, node 273:29 */
  tagline: "The scream from the dead internet",
  /** Written for this task: accessible names for the three empty reserved slots. */
  slots: {
    groupKey: "Group key (reserved)",
    quickKeys: "Quick messages (reserved)",
    sos: "SOS (reserved)",
  },
  /** Figma State 03 silkscreen captions (273:2): "CHANNEL", "MESSAGE" (design QA 7.1). */
  labels: {
    channel: "Channel",
    message: "Message",
  },
  /** Written for this task: accessible name of the decorative board. */
  circuitBoardLabel: "Circuit board",
  /** Tape and Slip (task 4.7). */
  tape: {
    /** Figma 273:2 and 271:230 empty tape text. */
    empty:
      "No paper yet. Messages you send and hear print here, and anything you hear can be passed on to the next phone.",
    seeMore: "See more",
    showLess: "Show less",
    /** Written for this task. */
    label: "Tape",
  },
  /** Figma State 01 scope tag (271:98). */
  scope: { standby: "Standby" },
  slip: {
    sent: "Sent",
    heard: "Heard",
    /** Figma 213:481, Slip meta and buttons. */
    passedOn: (n: number) => `Passed on ×${n}`,
    hop: (n: number) => `Hop ${n}`,
    passOn: (hop: number) => `Pass it on → hop ${hop}`,
    later: "Later",
    restartNow: "Restart now",
    sos: "*** SOS ***",
    safeStamp: "I’M SAFE",
    locationStamp: "LOCATION",
    systemTitle: (title: string) => `Dial Tone · ${title}`,
    updateTitle: "Dial Tone · Update ready",
    /** Figma 270:462. */
    updateText:
      "A new version is ready. It won’t restart on its own, so no message gets cut off.",
    lockedLabel: (group: string) => `Locked · ${group}`,
    /** Figma 270:540. */
    lockedNoKey:
      "Locked with a group key you don’t have. You can still pass it on; only phones with the key can read it.",
    /** Notice titles and texts by key. "listening-open" is Figma 270:444. The other two are written for this task. */
    notices: {
      "listening-open": {
        title: "Listening while open",
        text: "Dial Tone hears messages only while this screen is on. Keep it open where messages may arrive.",
      },
      unsupported: {
        title: "Cannot show this",
        text: "A message arrived that this version cannot show.",
      },
      "mic-again": {
        title: "Microphone",
        text: "The microphone stopped again. Sending still works.",
      },
      /** Relay spec 5.1: same strings as relay.unreadable and relay.failed. */
      unreadable: {
        title: "Cannot read this",
        text: "Can’t read this message.",
      },
      "relay-failed": {
        title: "Could not pass on",
        text: "The message was not sent. Try again.",
      },
    },
  },
  /** Relay strings (relay spec, task 5.1). Names only Room, Call and Quiet. */
  relay: {
    via: (n: number) => (n === 1 ? "via 1 hop" : `via ${n} hops`),
    passedOn: "Passed on",
    passOnLabel: (hop: number) => `Pass it on, hop ${hop}`,
    endNoHops: "End of the line. This message has no hops left to pass on.",
    endHopLimit: "End of the line. This message has gone as far as it can.",
    endMulti: "Long messages can’t be passed on yet.",
    endKeyOffer: "Group keys can’t be passed on. Join in the same room.",
    unreadable: {
      title: "Cannot read this",
      text: "Can’t read this message.",
      textRelayable: "Can’t read this message. You can still pass it on.",
    },
    failed: {
      title: "Could not pass on",
      text: "The message was not sent. Try again.",
    },
  },
  /** Rocker, status window and light legend (task 4.2). */
  rocker: {
    /** Written for this task. */
    label: "Power",
    /** Figma 213:5, 213:6 */
    on: "I",
    off: "O",
    /** Figma Main 182:41: the silkscreen caption under the rocker, shown uppercase. */
    silk: "Power",
  },
  status: {
    /** Written for this task. */
    lightsLabel: "Status lights. Tap for the light legend.",
    /** Figma, node 285:86 to 285:108: label and meaning. */
    legend: [
      { id: "MR", meaning: "Ready" },
      { id: "AA", meaning: "Listening" },
      { id: "CD", meaning: "Hearing a signal" },
      { id: "OH", meaning: "Call mode" },
      { id: "RD", meaning: "Message received" },
      { id: "SD", meaning: "Sending" },
    ],
    /** Written for this task (Figma shows only "Ready. Listening for messages."). */
    hints: {
      off: "Flip the power switch to start",
      selftest: "Self-test…",
      fault: "Cannot send. Power off and on again.",
      "send-error": "Could not send. Try again.",
      sending: "Sending. Keep this phone near.",
      connect: "Message received.",
      carrier: "Hearing a signal…",
      listening:
        "Ready. Listens only while the app is open and the screen is on.",
      /** Written for this task (requirement 11.5). */
      processing:
        "Listening, but this phone may filter the sound. Signals can be missed.",
      hidden: "Listening stopped. Screen is off.",
      "latch-off": "Not listening. Press Listen to hear messages.",
      /** Figma State 12 (282:2). */
      "no-mic": "Ready to send. Microphone is off, so you can’t hear messages.",
      /** Figma State 11 (281:2). */
      "too-long": "Message is too long to send. Shorten it.",
      /** Figma State 07 (277:2). Gallery only until the SOS spec. */
      "sos-hold": "Keep holding to send SOS…",
    },
  },
} as const;
