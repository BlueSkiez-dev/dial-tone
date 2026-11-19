import { readFileSync } from "node:fs";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { AppIcon } from "./AppIcon";
import { Notice } from "./Notice";
import { nextTrapIndex } from "./Sheet";
import {
  InstallSheet,
  MicrophoneSheet,
  Onboarding1,
  Onboarding2,
  Onboarding3,
} from "./SheetContent";

const noop = () => {};
const read = (f: string) => readFileSync(`src/ui/components/${f}`, "utf8");

describe("Sheet", () => {
  it("renders a labelled modal dialog with grip, two screws and two buttons", () => {
    const html = renderToString(Onboarding1({ onSkip: noop, onNext: noop }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("sheet-grip");
    expect(html.match(/sheet-screw /g)?.length).toBe(2);
    expect(html.match(/<button/g)?.length).toBe(2);
    expect(html).toContain("Welcome · 1 / 3");
  });

  it("renders every content type", () => {
    const pages = [
      renderToString(
        Onboarding2({ onBack: noop, onNext: noop, onClose: noop }),
      ),
      renderToString(
        Onboarding3({ onBack: noop, onDone: noop, onClose: noop }),
      ),
      renderToString(
        MicrophoneSheet({
          reason: "reset",
          onSendOnly: noop,
          onTryAgain: noop,
        }),
      ),
      renderToString(InstallSheet({ onClose: noop })),
    ];
    for (const p of pages) expect(p).toContain("sheet-title");
    expect(pages[2]).toContain("Microphone access was reset");
    expect(pages[2]).toContain("forgot the permission");
  });

  it("shows the native prompt button only when available", () => {
    expect(renderToString(InstallSheet({ onClose: noop }))).not.toContain(
      "Not now",
    );
    const withPrompt = renderToString(
      InstallSheet({ onClose: noop, onInstall: noop }),
    );
    expect(withPrompt).toContain("Install app");
    expect(withPrompt).toContain("Not now");
  });

  it("wraps the focus trap in both directions", () => {
    expect(nextTrapIndex(3, 2, false)).toBe(0);
    expect(nextTrapIndex(3, 0, true)).toBe(2);
    expect(nextTrapIndex(3, 1, false)).toBe(2);
    expect(nextTrapIndex(3, -1, false)).toBe(0);
    expect(nextTrapIndex(0, -1, false)).toBe(-1);
  });

  it("uses the scrim at 45% with a 3 px blur and drops the slide under reduced motion", () => {
    const css = read("Sheet.css");
    expect(css).toMatch(/--scrim-45/);
    expect(css).toMatch(/blur\(3px\)/);
    expect(css).toMatch(
      /prefers-reduced-motion: reduce\)\s*{\s*\.sheet\s*{\s*animation: none/,
    );
  });

  it("uses no red tokens", () => {
    for (const f of [
      "Sheet.css",
      "Notice.css",
      "AppIcon.css",
      "Sheet.tsx",
      "SheetContent.tsx",
    ]) {
      expect(read(f)).not.toMatch(/--sos|--print-sos/);
    }
  });
});

describe("Notice and AppIcon", () => {
  it("renders the Install notice with a key only when given a handler", () => {
    const plain = renderToString(Notice({}));
    expect(plain).toContain("Install Dial Tone");
    expect(plain).not.toContain("notice-key");
    expect(renderToString(Notice({ onKey: noop }))).toContain("notice-key");
  });

  it("sizes the icon 92 px with radius 24", () => {
    expect(renderToString(AppIcon())).toContain('width="92"');
    expect(read("AppIcon.css")).toMatch(/width: 92px/);
    expect(read("AppIcon.css")).toMatch(/--radius-24/);
  });
});
