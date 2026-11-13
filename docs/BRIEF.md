# DIAL TONE — Concept Brief (locked)

> **Dial-up is back, and it can't be shut down.**
> A messenger that turns text into modem screech, so messages travel over anything that carries sound. Verified on real phones: speaker to mic, a phone call, a voice note. Not yet tested: walkie-talkies and radio, so we don't claim them.

| | |
|---|---|
| Category | **Resurrection** (dead tech: the dial-up modem / acoustic coupler) |
| Prizes to target | Overall 1st–3rd **or** Best Resurrection (a project can win only one of these), **plus** Best Demo, Best Kiro Crew App, Bonus Blog, Social Blitz. (Not eligible for Ghost of Kiroween Past: you didn't register for 2025.) |
| Deadline | **Fri Dec 4, 2026, 2:00 PM PT (11:00 PM GMT+1).** No extensions. Submit by Dec 3. |
| Credits | Request 4,000 Kiro credits via the Credit Request Form **now** (cut-off Dec 1, 12:00 PM PT; allow 48 business hours) |
| Team | Up to 3 people. Only new work counted: everything is built Oct 30 – Dec 4, and pre-existing code (e.g. ggwave) must be disclosed |

---

## 1. How we'll be judged (2026: five criteria, 20% each)

Stage 1 is pass/fail: does the project fit the theme and properly use Kiro? Stage 2 scores five equal criteria. Judging may include automated AI analysis, so the README and write-up must be explicit and well structured.

| Criterion | What they ask | Our answer |
|---|---|---|
| **Potential Impact** | A real problem for a real audience? Would someone actually use it? | ~300 shutdowns a year plus disasters. No new hardware, works in a browser, offline PWA. Persona-led demo. |
| **Technological Implementation** | Variety and depth of Kiro tools, a thoughtful AI strategy, experimentation | Specs, hooks, steering, **custom agents**, a **custom power**, a custom MCP server, **property-based testing**, Kiro CLI in CI, and a **Kiro Crew app**. See §5. |
| **Design** | A complete, coherent product, not a proof of concept | The designer's home turf: an instrument-grade UI with full flows (onboarding → key share → send → relay → SOS) |
| **Innovation/Idea** | Novel, different from existing concepts; unusual tech or public datasets | Data-over-sound as a *network* (relay + encryption + channel profiles). Uses Access Now's public #KeepItOn / STOP shutdown dataset for the problem story. |
| **Presentation** | End-to-end working demo; clear problem / audience / why; creative and memorable | The screech moment, a real relay across a phone call and a voice note, and a tight 3-minute story. Also competes for **Best Demo** (highest Presentation score within the top 10% overall). |

## 2. The story

When the internet goes down, sound still gets through.

- About 300 government internet shutdowns happen every year (Access Now, #KeepItOn). Protests, elections and exams are the usual triggers.
- Hurricanes, earthquakes and wildfires knock out cell data first. Voice calls, walkie-talkies and FM radio usually keep working.
- In 1996, a modem screamed into a phone line to connect you to the world. Dial Tone brings that scream back as a lifeline.

**Demo persona: Amara, a volunteer coordinator after a hurricane.** Mobile data is down, but ordinary phone calls still connect. She has to tell three shelters where the water truck is going. She types the message, calls Shelter B, and lets her phone screech into the call. Shelter B's phone decodes it, *replays it* aloud to every phone in the room, and records a voice note to forward to Shelter C.

*Every channel in this story was verified on real phones on Nov 13: room, mobile call, voice note. Walkie-talkies are a stretch goal, and only go in the video if we test them on real radios.*

## 3. Scope: three weeks

### Must have (the demo depends on these)
1. **Send / Receive.** Type up to ~100 bytes of text, tap, and it screeches. Any device in earshot decodes it live. Built on `ggwave` (MIT, WASM, Reed-Solomon error correction, 8–16 bytes/sec). Disclose it and credit it.
2. **The Screech, visualized.** A live spectrogram and waveform. A handshake animation, plus decode progress shown byte by byte as characters "resolve" out of noise.
3. **Relay ("pass it on").** One-tap re-broadcast with a hop count (`📡 hop 2 · via Shelter B`). Message IDs prevent duplicates, and a TTL limits how far messages spread.
4. **End-to-end encryption.** Share a group key by QR code or a short "key screech". Relays can't read what they forward.
5. **Channel modes.** *Room* (audible · fastest, ~1.5 s), *Call* (dual-tone · fastest, ~3 s; ✅ verified on a real mobile call), *Quiet* (ultrasound, short range). *Radio* uses the same dual-tone profile as Call, but stays unadvertised until we test real radios.
6. **Installable PWA** that works fully offline once loaded. This is the "device it was built for": phones and laptops.

### Should have
- Message types: location pin, "I'm safe" check-in, SOS with a distinctive repeating screech
- Tape mode: export the screech as a .wav or voice note to forward through any messaging app (✅ voice notes verified on real phones)
- Multi-frame messages for longer text, with re-requests for missing frames

### Won't have (say it out loud, because it shows judgment)
- Photos or files (8–16 bytes/sec makes that dishonest)
- Accounts or servers. It's local-first by design.
- A native iOS or Android app (see the platform decision below)

### Platform decision: a PWA, not a native app (decided Nov 13)
**Decision:** Dial Tone ships as one installable, offline-first PWA. No native app and no app store build during the hackathon.

**Why:**
- **Judges can test it in seconds.** A link opens on any phone. A native build needs App Store or TestFlight review (too risky by Dec 4) or a sideloaded Android file that iPhone judges can't install.
- **The best demo moment is two judges' own phones.** Only a link makes that easy.
- **It's already proven.** The field tests passed on real phones using browser audio and ggwave's WebAssembly build (room, mobile call, voice note). A native rewrite would discard proven work.
- **It fits the story.** Once installed, it runs with no network, which is the internet-shutdown promise.
- **Kiro is judged on how we use Kiro,** not on the platform. Going native earns nothing there.

**Constraints every spec and task must respect:**
- **HTTPS only.** The microphone and the service worker need a secure origin.
- **A tap starts audio.** Browsers block sound and the microphone until the user taps. The power switch is that tap.
- **Listening works only in the foreground.** It stops when the screen locks or the app goes to the background, on iOS especially. The UI must say so plainly rather than imply it listens all the time.
- **Microphone permission can reset.** On iOS in particular, the app may have to ask again in a later session.
- **Microphone processing must be off.** Echo cancellation, noise suppression and auto gain control have to be disabled, or they damage the signal.
- **Some phones can't hear Quiet mode.** Ultrasound support varies by device, so Quiet must show a fallback hint.
- **No network calls at runtime.** This is enforced by the offline-guard hook.

**Later, not now:** wrap the same code as an Android app (for example with Capacitor) for background listening. It's a stretch goal only if everything else is finished, and it would be stated as future work in the submission.

### Bonus deliverable: the Kiro Crew app (separate repo, competes for Best Kiro Crew App, $1k)
**"Dial Tone Base Station":** a Crew app that turns an always-on laptop at a shelter into a relay and logbook.
- Backend process: listens on the mic, decodes, and automatically relays according to the rules
- Cron job: broadcasts scheduled bulletins ("check-in at :00", weather alerts)
- Dashboard page: a live log of everything heard, with hop paths
- Agent and skill: summarizes the last hour of traffic ("3 safe check-ins, 1 SOS at Shelter C")
- Packaged with `app.json`; built UI committed to `ui/dist/`

## 4. The 3-minute video (beats)

**Rules to respect:** under 3:00, public on YouTube, shows the app running on real phones and laptops, **no copyrighted music or third-party trademarks.** We synthesize our own handshake sound (our modem's actual audio). No radio, phone or messaging-app logos on screen.

| Time | Beat |
|---|---|
| 0:00–0:15 | Black screen, our own synthesized modem handshake. Title: "This sound connected the world." |
| 0:15–0:40 | The problem: a shutdown map built from the public #KeepItOn data, disaster footage we made ourselves, "No internet connection" on a phone |
| 0:40–1:30 | **The moment:** a phone screeches, another across the room decodes it. Then the relay: Amara calls Shelter B and the message screeches through the call (hop 1). B's phone replays it to the room (hop 2) and forwards it as a voice note to C (hop 3), with the hop count rising. Walkie-talkies only if tested on real radios. |
| 1:30–2:00 | Encryption: a relay phone shows only "🔒 sealed message, passing it on". The Base Station dashboard logs it. |
| 2:00–2:40 | How Kiro built it: specs → PBT finding a real bug → the Ears MCP grading field recordings → custom agents → the Crew app |
| 2:40–3:00 | Close: "Dial Tone. The internet can be switched off. Sound can't." with a link to try it in two tabs |

## 5. Kiro plan: built like a "frontier team" of one

Kiro publishes its own playbook for using it well: [frontier teams](https://kiro.dev/topics/frontier-teams/) and [frontier engineering](https://kiro.dev/topics/frontier-engineering). Its core idea is that you stop typing the software and **build the agent setup that builds the software.** The judges are Kiro people, so we follow that playbook visibly, use its vocabulary, and measure results the way it does.

**Your role: architect and art director, not typist.** You decide intent, design and quality. Agents do the execution.

### The five frontier practices, applied

| Practice (Kiro's words) | What we do on Dial Tone | Evidence for the write-up |
|---|---|---|
| **Invest in agent context** | Steering before any feature code: `product.md`, `tech.md`, `byte-budget.md`, `design-system.md`, plus **`field-findings.md`, which turns the spike into rules** (dual-tone for calls; decoding depends on alignment; noise is measured against the transmit level, after the noise-model bug). Connect the **Figma MCP** so Kiro builds screens from your real designs. | The steering files, and a "rule added because the agent got X wrong" changelog |
| **Slow down to speed up** | Days 1–2 are setup only: steering, specs, hooks, the Ears MCP, the test harness. No features. | Commits per day and tasks per day, before vs after setup (a chart in the write-up) |
| **Feed agents, don't babysit** | Specs produce a backlog of small, well-scoped tasks. Agents run them in parallel (main app and Crew app) and the **CLI runs task lists overnight**. You review in the morning; you can even review from Kiro Mobile while out field testing. | Overnight run logs, number of tasks completed autonomously |
| **Make intent explicit** | One spec per feature, with EARS acceptance criteria: `frame-protocol`, `relay`, `crypto`, `channel-modes`, `ui-flows`, `base-station`. Fix vague requirements before building. | The specs, linked from the commits that implement them |
| **Shift testing left** | Agents verify their own work. **PBT** turns requirements into hundreds of random cases. The **Ears MCP** lets an agent encode, push audio through a simulated channel, decode, and fix things by itself. Hooks run checks on save. | At least one real bug found by PBT, test counts, Ears runs |

### The tools, each with a real job (variety the judges can see)
- **Specs:** the six above. Requirements → design → tasks, kept in sync as the code changes.
- **Property-based testing** (the rules ask about it explicitly):
  - Round trip: `decode(encode(m)) == m` under every channel profile
  - Relay: re-broadcasting is idempotent, the hop count only goes up, TTL always ends propagation
  - Crypto: messages open with the right key, and fail with any other key
  - Decoding works at every frame alignment (straight from the spike's Opus finding)
- **Steering:** the five files above. Treated as a living document: every repeated agent mistake becomes a new rule.
- **Hooks as guardrails** ("trust the boundaries, not the agent"):
  - On save in `/protocol`: run the PBT suite
  - **Offline guard:** fail if any code adds a network call (Dial Tone has to work with no internet)
  - **Byte-budget check:** fail if the frame header grows without a size reason in the spec
  - On save of UI files: accessibility/contrast check against design-system tokens
  - On task completion: add an entry to `docs/kiro-journal.md`, so agents document themselves as raw material for the write-up
- **Custom MCP "Ears":** `decode_wav`, `measure_ber`, `simulate_channel(profile)`. Gives Kiro ears, which is the fast feedback loop.
- **Custom power "acoustic-modem":** Ears plus skills (FSK, Reed-Solomon, Web Audio pitfalls), activated by "modem", "audio", "decode". Published for others to use.
- **Custom agents:** *Protocol Engineer* (specs + PBT), *Field Tester* (runs Ears on recordings, files issues), *Design QA* (compares built screens with Figma through MCP screenshots)
- **CLI:** runs PBT headless in GitHub Actions on every push, plus overnight task runs
- **Web:** works on the Crew app repo in parallel, and opens PRs you review
- **Crew:** the Base Station app (§3)
- **"Use agents for everything":** agents also draft the README, protocol docs, the first draft of the write-up, and the video's on-screen text. You edit for voice; the rules penalize AI-sounding social posts.

### Treat code as disposable
The spike was deliberately thrown away. We kept the *knowledge* (in `field-findings.md`) and rebuild the app from specs in Kiro. That's a principle straight from the playbook, and a good story for the write-up.

### Measure it like they do
Their pages report measured multipliers: commits per developer, share of code hand-written, throughput. We'll track ours honestly in a "Frontier scorecard" for the write-up:
- Commits per day before and after setup · % of code written by hand (aim for under 5%)
- Spec tasks done autonomously vs with help · overnight runs
- PBT cases run and bugs caught · steering rules added (and why)
- A self-assessment against their "still experimenting → frontier-ready" table

## 6. Design direction

**Approved direction (Nov 13): "Ghost in the Line."** The app is a physical modem rendered with hardware-grade realism. This replaces the earlier dark "phosphor black" idea.

- **Source of truth:** the Figma file "Dial Tone" frame (390 px phone width), captured from the approved prototype at https://blueskiez-dev.github.io/dial-tone-prototype/ (repo BlueSkiez-dev/dial-tone-prototype). The prototype is a design reference only. The app is rebuilt from specs, and Figma is read through the Figma MCP.
- **Material:** a frosted, see-through "ghost" shell with the circuit board visible through it. Inside is a light, screwed-down faceplate with grain texture and raised lettering. A beige 1996 variant exists as a token swap.
- **Parts, each with a real job:**
  - a smoked-glass status window with six domed LEDs (MR, AA, CD, OH, RD, SD) and a modem result-code readout (OK, RING, CARRIER, CONNECT, NO CARRIER, ATDT)
  - a rocker power switch, which is the tap that starts audio
  - a CRT scope behind curved glass
  - a ridged three-way slide switch (Room, Call, Quiet)
  - a recessed message well with a 24-segment byte meter and real airtime
  - a Transmit keycap
  - a hold-to-send SOS button with a progress ring
  - a thermal-printer Tape showing the three latest slips, with See more
  - a raised signal line on the faceplate that pulses up when sending and down when receiving
- **Palette:** light faceplate greys; phosphor green (#7dffb2) inside the glass only; green and amber LEDs; red (#d9301f) reserved for SOS only
- **Type:** Barlow Condensed for silkscreen labels, IBM Plex Sans for body text, IBM Plex Mono for data and the Tape. All are open-licensed fonts and must be bundled locally (no remote fonts).
- **Motion:**
  - power-on self-test, with an LED sweep and a CRT warm-up
  - the slide switch springs between positions
  - slips print line by line
  - reduced-motion is respected
- **Signature visual:** the scope, with decoded text resolving out of static (the "ghost moment"). Each message leaves a unique "voiceprint" you can save and share (good for the Social Blitz post).
- **Halloween:** "the scream from the dead internet." Keep it in the copy and sound design, and keep the UI usable.
- **Accessibility:** every sound event also has a visual and haptic cue. Large tap targets for use under stress.

## 7. Risks and how we'll handle them

| Risk | Mitigation |
|---|---|
| ggwave's audible band (~1.9–6.4 kHz) goes past phone-call and radio bandwidth (300–3400 Hz) | **Resolved (Nov 13).** Simulation: **dual-tone (DT)** passed every narrowband channel. Field test: room, mobile call and voice note all worked on real phones. Not tested: walkie-talkie, internet call. |
| Voice-note codecs (Opus/AMR) mangle tones | **Resolved in the field test:** voice notes worked. Simulation still shows decoding depends on frame alignment, so run several offset decoders in parallel for robustness. |
| Walkie-talkie story is unverified | Leave it out of the video unless tested. A cheap pair of PMR446/FRS radios (about $20–30) would make it testable before Nov 28. |
| "Isn't this just ggwave?" (Innovation score) | ggwave is the modem. Dial Tone is the network: relay, encryption, channel profiles, Base Station, the experience. Disclose it and credit it. |
| Noisy demo environment | Record the hero video in a controlled room, and offer a "two tabs on one machine" test path for judges |
| Judges may not test it | The video and README must stand alone. Judges can score from the video and text alone. |

## 8. Plan to Dec 4

- **Nov 12–13:** ✅ channel spike + field test (room, call, voice note verified)
- **Nov 14–15 ("slow down"):** request credits · repo in Kiro · steering (with field findings) · specs · hooks · Ears MCP · test harness. **You, in parallel:** design system + key screens in Figma.
- **Nov 16–22 ("speed up"):** agents build from the task backlog, overnight CLI runs, morning reviews: send/receive + spectrogram, relay, encryption, PBT, Figma-to-screens
- **Nov 23–28:** PWA polish · message types · custom power + agents · Crew Base Station app (in parallel through Web) · CLI in CI · collect scorecard numbers
- **Nov 29–Dec 2:** record the video · README · Kiro write-up · blog post · social post
- **Dec 3:** submit (a day of buffer)

## 9. Submission checklist (2026 rules)

- [ ] **Public GitHub** repo (not GitLab or Bitbucket) with all source, assets and setup instructions
- [ ] OSI license file (MIT) **visible in the repo's About section**
- [ ] `/.kiro` committed at the root (specs, hooks, steering, agents), **not** in .gitignore
- [ ] Pre-existing code disclosed (ggwave, libsodium, etc.)
- [ ] Live URL to the working PWA, with judge test instructions in the private form field
- [ ] Text description of features and functionality
- [ ] Video under 3:00, public on YouTube, running on real devices, no copyrighted music or trademarks
- [ ] Kiro write-up covering IDE/CLI/Crew, custom agents, hooks, specs, steering, MCP, PBT, powers
- [ ] Category: **Resurrection**, plus bonus selections
- [ ] **Kiro Crew app**: separate public GitHub repo (same account), with a features write-up
- [ ] **Blog post** on a third-party platform. Safest is dev.to/kirodotdev with #kiro. It must say it's written for the Kiroween 2026 hackathon and differ substantially from the Devpost text.
- [ ] **Social post** that **starts with** `#KiroweenHackathon26`, tags @kirodotdev, also uses #hookedonkiro, and says what you like about Kiro and how it changed your approach. Original writing, with a good visual (the spectrogram voiceprint).
