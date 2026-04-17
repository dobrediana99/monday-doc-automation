import { describe, expect, it } from "vitest";
import { AuditService, type SigningAuditTrail } from "./auditService";

describe("AuditService.buildAuditLines", () => {
  it("includes full name on signed line when present", () => {
    const trail: SigningAuditTrail = {
      boardId: "b",
      itemId: "i",
      flowType: "client",
      sourceFileColumnId: "f",
      sourceAssetId: "a1",
      sourceFileName: "doc.pdf",
      recipientEmail: "x@y.com",
      sessionId: "s",
      tokenExpiresAt: "2026-01-02T00:00:00.000Z",
      signedAt: "2026-01-01T12:00:00.000Z",
      ipAtSign: "1.2.3.4",
      userAgentAtSign: "ua",
      signerFullName: "Alexandru Georgescu"
    };
    const lines = new AuditService().buildAuditLines(trail);
    const signedLine = lines.find((l) => l.startsWith("Signed at:"));
    expect(signedLine).toBeDefined();
    expect(signedLine).toContain("Full name: Alexandru Georgescu");
  });
});
