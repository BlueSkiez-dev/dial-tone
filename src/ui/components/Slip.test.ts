import { readFileSync } from "node:fs";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it, vi } from "vitest";
import type { GallerySlip, Slip as SlipModel } from "../model/tape";
import { GhostText, ghostFrame } from "./GhostText";
import { Slip } from "./Slip";
import { PassOn, SlipButton } from "./slip-parts";
import { Tape } from "./Tape";

const read = (f: string) => readFileSync(`src/ui/components/${f}`, "utf8");

const sent = (id: string, text = "hello"): SlipModel => ({
  kind: "sent",
  id,
  at: 0,
  text,
  bytes: 5,
  mode: "room",
  airtimeMs: 1000,
});
const heard = (id: string, text = "hi"): SlipModel => ({
  kind: "heard",
  id,
  at: 0,
  text,
  bytes: 2,
  hop: 1,
});

describe("Slip", () => {
  it("escapes markup in text and uses no innerHTML", () => {
    const evil = "<script>alert(1)</script> & more";
    for (const slip of [sent("a", evil), heard("b", evil)]) {
      const html = renderToString(h(Slip, { slip }));
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script>");
      expect(html).toContain("&amp; more");
    }
    for (const f of ["Slip.tsx", "GhostText.tsx", "Tape.tsx", "SosSlip.tsx"]) {
      expect(read(f)).not.toMatch(/innerHTML|dangerouslySetInnerHTML/);
    }
  });

  it("renders all ten types", () => {
    const g = (kind: GallerySlip["kind"]): GallerySlip => ({
      kind,
      id: kind,
      at: 0,
      text: "t",
      hop: 2,
    });
    const slips: (SlipModel | GallerySlip)[] = [
      sent("1"),
      heard("2"),
      g("relayed"),
      g("sos"),
      { kind: "system", id: "3", at: 0, noticeKey: "unsupported" },
      { kind: "update-ready", id: "4", at: 0 },
      g("locked"),
      g("locked-no-key"),
      g("location"),
      g("safe"),
    ];
    const kinds = slips.map((slip) => {
      const html = renderToString(h(Slip, { slip }));
      return html.match(/data-kind="([\w-]+)"/)?.[1];
    });
    expect(new Set(kinds).size).toBe(10);
  });

  it("shows Pass it on on a Heard slip only for an action view", () => {
    const slip = heard("1");
    expect(renderToString(h(Slip, { slip }))).not.toContain("Pass it on");
    expect(
      renderToString(
        h(Slip, { slip, relay: { kind: "action", hop: 2, disabled: false } }),
      ),
    ).toContain("Pass it on → hop 2");
  });

  it("shows the via text in place of Hop n", () => {
    const at = (hop: number) =>
      renderToString(h(Slip, { slip: { ...heard("v"), hop } }));
    expect(at(0)).not.toMatch(/via|Hop/i);
    expect(at(1)).toContain("via 1 hop<");
    expect(at(3)).toContain("via 3 hops");
    expect(at(3)).not.toContain("Hop 3");
  });

  it("shows Passed on and no button for a passed view", () => {
    const html = renderToString(
      h(Slip, { slip: heard("p"), relay: { kind: "passed" } }),
    );
    expect(html).toContain("Passed on");
    expect(html).not.toContain("<button");
  });

  it("shows the reason line for each reason and no button", () => {
    const lines = {
      "no-hops": "End of the line. This message has no hops left",
      "hop-limit": "End of the line. This message has gone as far",
      restart: "Can’t be passed on after the app restarts.",
      multi: "Long messages can’t be passed on yet.",
      "key-offer": "Group keys can’t be passed on.",
    } as const;
    for (const [key, line] of Object.entries(lines)) {
      const html = renderToString(
        h(Slip, {
          slip: heard("r"),
          relay: { kind: "reason", key: key as keyof typeof lines },
        }),
      );
      expect(html).toContain(line);
      expect(html).not.toContain("<button");
    }
  });

  it("renders the action with its hop, enabled or disabled", () => {
    const on = renderToString(
      h(Slip, {
        slip: heard("a"),
        relay: { kind: "action", hop: 2, disabled: false },
      }),
    );
    expect(on).toContain("Pass it on → hop 2");
    expect(on).not.toMatch(/<button[^>]*disabled/);
    const off = renderToString(
      h(Slip, {
        slip: heard("a"),
        relay: { kind: "action", hop: 2, disabled: true },
      }),
    );
    expect(off).toContain("Pass it on → hop 2");
    expect(off).toMatch(/<button[^>]*disabled/);
  });

  it("renders no relay part for a none view", () => {
    const html = renderToString(
      h(Slip, { slip: heard("n"), relay: { kind: "none" } }),
    );
    expect(html).not.toContain("Pass it on");
    expect(html).not.toContain("Passed on");
  });

  it("renders the unreadable System slip in both text forms", () => {
    const slip: SlipModel = {
      kind: "system",
      id: "u1",
      at: 0,
      noticeKey: "unreadable",
    };
    const act = renderToString(
      h(Slip, {
        slip,
        relay: { kind: "action", hop: 1, disabled: false },
      }),
    );
    expect(act).toContain("Can’t read this message. You can still pass it on.");
    expect(act).toContain("Pass it on → hop 1");
    const end = renderToString(
      h(Slip, { slip, relay: { kind: "reason", key: "multi" } }),
    );
    expect(end).toContain("Can’t read this message.");
    expect(end).not.toContain("You can still pass it on");
    expect(end).toContain("Long messages can’t be passed on yet.");
  });

  it("Update ready has Later and Restart now", () => {
    const html = renderToString(
      h(Slip, { slip: { kind: "update-ready", id: "u", at: 0 } }),
    );
    expect(html).toContain("Later");
    expect(html).toContain("Restart now");
  });

  it("draws the Update ready buttons filled, never as an outline alone (21.28)", () => {
    const html = renderToString(
      h(Slip, { slip: { kind: "update-ready", id: "u", at: 0 } }),
    );
    expect(html).toMatch(
      /class="slip-button slip-button-filled slip-button-later"[^>]*>Later</,
    );
    expect(html).toMatch(
      /class="slip-button slip-button-filled slip-button-restart"[^>]*>Restart now</,
    );
    // Pass it on keeps the Figma outline on white paper.
    const pass = renderToString(
      h(Slip, {
        slip: heard("p"),
        relay: { kind: "action", hop: 2, disabled: false },
      }),
    );
    expect(pass).toContain('class="slip-button"');
    expect(pass).not.toContain("slip-button-filled");
  });

  it("keeps red Tokens in the SOS slip files only", () => {
    const red = /--sos|--print-sos|--ink-on-sos/;
    expect(read("Slip.css")).not.toMatch(red);
    expect(read("Tape.css")).not.toMatch(red);
    expect(read("Slip.tsx")).not.toMatch(red);
    expect(read("SosSlip.css")).toMatch(/--print-sos/);
    const sos = renderToString(
      h(Slip, { slip: { kind: "sos", id: "s", at: 0, text: "help" } }),
    );
    expect(sos).toContain("*** SOS ***");
  });

  it("uses no hex colour and drops printing under reduced motion", () => {
    const css = read("Slip.css") + read("Tape.css") + read("SosSlip.css");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none/);
  });
});

