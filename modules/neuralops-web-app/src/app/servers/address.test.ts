import { describe, expect, it } from "vitest";
import { normalizeServerAddress } from "./page";

describe("normalizeServerAddress", () => {
  it("accepts full http/https origins", () => {
    expect(normalizeServerAddress("http://192.168.1.90:8096")).toEqual({ url: "http://192.168.1.90:8096" });
    expect(normalizeServerAddress("https://nexus.example.com")).toEqual({ url: "https://nexus.example.com" });
  });
  it("auto-prepends http:// for bare hosts", () => {
    expect(normalizeServerAddress("localhost:8096")).toEqual({ url: "http://localhost:8096" });
    expect(normalizeServerAddress("100.101.4.20:8096")).toEqual({ url: "http://100.101.4.20:8096" });
  });
  it("strips trailing slash via origin", () => {
    expect(normalizeServerAddress("http://localhost:8096/")).toEqual({ url: "http://localhost:8096" });
  });
  it("rejects garbage, wrong schemes, paths, and credentials", () => {
    expect(normalizeServerAddress("")).toHaveProperty("error");
    expect(normalizeServerAddress("not a url at all !!!")).toHaveProperty("error");
    expect(normalizeServerAddress("ftp://files.example")).toHaveProperty("error");
    expect(normalizeServerAddress("http://host:8096/api/v1")).toHaveProperty("error");
    expect(normalizeServerAddress("http://user:pw@host:8096")).toHaveProperty("error");
  });
});
