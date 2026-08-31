import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TypingBar } from "./typing-bar";
import type { TypingActor } from "@/lib/realtime/message-store";

const human = (name: string): TypingActor => ({ key: `human:${name}`, name, avatar: null, kind: "human", expiresAt: Number.MAX_SAFE_INTEGER });
const persona = (name: string): TypingActor => ({ key: `persona:${name}`, name, avatar: null, kind: "persona", expiresAt: Number.MAX_SAFE_INTEGER });

describe("TypingBar", () => {
  it("renders nothing when idle", () => {
    const { container } = render(<TypingBar actors={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows a human typer", () => {
    render(<TypingBar actors={[human("Sara")]} />);
    expect(screen.getByText(/Sara is typing/)).toBeInTheDocument();
  });

  it("IGNORES personas — a streaming persona shows its own bubble, not the floating bar", () => {
    const { container } = render(<TypingBar actors={[persona("Dev")]} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows only the humans when both kinds are present", () => {
    render(<TypingBar actors={[persona("Dev"), human("Sara")]} />);
    expect(screen.getByText(/Sara is typing/)).toBeInTheDocument();
    expect(screen.queryByText(/Dev/)).not.toBeInTheDocument();
  });
});
