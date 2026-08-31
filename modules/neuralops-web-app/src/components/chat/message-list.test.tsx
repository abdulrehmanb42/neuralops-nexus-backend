import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { UiMessage } from "@/lib/realtime/message-store";
import { MessageList } from "./message-list";

// selfId = "me" — distinguishes own sends (always follow to bottom) from others.
vi.mock("@/stores/connection.store", () => ({
  useConnectionStore: (sel: (s: { connection: { nucleusUserId: string } }) => unknown) =>
    sel({ connection: { nucleusUserId: "me" } }),
}));

const msg = (id: string, senderId = "other"): UiMessage => ({
  id, content: id, renderAs: "text", outputType: "text",
  senderName: senderId, senderId, senderAvatar: null, senderType: "human",
  personaId: null, sequence: Number(id.slice(1)), createdAt: "2026-08-31T00:00:00Z",
  isSystem: false, isStreaming: false, isError: false, isStalled: false, lastActivity: 0,
});

const base = { transitions: [], loading: false, loadError: null, onRetry: () => {}, onLoadOlder: async () => 0 };

const scrollEl = (c: HTMLElement) => c.querySelector(".overflow-y-auto") as HTMLElement;
// jsdom has no layout, so fake "scrolled up" metrics on the container.
const setScrolledUp = (el: HTMLElement) => {
  Object.defineProperty(el, "scrollHeight", { value: 1000, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: 300, configurable: true });
  Object.defineProperty(el, "scrollTop", { value: 0, writable: true, configurable: true });
};

beforeAll(() => { window.HTMLElement.prototype.scrollIntoView = vi.fn(); }); // jsdom lacks it
afterEach(cleanup);

describe("MessageList — new-messages pill", () => {
  it("appears when someone else's message arrives while scrolled up, and clears on click", async () => {
    const initial = [msg("m0"), msg("m1")];
    const { container, rerender } = render(<MessageList messages={initial} {...base} />);
    setScrolledUp(scrollEl(container));
    fireEvent.scroll(scrollEl(container)); // atBottom -> false
    rerender(<MessageList messages={[...initial, msg("m2")]} {...base} />);

    const pill = await screen.findByRole("button", { name: /new message/i }); // state is set in a deferred rAF
    expect(pill).toHaveTextContent("1 new message");
    fireEvent.click(pill);
    expect(screen.queryByRole("button", { name: /new message/i })).toBeNull();
  });

  it("does not appear for your own message", async () => {
    const initial = [msg("m0")];
    const { container, rerender } = render(<MessageList messages={initial} {...base} />);
    setScrolledUp(scrollEl(container));
    fireEvent.scroll(scrollEl(container));
    rerender(<MessageList messages={[...initial, msg("m1", "me")]} {...base} />);

    await Promise.resolve(); // let any rAF settle
    expect(screen.queryByRole("button", { name: /new message/i })).toBeNull();
  });
});
