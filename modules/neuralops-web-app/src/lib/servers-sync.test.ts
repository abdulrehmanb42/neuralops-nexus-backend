import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const updateUser = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase", () => ({
  supabase: () => ({ auth: { getUser, updateUser } }),
}));

import { cancelPendingPush, pullServers, pushServersDebounced } from "./servers-sync";
import { useServersStore } from "@/stores/servers.store";

const remoteUser = (meta: Record<string, unknown>) => ({ data: { user: { user_metadata: meta } }, error: null });

beforeEach(() => {
  localStorage.clear();
  useServersStore.setState({ servers: [], removed: {} });
  getUser.mockReset();
  updateUser.mockClear();
  cancelPendingPush(); // close the push gate between tests
});

describe("pullServers", () => {
  it("merges remote servers the browser has never seen", async () => {
    getUser.mockResolvedValue(remoteUser({ nx_servers: [{ id: "r1", name: "Office", url: "http://office:8096", lastConnected: "2026-08-20T00:00:00Z" }] }));
    await pullServers();
    const { servers } = useServersStore.getState();
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe("Office");
  });

  it("applies a remote tombstone to a local entry not used since the removal", async () => {
    useServersStore.setState({
      servers: [{ id: "l1", name: "Old", url: "http://old:8096", lastConnected: "2026-08-01T00:00:00Z" }],
      removed: {},
    });
    getUser.mockResolvedValue(remoteUser({ nx_servers: [], nx_servers_removed: { "http://old:8096": "2026-08-15T00:00:00Z" } }));
    await pullServers();
    expect(useServersStore.getState().servers).toHaveLength(0);
    expect(useServersStore.getState().removed["http://old:8096"]).toBe("2026-08-15T00:00:00Z");
  });

  it("keeps a local entry that was connected AFTER the remote tombstone", async () => {
    useServersStore.setState({
      servers: [{ id: "l1", name: "Kept", url: "http://kept:8096", lastConnected: "2026-08-20T00:00:00Z" }],
      removed: {},
    });
    getUser.mockResolvedValue(remoteUser({ nx_servers: [], nx_servers_removed: { "http://kept:8096": "2026-08-15T00:00:00Z" } }));
    await pullServers();
    expect(useServersStore.getState().servers).toHaveLength(1);
  });

  it("does not resurrect a remotely-listed server removed here after its last use", async () => {
    useServersStore.setState({ servers: [], removed: { "http://gone:8096": "2026-08-25T00:00:00Z" } });
    getUser.mockResolvedValue(remoteUser({ nx_servers: [{ id: "r1", name: "Gone", url: "http://gone:8096", lastConnected: "2026-08-10T00:00:00Z" }] }));
    await pullServers();
    expect(useServersStore.getState().servers).toHaveLength(0);
  });
});

describe("push gating", () => {
  it("never pushes before a successful pull (a stale/empty local list must not wipe the account's)", async () => {
    vi.useFakeTimers();
    pushServersDebounced([], {});
    vi.advanceTimersByTime(2000);
    expect(updateUser).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("pushes servers AND tombstones after a pull, and cancelPendingPush re-closes the gate", async () => {
    getUser.mockResolvedValue(remoteUser({ nx_servers: [] }));
    await pullServers();
    vi.useFakeTimers();
    pushServersDebounced([{ id: "a", name: "A", url: "http://a:8096" }], { "http://b:8096": "2026-08-25T00:00:00Z" });
    vi.advanceTimersByTime(1500);
    expect(updateUser).toHaveBeenCalledWith({
      data: {
        nx_servers: [{ id: "a", name: "A", url: "http://a:8096" }],
        nx_servers_removed: { "http://b:8096": "2026-08-25T00:00:00Z" },
      },
    });
    cancelPendingPush();
    pushServersDebounced([], {});
    vi.advanceTimersByTime(2000);
    expect(updateUser).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
