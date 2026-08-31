import { describe, expect, it } from "vitest";
import { markdownToPlain } from "./markdown";

describe("markdownToPlain", () => {
  it("strips inline formatting", () => {
    expect(markdownToPlain("**hello**")).toBe("hello");
    expect(markdownToPlain("_em_ and ~~gone~~ and `code`")).toBe("em and gone and code");
  });
  it("flattens links, lists, quotes", () => {
    expect(markdownToPlain("[spec](https://x.y) ready")).toBe("spec ready");
    expect(markdownToPlain("- one\n- two")).toBe("one two");
    expect(markdownToPlain("> quoted line")).toBe("quoted line");
  });
  it("unescapes serializer escapes and drops code blocks", () => {
    expect(markdownToPlain("2 \\* 3 stays")).toBe("2 * 3 stays");
    expect(markdownToPlain("intro\n```js\nx\n```\noutro")).toBe("intro outro");
  });
});
