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
});
