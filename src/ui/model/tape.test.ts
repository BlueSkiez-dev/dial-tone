import { describe, expect, it } from "vitest";
import { SLIP_TEXT_MAX, sanitizeText } from "./tape";

describe("sanitizeText", () => {
  it("strips control characters", () => {
    expect(sanitizeText("a\u0000b\u001b[31mc\nd\te\u007ff\u0085g")).toBe(
      "ab[31mcdefg",
    );
  });

  it("keeps ordinary and multi-byte text", () => {
    expect(sanitizeText("héllo ✓ 😀")).toBe("héllo ✓ 😀");
  });

  it("caps at 1,024 characters", () => {
    expect(sanitizeText("a".repeat(5000))).toHaveLength(SLIP_TEXT_MAX);
    expect(Array.from(sanitizeText("😀".repeat(2000)))).toHaveLength(
      SLIP_TEXT_MAX,
    );
  });
});
