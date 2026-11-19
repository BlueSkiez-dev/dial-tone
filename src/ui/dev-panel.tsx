/**
 * Dev-only fake controls. main.tsx imports this file only inside an
 * `import.meta.env.DEV` branch, so it never reaches the production build.
 */
import { useState } from "preact/hooks";
import type { MicState } from "../audio";
import { decodeFrame } from "../protocol";
import type { FakeControls, FakeStartCode } from "./fake-transport";
import { buildWire } from "./model/send";
import "./styles/dev-panel.css";

const MIC_STATES: readonly MicState[] = [
  "live",
  "denied",
  "no_device",
  "busy",
  "insecure",
  "error",
  "lost",
];
const START_CODES: readonly FakeStartCode[] = [
  "MODEM_LOAD_FAILED",
  "NO_AUDIO_CONTEXT",
  "SEND_UNAVAILABLE",
];
const SAMPLE_TEXT = "Road 9 is closed. Use the bridge.";

export function DevPanel({ fake }: { fake: FakeControls }) {
  const [carrier, setCarrier] = useState(false);
  const [fail, setFail] = useState<FakeStartCode | "">("");

  const inject = (ownEcho: boolean) => {
    const built = buildWire(SAMPLE_TEXT);
    if (!built.ok) return;
    const decoded = decodeFrame(built.value.wire);
    if (decoded.ok) fake.injectFrame(decoded.value, ownEcho);
  };

  return (
    <details class="dev-panel">
      <summary>Fake transport (dev only)</summary>
      <div class="dev-panel-row">
        <button type="button" onClick={() => inject(false)}>
          Inject frame
        </button>
        <button
          type="button"
          aria-pressed={carrier}
          onClick={() => {
            fake.injectCarrier(!carrier);
            setCarrier(!carrier);
          }}
        >
          Carrier {carrier ? "off" : "on"}
        </button>
      </div>
      <label class="dev-panel-row">
        Microphone
        <select
          onChange={(e) =>
            fake.setMic(
              (e.currentTarget as HTMLSelectElement).value as MicState,
            )
          }
        >
          {MIC_STATES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label class="dev-panel-row">
        Hold sends (ms)
        <input
          type="number"
          min="0"
          value="0"
          onInput={(e) =>
            fake.holdSend(
              Number((e.currentTarget as HTMLInputElement).value) || 0,
            )
          }
        />
      </label>
      <label class="dev-panel-row">
        Hold sends until released
        <input
          type="checkbox"
          onChange={(e) =>
            fake.holdSendsUntilReleased(
              (e.currentTarget as HTMLInputElement).checked,
            )
          }
        />
      </label>
      <label class="dev-panel-row">
        Fail next start
        <select
          value={fail}
          onChange={(e) => {
            const v = (e.currentTarget as HTMLSelectElement).value;
            const code = START_CODES.find((c) => c === v) ?? null;
            setFail(code ?? "");
            fake.failStart(code);
          }}
        >
          <option value="">none</option>
          {START_CODES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
    </details>
  );
}