describe("Pass it on button (relay 4.9, 4.11)", () => {
  type ButtonVNode = {
    type: unknown;
    props: Record<string, unknown> & { onClick: () => void };
  };
  /** The rendered <button> vnode of PassOn, without a DOM. */
  const button = (hop: number, onTap?: () => void, disabled = false) => {
    const wrap = PassOn({ hop, onTap, disabled }) as unknown as {
      props: { children: { type: unknown; props: object } };
    };
    expect(wrap.props.children.type).toBe(SlipButton);
    return SlipButton(
      wrap.props.children.props as Parameters<typeof SlipButton>[0],
    ) as unknown as ButtonVNode;
  };

  it("has an accessible name that includes the next hop", () => {
    for (const hop of [1, 2, 9, 15]) {
      const html = renderToString(
        h(Slip, {
          slip: heard("a"),
          relay: { kind: "action", hop, disabled: false },
        }),
      );
      const name = html.match(/<button[^>]*aria-label="([^"]*)"/)?.[1];
      expect(name).toBe(`Pass it on, hop ${hop}`);
      // The disabled button keeps the same name (4.8).
      const off = renderToString(h(PassOn, { hop, disabled: true }));
      expect(off).toContain(`aria-label="Pass it on, hop ${hop}"`);
    }
  });

  it("uses the slip-button size class with a hit area of at least 44 by 44 px", () => {
    const html = renderToString(h(PassOn, { hop: 2 }));
    expect(html).toMatch(/<button[^>]*class="slip-button"/);
    const css = read("Slip.css");
    const rule = (sel: string) =>
      css.match(
        new RegExp(`\\n${sel.replace(/[.:]/g, "\\$&")} \\{([^}]*)\\}`),
      )?.[1] ?? "";
    const px = (block: string, prop: string) =>
      Number(block.match(new RegExp(`(?:^|\\s)${prop}:\\s*([\\d.]+)px`))?.[1]);
    const base = rule(".slip-button");
    const after = rule(".slip-button::after");
    expect(after).toMatch(/position:\s*absolute/);
    expect(base).toMatch(/position:\s*relative/);
    const inset = after.match(/inset:\s*-([\d.]+)px\s+-([\d.]+)px/);
    const vOut = Number(inset?.[1]);
    const hOut = Number(inset?.[2]);
    // Height: min-height plus the hit area grown above and below.
    expect(px(base, "min-height") + 2 * vOut).toBeGreaterThanOrEqual(44);
    // Width: padding and border alone, before the label, plus the grown sides.
    const pad = base.match(/padding:\s*[\d.]+px\s+([\d.]+)px/);
    const border = px(base, "border");
    const boxNoText = 2 * (Number(pad?.[1]) + border + hOut);
    expect(boxNoText).toBeGreaterThanOrEqual(33);
    // No min-width: the rest of the width comes from the label, one nowrap
    // line of at least 18 characters at 12.5 px, far over the 11 px still needed.
    expect(base).toMatch(/white-space:\s*nowrap/);
    expect(html).toMatch(/>Pass it on → hop 2</);
  });

  it("is a native button, so Enter and Space activate it through click", () => {
    const onTap = vi.fn();
    const b = button(2, onTap);
    expect(b.type).toBe("button");
    expect(b.props.type).toBe("button");
    // Nothing takes it out of the tab order or swallows Enter or Space.
    expect(b.props.tabIndex).toBeUndefined();
    expect(b.props.tabindex).toBeUndefined();
    expect(b.props.onKeyDown).toBeUndefined();
    expect(b.props.onKeyUp).toBeUndefined();
    expect(b.props.onKeyPress).toBeUndefined();
    expect(b.props.role).toBeUndefined();
    // The browser turns Enter and Space on a focused button into this click.
    b.props.onClick();
    expect(onTap).toHaveBeenCalledTimes(1);
    // A tap without a handler does not throw.
    expect(() => button(2).props.onClick()).not.toThrow();
  });

  it("renders the disabled button with the native attribute, so keys do nothing", () => {
    const b = button(3, vi.fn(), true);
    expect(b.props.disabled).toBe(true);
    expect(renderToString(h(PassOn, { hop: 3, disabled: true }))).toMatch(
      /<button[^>]*disabled[^>]*>Pass it on → hop 3</,
    );
  });

  it("renders reason, Passed on and unreadable text as text, never as HTML", async () => {
    const evil = (n: string) => `<img src=x onerror="${n}"><b>${n}</b>`;
    vi.resetModules();
    vi.doMock("../copy", async (importOriginal) => {
      const m = await importOriginal<typeof import("../copy")>();
      return {
        copy: {
          ...m.copy,
          slip: {
            ...m.copy.slip,
            notices: {
              ...m.copy.slip.notices,
              unreadable: {
                ...m.copy.slip.notices.unreadable,
                text: evil("u"),
              },
            },
          },
          relay: {
            ...m.copy.relay,
            passedOn: evil("p"),
            endNoHops: evil("r1"),
            endHopLimit: evil("r2"),
            endRestart: evil("r3"),
            endMulti: evil("r4"),
            endKeyOffer: evil("r5"),
            unreadable: {
              ...m.copy.relay.unreadable,
              textRelayable: evil("ur"),
            },
          },
        },
      };
    });
    try {
      const { Slip: S } = await import("./Slip");
      const unreadable: SlipModel = {
        kind: "system",
        id: "u",
        at: 0,
        noticeKey: "unreadable",
      };
      const keys = ["no-hops", "hop-limit", "restart", "multi", "key-offer"];
      const htmls = [
        renderToString(h(S, { slip: heard("x"), relay: { kind: "passed" } })),
        ...keys.map((key) =>
          renderToString(
            h(S, {
              slip: heard("x"),
              relay: { kind: "reason", key: key as "multi" },
            }),
          ),
        ),
        renderToString(
          h(S, { slip: unreadable, relay: { kind: "reason", key: "multi" } }),
        ),
        renderToString(
          h(S, {
            slip: unreadable,
            relay: { kind: "action", hop: 1, disabled: false },
          }),
        ),
      ];
      for (const html of htmls) {
        expect(html).not.toMatch(/<img|<b>/);
        expect(html).toContain("&lt;img src=x onerror=");
      }
      expect(htmls.join("")).toContain("&lt;b>r5&lt;/b>");
      expect(htmls.join("")).toContain("&lt;b>ur&lt;/b>");
    } finally {
      vi.doUnmock("../copy");
      vi.resetModules();
    }
  });
});

