/**
 * Debug overlay for the CPU measurement (`?cpu=1`, audio-transport task 13.2). Shows the decode
 * worker's report as plain text and logs it to the console. Loaded only when the flag is present.
 * It only reads reports. It cannot affect decoding.
 */

import { CPU_CHANNEL, type CpuReport, formatCpuReport } from "../audio";

/** Returns a function that removes the overlay. */
export function mountCpuOverlay(doc: Document): () => void {
  const box = doc.createElement("pre");
  box.setAttribute("aria-hidden", "true");
  Object.assign(box.style, {
    position: "fixed",
    left: "4px",
    bottom: "4px",
    margin: "0",
    padding: "6px 8px",
    zIndex: "1000",
    font: "11px/1.35 var(--font-mono, monospace)",
    color: "var(--ink-on-glass-strong)",
    background: "var(--glass)",
    pointerEvents: "none",
    whiteSpace: "pre",
  });
  box.textContent = "cpu: waiting for the first report (tap Power)";
  doc.body.append(box);

  const channel = new BroadcastChannel(CPU_CHANNEL);
  channel.onmessage = (e: MessageEvent<CpuReport>) => {
    const text = formatCpuReport(e.data);
    box.textContent = text;
    console.info(`[cpu]\n${text}`);
  };
  return () => {
    channel.close();
    box.remove();
  };
}
