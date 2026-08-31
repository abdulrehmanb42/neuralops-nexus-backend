import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText, randomId } from "./browser";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("randomId", () => {
  const realCrypto = globalThis.crypto;
  afterEach(() => Object.defineProperty(globalThis, "crypto", { value: realCrypto, configurable: true }));

  it("uses crypto.randomUUID in a secure context", () => {
    expect(randomId()).toMatch(V4);
  });

  it("falls back to a getRandomValues v4 uuid when randomUUID is absent (http://<ip>)", () => {
    // Simulate a non-secure context: randomUUID gone, getRandomValues present.
    const getRandomValues = <T extends Uint8Array>(a: T): T => {
      for (let i = 0; i < a.length; i++) a[i] = (i * 37 + 11) & 0xff;
      return a;
    };
    Object.defineProperty(globalThis, "crypto", { value: { getRandomValues }, configurable: true });
    const id = randomId();
    expect(id).toMatch(V4);
    expect(id).toBe(randomId()); // deterministic given the stubbed bytes — proves the v4 bit-twiddling
  });

  it("still returns a non-empty id when crypto is entirely absent", () => {
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    expect(randomId().length).toBeGreaterThan(0);
  });
});

describe("copyText", () => {
  afterEach(() => vi.restoreAllMocks());

  it("uses navigator.clipboard when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    expect(await copyText("hello")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to execCommand('copy') when clipboard is missing (non-secure context)", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });
    expect(await copyText("hello")).toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("reports failure (false) when both paths fail", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    Object.defineProperty(document, "execCommand", { value: () => false, configurable: true });
    expect(await copyText("hello")).toBe(false);
  });
});
