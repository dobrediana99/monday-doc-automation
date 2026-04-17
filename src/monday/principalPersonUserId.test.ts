import { describe, expect, it } from "vitest";
import { extractFirstPersonUserIdFromPeopleColumnJson } from "./principalPersonUserId";

describe("extractFirstPersonUserIdFromPeopleColumnJson", () => {
  it("returns first person id when present", () => {
    const json = JSON.stringify({
      personsAndTeams: [{ id: 12345, kind: "person" }]
    });
    expect(extractFirstPersonUserIdFromPeopleColumnJson(json)).toBe("12345");
  });

  it("skips team and returns next person", () => {
    const json = JSON.stringify({
      personsAndTeams: [
        { id: 1, kind: "team" },
        { id: 999888, kind: "person" }
      ]
    });
    expect(extractFirstPersonUserIdFromPeopleColumnJson(json)).toBe("999888");
  });

  it("returns null for team-only", () => {
    const json = JSON.stringify({ personsAndTeams: [{ id: 2, kind: "team" }] });
    expect(extractFirstPersonUserIdFromPeopleColumnJson(json)).toBeNull();
  });

  it("returns null for empty column", () => {
    expect(extractFirstPersonUserIdFromPeopleColumnJson(null)).toBeNull();
    expect(extractFirstPersonUserIdFromPeopleColumnJson("{}")).toBeNull();
  });

  it("treats missing kind as person", () => {
    const json = JSON.stringify({ personsAndTeams: [{ id: 555 }] });
    expect(extractFirstPersonUserIdFromPeopleColumnJson(json)).toBe("555");
  });
});
