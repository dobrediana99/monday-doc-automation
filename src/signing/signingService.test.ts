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
      recipientName: null
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
      recipientName: null
    });
    vi.advanceTimersByTime(1_001);
    expect(svc.isTokenValid(session.token)).toBe(false);
  });
});

