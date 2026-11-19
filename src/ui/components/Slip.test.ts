import { readFileSync } from "node:fs";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import type { GallerySlip, Slip as SlipModel } from "../model/tape";
import { GhostText, ghostFrame } from "./GhostText";
import { Slip } from "./Slip";
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

  it("shows Pass it on only when passOn is given", () => {
    const slip = heard("1");
    expect(renderToString(h(Slip, { slip }))).not.toContain("Pass it on");
    expect(renderToString(h(Slip, { slip, passOn: 2 }))).toContain(
      "Pass it on → hop 2",
    );
  });

  it("Update ready has Later and Restart now", () => {
    const html = renderToString(
      h(Slip, { slip: { kind: "update-ready", id: "u", at: 0 } }),
    );
    expect(html).toContain("Later");
    expect(html).toContain("Restart now");
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
  it("shows No paper yet when empty", () => {
    const html = renderToString(h(Tape, { slips: [], expanded: false }));
    expect(html).toContain("No paper yet");
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
