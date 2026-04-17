import { describe, expect, it } from "vitest";
import { normalizeDedupedCcExcludingTo, signingPrincipalCcAddresses } from "./signingEmailCc";

describe("signingPrincipalCcAddresses", () => {
  it("adds principal when different from To", () => {
    expect(signingPrincipalCcAddresses("a@b.com", "principal@corp.com")).toEqual(["principal@corp.com"]);
  });

  it("returns undefined when Principal empty", () => {
    expect(signingPrincipalCcAddresses("a@b.com", null)).toBeUndefined();
    expect(signingPrincipalCcAddresses("a@b.com", "   ")).toBeUndefined();
  });

  it("dedupes when Principal equals To case-insensitively", () => {
    expect(signingPrincipalCcAddresses("User@Example.com", "user@example.com")).toBeUndefined();
  });

  it("rejects invalid principal email shape", () => {
    expect(signingPrincipalCcAddresses("a@b.com", "not-an-email")).toBeUndefined();
  });
});

describe("normalizeDedupedCcExcludingTo", () => {
  it("dedupes duplicate extras case-insensitively", () => {
    expect(normalizeDedupedCcExcludingTo("to@x.com", ["cc1@y.com", "CC1@y.com", "cc2@z.com"])).toEqual([
      "cc1@y.com",
      "cc2@z.com"
    ]);
  });

  it("excludes addresses matching To", () => {
    expect(normalizeDedupedCcExcludingTo("same@x.com", ["same@x.com", "other@x.com"])).toEqual(["other@x.com"]);
  });
});
