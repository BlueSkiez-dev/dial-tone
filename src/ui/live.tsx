import { useEffect, useReducer, useRef } from "preact/hooks";
import { type PwaHooks, Screen } from "./components/Screen";
import type { Controller } from "./controller";
import type { UiTransport } from "./transport-seam";

export interface LiveAppProps {
  controller: Controller;
  transport: UiTransport;
  /** Hooks for the PWA runtime (task 5.3). */
  pwa?: PwaHooks;
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** The live screen: re-renders whenever the controller notifies. */
export function LiveApp({ controller, transport, pwa }: LiveAppProps) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const state = controller.getState();
  const newest = state.tape[state.tape.length - 1]?.id ?? null;
  const seen = useRef(newest);
  const fresh = useRef<string | null>(null);
  if (newest !== seen.current) {
    seen.current = newest;
    fresh.current = newest;
  }

  useEffect(() => controller.subscribe(() => bump(0)), [controller]);
  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);

  return (
    <Screen
      state={state}
      now={controller.now()}
      actions={controller}
      source={transport.analyser}
      reducedMotion={prefersReducedMotion()}
      freshId={fresh.current}
      pwa={pwa}
    />
  );
}
