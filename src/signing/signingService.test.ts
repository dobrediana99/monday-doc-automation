import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { SigningService } from "./signingService";

describe("SigningService token validity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("isTokenValid is true while active and within TTL", async () => {
    const svc = new SigningService(60_000);
    const session = await svc.createSession({
      itemId: "1",
      boardId: "b1",
      flowType: "client",
      sourceFileColumnId: "file_x",
      sourceAssetId: "asset1",
      sourcePdfName: "a.pdf",
      recipientEmail: "x@example.com",
      emailSource: "primary",
      recipientName: null,
      signingEmailLanguage: "en",
      signingOrderReference: "ORD-1"
    });
    await expect(svc.isTokenValid(session.token)).resolves.toBe(true);
  });

  it("isTokenValid is false after expiry", async () => {
    const svc = new SigningService(1_000);
    const session = await svc.createSession({
      itemId: "1",
      boardId: "b1",
      flowType: "client",
      sourceFileColumnId: "file_x",
      sourceAssetId: "asset1",
      sourcePdfName: "a.pdf",
      recipientEmail: "x@example.com",
      emailSource: "primary",
      recipientName: null,
      signingEmailLanguage: "en",
      signingOrderReference: "ORD-1"
    });
    vi.advanceTimersByTime(1_001);
    await expect(svc.isTokenValid(session.token)).resolves.toBe(false);
  });

  it("markSigned stores provided signedAt instead of clock time", async () => {
    const svc = new SigningService(60_000);
    const session = await svc.createSession({
      itemId: "1",
      boardId: "b1",
      flowType: "client",
      sourceFileColumnId: "file_x",
      sourceAssetId: "asset1",
      sourcePdfName: "a.pdf",
      recipientEmail: "x@example.com",
      emailSource: "primary",
      recipientName: null,
      signingEmailLanguage: "en",
      signingOrderReference: "ORD-1"
    });
    const fixed = "2026-05-01T10:00:00.000Z";
    vi.advanceTimersByTime(5_000);
    await svc.markSigned(session.token, {
      ip: "1.2.3.4",
      userAgent: "ua",
      finalSignedFileName: "out.pdf",
      signedAt: fixed,
      signerFullName: "Maria Ionescu"
    });
    const trail = await svc.getAuditTrail(session.token);
    expect(trail.signedAt).toBe(fixed);
    expect(trail.ipAtSign).toBe("1.2.3.4");
    expect(trail.signerFullName).toBe("Maria Ionescu");
  });
});

