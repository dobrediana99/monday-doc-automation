import { describe, expect, it } from "vitest";
import { extractFirstAssignedUserId } from "./extractAssignedUserId";

describe("extractFirstAssignedUserId", () => {
  it("reads legacy single user_id", () => {
    expect(extractFirstAssignedUserId({ user_id: "abc-123" })).toBe("abc-123");
  });

  it("reads multi-person user_ids shape", () => {
    expect(
      extractFirstAssignedUserId({
        users: [{ name: "Dan", user_id: "c447a7e2-48c7-421d-a199-acd0bdd8fef0" }],
        user_ids: ["c447a7e2-48c7-421d-a199-acd0bdd8fef0"]
      })
    ).toBe("c447a7e2-48c7-421d-a199-acd0bdd8fef0");
  });

  it("prefers user_id when present", () => {
    expect(
      extractFirstAssignedUserId({
        user_id: "legacy-id",
        user_ids: ["other-id"]
      })
    ).toBe("legacy-id");
  });

  it("returns null for empty values", () => {
    expect(extractFirstAssignedUserId(null)).toBeNull();
    expect(extractFirstAssignedUserId({})).toBeNull();
    expect(extractFirstAssignedUserId({ user_ids: [] })).toBeNull();
  });
});
