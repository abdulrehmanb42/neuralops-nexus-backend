import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { InsecureContextNotice } from "./insecure-context-notice";

const setSecure = (v: boolean) => Object.defineProperty(window, "isSecureContext", { value: v, configurable: true });

afterEach(cleanup);

describe("InsecureContextNotice", () => {
  it("warns when served over plain HTTP (insecure context)", async () => {
    setSecure(false);
    render(<InsecureContextNotice />);
    // State is set in a deferred rAF (per the repo's set-state-in-effect rule),
    // so the note appears after the mount tick.
    expect(await screen.findByRole("note")).toHaveTextContent(/insecure connection/i);
  });

  it("renders nothing in a secure context (https or localhost)", () => {
    setSecure(true);
    const { container } = render(<InsecureContextNotice />);
    expect(container).toBeEmptyDOMElement();
  });
});
