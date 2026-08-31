import { describe, expect, it } from "vitest";
import {
  activeDirective,
  isMentionableName,
  mentionTriggerAt,
  stripLeakedMarkers,
  toggleDirective,
} from "./directives";

describe("mentionTriggerAt", () => {
  it("detects an @token at the caret", () => {
    expect(mentionTriggerAt("hey @La", 7)).toEqual({ query: "La", start: 4 });
    expect(mentionTriggerAt("@", 1)).toEqual({ query: "", start: 0 });
  });
  it("ignores emails and mid-word @", () => {
    expect(mentionTriggerAt("mail me a@b", 11)).toBeNull();
    expect(mentionTriggerAt("no trigger here", 8)).toBeNull();
  });
  it("only looks at the caret position", () => {
    expect(mentionTriggerAt("@Layla done", 11)).toBeNull();
  });
});

describe("toggleDirective", () => {
  it("preserves newlines in multi-line drafts", () => {
    expect(toggleDirective("line one\n\nline two", "chart")).toBe("line one\n\nline two @chart");
    expect(toggleDirective("- a\n- b @chart", "chart")).toBe("- a\n- b");
  });

  it("appends, replaces, and removes directives", () => {
    expect(toggleDirective("show sales", "chart")).toBe("show sales @chart");
    expect(toggleDirective("show sales @chart", "table")).toBe("show sales @table");
    expect(toggleDirective("show sales @table", "table")).toBe("show sales");
    expect(toggleDirective("", "chart")).toBe("@chart");
  });
  it("reports the active directive case-insensitively", () => {
    expect(activeDirective("numbers please @Chart")).toBe("chart");
    expect(activeDirective("no directive")).toBeNull();
  });
});

describe("stripLeakedMarkers", () => {
  it("removes leaked embed/output marker blocks", () => {
    const leaked = "<<<OUTPUT:chart>>><html>x</html><<<END_OUTPUT>>>\n<<<EMBED>>>a chart about sales<<<END_EMBED>>>";
    expect(stripLeakedMarkers(leaked)).toBe("<html>x</html>");
  });
  it("leaves clean content alone", () => {
    expect(stripLeakedMarkers("just text")).toBe("just text");
  });
});

describe("isMentionableName", () => {
  it("enforces the server's mention constraints", () => {
    expect(isMentionableName("Layla")).toBe(true);
    expect(isMentionableName("dev_2")).toBe(true);
    expect(isMentionableName("session")).toBe(false);
    expect(isMentionableName("Chart")).toBe(false);
    expect(isMentionableName("bad-name")).toBe(false);
    expect(isMentionableName("with space")).toBe(false);
  });
});