describe("GhostText", () => {
  it("renders final text when inactive", () => {
    expect(renderToString(h(GhostText, { text: "a<b" }))).toContain("a&lt;b");
  });

  it("resolves from static to the text", () => {
    const text = "Hello there";
    const start = ghostFrame(text, 0, 0);
    expect(start).not.toBe(text);
    expect(start[5]).toBe(" ");
    expect(ghostFrame(text, 1, 3)).toBe(text);
  });
});

describe("Tape", () => {
  it("shows the empty tape text from Figma when empty", () => {
    const html = renderToString(h(Tape, { slips: [], expanded: false }));
    expect(html).toContain(
      "No paper yet. Messages you send and hear print here, and anything you hear can be passed on to the next phone.",
    );
    expect(html).not.toContain("See more");
  });

  it("shows the latest 3 newest first with See more, and all with Show less", () => {
    const slips = [1, 2, 3, 4, 5].map((n) => sent(`s${n}`, `msg${n}`));
    const collapsed = renderToString(h(Tape, { slips, expanded: false }));
    expect(collapsed).toContain("See more");
    expect(collapsed).not.toContain("msg2");
    expect(collapsed.indexOf("msg5")).toBeLessThan(collapsed.indexOf("msg4"));
    const open = renderToString(h(Tape, { slips, expanded: true }));
    expect(open).toContain("Show less");
    expect(open).toContain("msg1");
  });

  it("shows no toggle for 3 or fewer slips", () => {
    const slips = [sent("a"), sent("b"), sent("c")];
    const html = renderToString(h(Tape, { slips, expanded: false }));
    expect(html).not.toContain("See more");
  });
});
