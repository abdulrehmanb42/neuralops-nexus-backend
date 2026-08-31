import { beforeEach, describe, expect, it } from "vitest";
import { useServersStore } from "./servers.store";

beforeEach(() => {
  localStorage.clear();
  useServersStore.setState({ servers: [], removed: {} });
});

describe("servers store", () => {
  it("adds a server with a normalized URL (trailing slash stripped)", () => {
    useServersStore.getState().add("Home lab", "http://192.168.1.90:8096/");
    const [s] = useServersStore.getState().servers;
    expect(s.url).toBe("http://192.168.1.90:8096");
    expect(s.name).toBe("Home lab");
    expect(s.id).toBeTruthy();
  });

  it("rejects duplicates by URL", () => {
    const { add } = useServersStore.getState();
    add("A", "http://x:8096");
    expect(() => useServersStore.getState().add("B", "http://x:8096/")).toThrowError(/already/i);
  });

  it("removes and touches", () => {
    useServersStore.getState().add("A", "http://x:8096");
    const id = useServersStore.getState().servers[0].id;
    useServersStore.getState().touch(id);
    expect(useServersStore.getState().servers[0].lastConnected).toBeTruthy();
    useServersStore.getState().remove(id);
    expect(useServersStore.getState().servers).toHaveLength(0);
  });

  // Tombstones are what stop the account mirror from resurrecting a server
  // the user removed on this device.
  it("records a tombstone on remove and clears it on re-add", () => {
    useServersStore.getState().add("A", "http://X:8096");
    const id = useServersStore.getState().servers[0].id;
    useServersStore.getState().remove(id);
    expect(useServersStore.getState().removed["http://x:8096"]).toBeTruthy();
    useServersStore.getState().add("A again", "http://x:8096");
    expect(useServersStore.getState().removed["http://x:8096"]).toBeUndefined();
  });

  // Regression: over http://<LAN-IP> (a non-secure context) crypto.randomUUID is
  // undefined and add() used to throw "crypto.randomUUID is not a function",
  // leaving the teammate unable to add any server. It must now mint an id via
  // the getRandomValues fallback instead.
  it("adds a server where crypto.randomUUID is unavailable (non-secure http context)", () => {
    const realCrypto = globalThis.crypto;
    const getRandomValues = <T extends Uint8Array>(a: T): T => {
      for (let i = 0; i < a.length; i++) a[i] = (i * 37 + 11) & 0xff;
      return a;
    };
    Object.defineProperty(globalThis, "crypto", { value: { getRandomValues }, configurable: true });
    try {
      expect(() => useServersStore.getState().add("HTTP box", "http://192.168.1.90:8096")).not.toThrow();
      expect(useServersStore.getState().servers[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: realCrypto, configurable: true });
    }
  });
});
