import { readFileSync } from "node:fs";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it, vi } from "vitest";
import type { ProfileId } from "../../audio/index";
import { ChannelModeNote, ChannelSwitch, QuietNotice } from "./ChannelSwitch";

const css = readFileSync("src/ui/styles/channel-switch.css", "utf8");
const CHANNELS: readonly [ProfileId, string][] = [
  ["room", "Room"],
  ["call", "Call"],
  ["quiet", "Quiet"],
];

/** The opening tag of the switch element. */
function switchTag(html: string): string {
  const m = html.match(/<div[^>]*role="radiogroup"[^>]*>/);
  if (!m) throw new Error("no radiogroup");
  return m[0];
}

describe("ChannelSwitch while sending", () => {
  for (const [id, name] of CHANNELS) {
    it(`${name}: aria-disabled, focusable, named`, () => {
      const html = renderToString(
        h(ChannelSwitch, { value: id, disabled: true }),
      );
      const tag = switchTag(html);
      expect(tag).toContain('aria-disabled="true"');
      expect(tag).not.toMatch(/\sdisabled(=|\s|>)/);
      expect(html).not.toContain('tabindex="-1"');
      expect(html).not.toContain('tabIndex="-1"');
      expect(tag).toMatch(/tabindex="0"/i);
      expect(tag).toContain(
        `aria-label="Channel switch, ${name}, unavailable while sending"`,
      );
    });
  }

  it("ignores pointer and keyboard input", () => {
    const onChange = vi.fn();
    const vnode = ChannelSwitch({ value: "room", disabled: true, onChange });
    const props = vnode?.props as {
      onKeyDown: (e: unknown) => void;
      children: unknown[];
    };
    const preventDefault = vi.fn();
    props.onKeyDown({ key: "ArrowRight", preventDefault });
    expect(onChange).not.toHaveBeenCalled();
    const options =
      (props.children as { props: { onClick?: () => void } }[][])[1] ?? [];
    for (const o of options) o.props.onClick?.();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("ChannelSwitch when idle", () => {
  it("has no aria-disabled", () => {
    for (const [id] of CHANNELS) {
      const html = renderToString(h(ChannelSwitch, { value: id }));
      expect(html).not.toContain("aria-disabled");
      expect(switchTag(html)).toContain('aria-label="Channel switch"');
    }
  });

  it("shows the Figma captions and no Radio position", () => {
    const html = renderToString(h(ChannelSwitch, { value: "room" }));
    for (const s of [
      "Room",
      "Speaker to mic",
      "Call",
      "Phone line",
      "Quiet",
      "Near-silent",
    ]) {
      expect(html).toContain(s);
    }
    expect(html).not.toMatch(/radio mode/i);
    expect(html.match(/role="radio"(?!group)/g)).toHaveLength(3);
    expect(html).toContain('aria-checked="true"');
  });

  it("arrow keys move one step and stop at the ends", () => {
    const run = (value: ProfileId, key: string) => {
      const onChange = vi.fn();
      const props = ChannelSwitch({ value, onChange })?.props as {
        onKeyDown: (e: unknown) => void;
      };
      props.onKeyDown({ key, preventDefault: () => {} });
      return onChange.mock.calls[0]?.[0];
    };
    expect(run("room", "ArrowRight")).toBe("call");
    expect(run("call", "ArrowRight")).toBe("quiet");
    expect(run("quiet", "ArrowLeft")).toBe("call");
    expect(run("room", "ArrowLeft")).toBeUndefined();
    expect(run("quiet", "ArrowRight")).toBeUndefined();
  });
});

describe("mode note and Quiet notice", () => {
  it("describes how this phone sends and never claims to select what it hears", () => {
    for (const [id] of CHANNELS) {
      const html = renderToString(h(ChannelModeNote, { value: id }));
      expect(html).not.toMatch(/listen|hear(s|ing)? (on|with|through)/i);
    }
  });

  it("the Quiet notice is amber with the measured band and no red", () => {
    const html = renderToString(h(QuietNotice, {}));
    expect(html).toContain("older phones");
    expect(html).toContain("15\u201319.4 kHz");
    expect(html).toContain("quiet-notice-led");
    expect(html).not.toMatch(/sos|red/i);
    expect(css).toMatch(/\.quiet-notice-led\s*{[^}]*var\(--amber\)/);
  });

  it("the CSS uses no hex colour, no red token, and drops the spring under reduced motion", () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(css).not.toMatch(/--sos|--print-sos/);
    expect(css).toMatch(
      /prefers-reduced-motion: reduce\)\s*{\s*\.channel-thumb\s*{\s*transition: none/,
    );
  });
});
