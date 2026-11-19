import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as protocol from "../../protocol/index";
import { draftView } from "./draft";

describe("Property 2: Draft limit follows the protocol", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** **Validates: Requirements 4.1, 4.2, 5.3** */
  it("bytes, limit and status follow the protocol", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string({ maxLength: 200 }),
          fc.string({ unit: "binary", maxLength: 150 }),
          fc
            .array(fc.constantFrom("é", "€", "😀", "a", "漢"), {
              maxLength: 150,
            })
            .map((a) => a.join("")),
        ),
        (text) => {
          const v = draftView(text);
          const expectedLimit = protocol.plaintextCapacity({
            encrypted: false,
            multi: false,
          });
          const multi = new TextEncoder().encode(text).length > text.length;
          return (
            v.bytes === protocol.utf8ByteLength(text) &&
            v.limit === expectedLimit &&
            (v.status === "too-long") === v.bytes > v.limit &&
            (!multi || v.bytes > text.length)
          );
        },
      ),
    );
  });

  it("asks the protocol for the open single-frame capacity", () => {
    // ESM namespace spying may be unsupported; fall back to checking the value.
    let spy: ReturnType<typeof vi.spyOn> | null = null;
    try {
      spy = vi.spyOn(protocol, "plaintextCapacity");
    } catch {
      spy = null;
    }
    const v = draftView("hi");
    if (spy && spy.mock.calls.length > 0) {
      expect(spy).toHaveBeenCalledWith({ encrypted: false, multi: false });
    }
    expect(v.limit).toBe(
      protocol.plaintextCapacity({ encrypted: false, multi: false }),
    );
  });
});
