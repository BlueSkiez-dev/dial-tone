import { readFileSync } from "node:fs";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it, vi } from "vitest";
import { initialState } from "../model/reducer";
import { listenState } from "../model/status";
import { ListenLatch } from "./ListenLatch";
import { clampProgress, TransmitKey, transmitSubLabel } from "./TransmitKey";

const keyCss = readFileSync("src/ui/styles/transmit-key.css", "utf8");

function click(vnode: unknown) {
  // Function components return a button vnode; call its onClick directly.
  const v = vnode as { props: { onClick: () => void } };
  v.props.onClick();
}

describe("TransmitKey", () => {
  it("shows the ATDT sub-label with the airtime, or a dash while unknown", () => {
    expect(transmitSubLabel(2200)).toBe("ATDT · 2.2 s");
    expect(transmitSubLabel(null)).toBe("ATDT · —");
    const html = renderToString(
      TransmitKey({ state: "default", airtimeMs: 2200 }),
    );
    expect(html).toContain("ATDT · 2.2 s");
    expect(html).toContain("Transmit");
  });

  it("sending keeps the label lit and fills the strip by progress", () => {
    const html = renderToString(
      TransmitKey({ state: "sending", airtimeMs: 2200, progress: 0.5 }),
    );
    expect(html).toContain("Sending");
    expect(html).toContain("width:50.0%");
    expect(html).not.toContain("disabled");
    expect(keyCss).not.toMatch(/data-state="sending"[^{]*{[^}]*opacity/);
  });

  it("clamps progress and ignores it outside sending", () => {
    expect(clampProgress(2)).toBe(1);
    expect(clampProgress(-1)).toBe(0);
    expect(clampProgress(Number.NaN)).toBe(0);
    const html = renderToString(
      TransmitKey({ state: "default", airtimeMs: 1000, progress: 0.9 }),
    );
    expect(html).toContain("width:0.0%");
  });

  it("disabled renders a disabled button and ignores taps", () => {
    const onTap = vi.fn();
    const props = { state: "disabled", airtimeMs: null, onTap } as const;
    expect(renderToString(TransmitKey(props))).toContain("disabled");
    click(TransmitKey(props));
    expect(onTap).not.toHaveBeenCalled();
  });

  it("default tap calls onTap", () => {
    const onTap = vi.fn();
    click(TransmitKey({ state: "default", airtimeMs: 1000, onTap }));
    expect(onTap).toHaveBeenCalledOnce();
  });

  it("flash shows BUSY look only on the default key", () => {
    const flash = renderToString(
      TransmitKey({ state: "default", airtimeMs: 1000, flash: true }),
    );
    expect(flash).toContain('data-flash="true"');
    expect(flash).toContain("Busy");
    for (const state of ["sending", "disabled"] as const) {
      const html = renderToString(
        TransmitKey({ state, airtimeMs: 1000, flash: true }),
      );
      expect(html).not.toContain("data-flash");
      expect(html).not.toContain("Busy");
    }
  });

  it("uses no red token or hex literal", () => {
    expect(keyCss).not.toMatch(/--sos|--print-sos/);
    expect(keyCss.replace(/rgba\([^)]*\)/g, "")).not.toMatch(
      /#[0-9a-f]{3,8}\b/i,
    );
  });
});

describe("ListenLatch", () => {
  it("renders each state's text and pressed flag", () => {
    const text = {
      listening: "Listening",
      off: "Listen",
      "no-mic": "No mic",
      disabled: "Listen",
    } as const;
    for (const state of Object.keys(text) as (keyof typeof text)[]) {
      const html = renderToString(ListenLatch({ state }));
      expect(html).toContain(`data-state="${state}"`);
      expect(html).toContain(`>${text[state]}<`);
      expect(html).toContain(`aria-pressed="${state === "listening"}"`);
    }
  });

  it("ignores taps when disabled or no mic, accepts them otherwise", () => {
    for (const [state, expected] of [
      ["disabled", 0],
      ["no-mic", 0],
      ["off", 1],
      ["listening", 1],
    ] as const) {
      const onTap = vi.fn();
      const root = ListenLatch({ state, onTap }) as unknown as {
        props: { children: unknown[] };
      };
      click(root.props.children[1]);
      expect(onTap).toHaveBeenCalledTimes(expected);
    }
  });

  it("marks disabled and no-mic as aria-disabled", () => {
    expect(renderToString(ListenLatch({ state: "no-mic" }))).toContain(
      'aria-disabled="true"',
    );
    expect(renderToString(ListenLatch({ state: "off" }))).not.toContain(
      "aria-disabled",
    );
  });

  it("stays Listening while the page is hidden (the state carries no visibility)", () => {
    const hidden = {
      ...initialState(null),
      power: "on",
      mic: "live",
      latchPressed: true,
      foreground: false,
    } as const;
    const html = renderToString(ListenLatch({ state: listenState(hidden) }));
    expect(html).toContain("Listening");
  });
});
