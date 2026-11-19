import { useEffect, useState } from "preact/hooks";

/** Design parameter (requirement 7.7): how long decoded text resolves out of static. */
export const GHOST_MS = 900;
const STATIC = "░▒▓█▚▞";
const STEP_MS = 60;

/**
 * Pure frame of the resolve. Characters before `progress` (0 to 1) of the text show as
 * themselves, later ones as static. Whitespace stays. `tick` changes the static.
 */
export function ghostFrame(
  text: string,
  progress: number,
  tick: number,
): string {
  const chars = Array.from(text);
  const shown = Math.floor(Math.min(1, Math.max(0, progress)) * chars.length);
  return chars
    .map((c, i) => {
      if (i < shown || /\s/.test(c)) return c;
      return STATIC.charAt((i * 7 + tick * 3) % STATIC.length);
    })
    .join("");
}

function reducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export interface GhostTextProps {
  text: string;
  /** True for a new Heard slip. Without it (or under reduced motion) the text shows at once. */
  active?: boolean;
  durationMs?: number;
}

/** Text that resolves out of static. Always rendered as text, never as HTML. */
export function GhostText(props: GhostTextProps) {
  const { text, active = false, durationMs = GHOST_MS } = props;
  const [elapsed, setElapsed] = useState(0);
  const animate = active && !reducedMotion();
  const done = !animate || elapsed >= durationMs;

  useEffect(() => {
    if (!animate) return;
    const start = performance.now();
    const id = setInterval(() => {
      const e = performance.now() - start;
      setElapsed(e);
      if (e >= durationMs) clearInterval(id);
    }, STEP_MS);
    return () => clearInterval(id);
  }, [animate, durationMs]);

  if (done) return <span class="ghost-text">{text}</span>;
  return (
    <span class="ghost-text" data-resolving="true">
      <span class="ghost-text-real">{text}</span>
      <span aria-hidden="true">
        {ghostFrame(text, elapsed / durationMs, Math.floor(elapsed / STEP_MS))}
      </span>
    </span>
  );
}
