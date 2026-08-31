import { describe, expect, it } from "vitest";
import { draftFromConfig, draftToPayload, emptyOAuthDraft, validateOAuth } from "./mcp-auth-section";

describe("OAuth draft <-> config", () => {
  it("round-trips config into a draft (secret never present)", () => {
    const d = draftFromConfig({ client_id: "abc", authorize_endpoint: "https://a", token_endpoint: "https://t", scopes: ["repo", "read:org"], token_env_var: "GITHUB_TOKEN" });
    expect(d.client_id).toBe("abc");
    expect(d.client_secret).toBe(""); // server never returns it
    expect(d.scopes).toBe("repo read:org");
    expect(d.token_env_var).toBe("GITHUB_TOKEN");
  });

  it("splits scopes and omits a blank secret from the payload", () => {
    const d = { ...emptyOAuthDraft(), client_id: "id", authorize_endpoint: "https://a", token_endpoint: "https://t", scopes: "repo, read:org  read:user" };
    const p = draftToPayload(d);
    expect(p.oauth_config.scopes).toEqual(["repo", "read:org", "read:user"]);
    expect(p.client_secret).toBeUndefined();
  });

  it("includes the secret when provided", () => {
    const p = draftToPayload({ ...emptyOAuthDraft(), client_id: "id", client_secret: "shh" });
    expect(p.client_secret).toBe("shh");
  });
});

describe("validateOAuth", () => {
  const base = { ...emptyOAuthDraft(), client_id: "id", authorize_endpoint: "https://github.com/login/oauth/authorize", token_endpoint: "https://github.com/login/oauth/access_token", client_secret: "s" };
  it("passes a complete GitHub-style config", () => {
    expect(validateOAuth(base, { isEdit: false, hasStoredSecret: false })).toBeNull();
  });
  it("requires client id and valid endpoints", () => {
    expect(validateOAuth({ ...base, client_id: "" }, { isEdit: false, hasStoredSecret: false })).toMatch(/client id/i);
    expect(validateOAuth({ ...base, authorize_endpoint: "not-a-url" }, { isEdit: false, hasStoredSecret: false })).toMatch(/valid url/i);
    expect(validateOAuth({ ...base, token_endpoint: "ftp://x" }, { isEdit: false, hasStoredSecret: false })).toMatch(/http/i);
  });
  it("requires a secret on create but not on edit when one is stored", () => {
    expect(validateOAuth({ ...base, client_secret: "" }, { isEdit: false, hasStoredSecret: false })).toMatch(/client secret/i);
    expect(validateOAuth({ ...base, client_secret: "" }, { isEdit: true, hasStoredSecret: true })).toBeNull();
    expect(validateOAuth({ ...base, client_secret: "" }, { isEdit: true, hasStoredSecret: false })).toMatch(/client secret/i);
  });
});
