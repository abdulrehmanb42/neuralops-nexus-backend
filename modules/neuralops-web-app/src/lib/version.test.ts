import { describe, expect, it } from "vitest";
import { APP_NAME, COMPATIBLE_SERVER_VERSION, compareServerVersion } from "./version";

describe("compareServerVersion", () => {
  const cases: Array<[string | null | undefined, ReturnType<typeof compareServerVersion>]> = [
    [COMPATIBLE_SERVER_VERSION, "match"],
    ["dev", "unknown"],
    ["unknown", "unknown"],
    [null, "unknown"],
    [undefined, "unknown"],
    ["not-semver", "unknown"],
    ["1.1.2", "breaking"], // MAJOR differs
    ["0.2.0", "breaking"], // MAJOR 0: MINOR drift is breaking
    ["0.1.9", "minor"], // PATCH-only drift warns, never blocks
    ["0.1.0", "minor"],
  ];
  it.each(cases)("%s → %s", (server, expected) => {
    expect(compareServerVersion(server)).toBe(expected);
  });
});

describe("brand", () => {
  it("presents as NeuralOps Nexus", () => {
    expect(APP_NAME).toBe("NeuralOps Nexus");
  });
});
