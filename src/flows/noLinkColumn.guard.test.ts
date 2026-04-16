import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("No dependency on removed Monday signing link column", () => {
  it("codebase does not reference removed link column id", () => {
    const removedColumnId = ["link", "mksvc32a"].join("_");
    const root = path.resolve(__dirname, "..", "..");
    const filesToCheck = [
      path.join(root, "src", "utils", "mapping.ts"),
      path.join(root, "src", "flows", "signingFlow.ts")
    ];
    for (const file of filesToCheck) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toContain(removedColumnId);
    }
  });
});

