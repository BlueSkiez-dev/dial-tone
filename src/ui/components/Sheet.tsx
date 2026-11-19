import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import "./Sheet.css";

export interface SheetButton {
  label: string;
  onClick?: () => void;
  /**
   * Secondary only: also close the Sheet after `onClick`. Default true
   * (requirement 12.9: the secondary button closes the Sheet).
   */
  closes?: boolean;
}

export interface SheetProps {
  /** Small caps line above the title, e.g. "Welcome · 1 / 3". */
  kicker: string;
  title: string;
  /** Body paragraphs and lists. */
  children?: ComponentChildren;
  /** The glass or icon panel between the body and the buttons (Figma 346 x 132). */
  art?: ComponentChildren;
  /** The art is an icon on the plate, with no glass panel (Install, Onboarding 3). */
  artPlain?: boolean;
  /** Light button on the left. */
  secondary?: SheetButton;
  /** Dark button on the right. */
  primary: SheetButton;
  /** Called on Escape and after the secondary button. */
  onClose: () => void;
  /** Page dots under the buttons: the lit step (1 to 3) of 3. Onboarding only (Figma 270:37). */
  step?: 1 | 2 | 3;
  /** Name for the Figma type, used by the Gallery and tests (`data-sheet`). */
  type?: string;
}

/**
 * Next focus index for a Tab key press inside the trap. `current` is -1 when focus
 * is outside the Sheet's own controls. Pure, so the trap is testable without a DOM.
 */
export function nextTrapIndex(
  count: number,
  current: number,
  backwards: boolean,
): number {
  if (count <= 0) return -1;
  if (current < 0) return backwards ? count - 1 : 0;
  if (backwards) return current === 0 ? count - 1 : current - 1;
  return current === count - 1 ? 0 : current + 1;
}

const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]";

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) =>
      !el.hasAttribute("disabled") && el.getAttribute("tabindex") !== "-1",
  );
}

/**
 * Sheet (Figma 270:345): a screwed sub-panel that slides up over a 45% scrim with a 3 px
 * blur. Traps focus, closes on Escape and on the secondary button. The slide is dropped
 * under reduced motion (Sheet.css).
 */
export function Sheet(props: SheetProps) {
  const {
    kicker,
    title,
    children,
    art,
    artPlain,
    secondary,
    primary,
    onClose,
    step,
    type,
  } = props;
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const previous = document.activeElement as HTMLElement | null;
    // Start on the primary button (the last control), as the safest default.
    const items = focusables(el);
    (items[items.length - 1] ?? el).focus();
    return () => {
      if (previous && typeof previous.focus === "function") previous.focus();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeRef.current();
      return;
    }
    if (e.key !== "Tab") return;
    const el = panel.current;
    if (!el) return;
    const items = focusables(el);
    e.preventDefault();
    const next = nextTrapIndex(
      items.length,
      items.indexOf(document.activeElement as HTMLElement),
      e.shiftKey,
    );
    (items[next] ?? el).focus();
  };

  const onSecondary = () => {
    secondary?.onClick?.();
    if (secondary && secondary.closes !== false) onClose();
  };

  return (
    <div class="sheet-layer">
      <div class="sheet-scrim" aria-hidden="true" />
      <div
        ref={panel}
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        data-sheet={type}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <span class="sheet-screw sheet-screw-left" aria-hidden="true" />
        <span class="sheet-screw sheet-screw-right" aria-hidden="true" />
        <span class="sheet-grip" aria-hidden="true" />
        <div
          class="sheet-content"
          data-art={art && !artPlain ? "glass" : art ? "plain" : undefined}
        >
          <p class="sheet-kicker">{kicker}</p>
          <h2 class="sheet-title" id="sheet-title">
            {title}
          </h2>
          {art ? (
            <div class={artPlain ? "sheet-art sheet-art-plain" : "sheet-art"}>
              {art}
            </div>
          ) : null}
          <div class="sheet-body">{children}</div>
          <div class="sheet-buttons" data-count={secondary ? 2 : 1}>
            {secondary ? (
              <button
                type="button"
                class="sheet-button sheet-button-secondary"
                onClick={onSecondary}
              >
                {secondary.label}
              </button>
            ) : null}
            <button
              type="button"
              class="sheet-button sheet-button-primary"
              onClick={() => primary.onClick?.()}
            >
              {primary.label}
            </button>
          </div>
          {step ? (
            <div class="sheet-dots" aria-hidden="true">
              {[1, 2, 3].map((n) => (
                <span key={n} class="sheet-dot" data-on={n === step} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
