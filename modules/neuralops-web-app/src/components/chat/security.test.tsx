import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { HtmlFrame, HTML_SANDBOX_FLAGS } from "./html-frame";
import { MessageItem } from "./message-item";
import type { UiMessage } from "@/lib/realtime/message-store";

// SECURITY INVARIANTS — a failing test here means a real vulnerability.
describe("AI html sandbox", () => {
  it("uses exactly allow-scripts — never same-origin/forms/popups", () => {
    expect(HTML_SANDBOX_FLAGS).toBe("allow-scripts");
    const { container } = render(<HtmlFrame content="<html><body>x</body></html>" title="t" />);
    const frame = container.querySelector("iframe")!;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
  });
});

describe("human markdown never executes HTML", () => {
  it("renders embedded HTML as escaped text, not DOM", () => {
    const msg: UiMessage = {
      id: "x", content: '<img src=x onerror=alert(1)>**bold**', renderAs: "text", outputType: "text",
      senderName: "Waqas", senderId: "u1", senderAvatar: null, senderType: "human", personaId: null,
      sequence: 1, createdAt: new Date().toISOString(), isSystem: false, isStreaming: false,
      isError: false, isStalled: false, lastActivity: 0,
    };
    const { container } = render(<MessageItem message={msg} />);
    // The only img allowed is an avatar; the payload img must NOT exist.
    expect(container.querySelectorAll("img[src='x']").length).toBe(0);
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
  });
});
