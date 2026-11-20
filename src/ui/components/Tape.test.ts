import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import type { SlipRelayView } from "../model/relay-view";
import type { Slip as SlipModel } from "../model/tape";
import { Tape } from "./Tape";

const heard = (id: string, hop = 0): SlipModel => ({
  kind: "heard",
  id,
  at: 0,
  text: `msg ${id}`,
  bytes: 5,
  hop,
});

describe("Tape relay props", () => {
  it("renders no relay UI when the relay prop is omitted", () => {
    const html = renderToString(
      h(Tape, { slips: [heard("a")], expanded: false }),
    );
    expect(html).not.toContain("Pass it on");
    expect(html).not.toContain("Passed on");
  });

  it("asks the relay callback per slip and renders the action it returns", () => {
    const asked: string[] = [];
    const relay = (slip: SlipModel): SlipRelayView | undefined => {
      asked.push(slip.id);
      return slip.id === "a"
        ? { kind: "action", hop: 1, disabled: false }
        : undefined;
    };
    const html = renderToString(
      h(Tape, { slips: [heard("a"), heard("b")], expanded: false, relay }),
    );
    expect(asked.sort()).toEqual(["a", "b"]);
    expect(html.match(/Pass it on → hop 1/g)).toHaveLength(1);
  });

  it("renders a disabled action and a passed view", () => {
    const relay = (slip: SlipModel): SlipRelayView | undefined =>
      slip.id === "a"
        ? { kind: "action", hop: 1, disabled: true }
        : { kind: "passed" };
    const html = renderToString(
      h(Tape, { slips: [heard("a"), heard("b")], expanded: false, relay }),
    );
    expect(html).toMatch(/<button[^>]*disabled[^>]*>/);
    expect(html).toContain("Passed on");
  });
});
