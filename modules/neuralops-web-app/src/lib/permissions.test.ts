import { describe, expect, it } from "vitest";
import { isCompanyAdmin, isViewer } from "./permissions";

describe("company-role gating", () => {
  it("owner and admin manage; member and viewer do not", () => {
    expect(isCompanyAdmin("owner")).toBe(true);
    expect(isCompanyAdmin("admin")).toBe(true);
    expect(isCompanyAdmin("member")).toBe(false);
    expect(isCompanyAdmin("viewer")).toBe(false);
    expect(isCompanyAdmin(null)).toBe(false);
  });

  it("identifies the read-only viewer", () => {
    expect(isViewer("viewer")).toBe(true);
    expect(isViewer("member")).toBe(false);
    expect(isViewer(undefined)).toBe(false);
  });
});
