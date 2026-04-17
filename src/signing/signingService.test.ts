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

  it("isTokenValid is true while active and within TTL", () => {
    const svc = new SigningService(60_000);
    const session = svc.createSession({
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
    expect(svc.isTokenValid(session.token)).toBe(true);
  });

  it("isTokenValid is false after expiry", () => {
    const svc = new SigningService(1_000);
    const session = svc.createSession({
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
    expect(svc.isTokenValid(session.token)).toBe(false);
  });

  it("markSigned stores provided signedAt instead of clock time", () => {
    const svc = new SigningService(60_000);
    const session = svc.createSession({
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
    svc.markSigned(session.token, {
      ip: "1.2.3.4",
      userAgent: "ua",
      finalSignedFileName: "out.pdf",
      signedAt: fixed
    });
    expect(svc.getAuditTrail(session.token).signedAt).toBe(fixed);
    expect(svc.getAuditTrail(session.token).ipAtSign).toBe("1.2.3.4");
  });
});

