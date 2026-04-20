import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { SigningService } from "./signingService";
import { InMemorySigningSessionStore } from "./signingSessionStore";

describe("Signing links persistence + reaccess (store-backed)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("default TTL env is 2880 minutes (48h)", async () => {
    // env schema requires many variables; set minimal valid values for the test.
    process.env.APP_BASE_URL = process.env.APP_BASE_URL ?? "https://example.test";
    process.env.MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN ?? "x";
    process.env.GCS_BUCKET = process.env.GCS_BUCKET ?? "bucket";
    process.env.GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID ?? "id";
    process.env.GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET ?? "secret";
    process.env.GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN ?? "refresh";
    process.env.GMAIL_SENDER = process.env.GMAIL_SENDER ?? "sender@example.test";

    // env schema test: import fresh by dynamic import
    const { env } = await import("../config/env");
    expect(env.SIGN_TOKEN_TTL_MINUTES).toBe(2880);
  });

  it("GET-like operations (load + markViewed) do not invalidate the session", async () => {
    const store = new InMemorySigningSessionStore();
    const svc = new SigningService(60_000, store);
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

    // Simulate multiple accesses
    expect((await svc.getSessionByTokenAsync(session.token))?.status).toBe("active");
    await svc.markViewed(session.token, { ip: "1.1.1.1", userAgent: "ua" });
    expect(await svc.isTokenValid(session.token)).toBe(true);
    await svc.markViewed(session.token, { ip: "2.2.2.2", userAgent: "ua2" });
    expect(await svc.isTokenValid(session.token)).toBe(true);
  });

  it("session survives SigningService restart when store persists", async () => {
    const store = new InMemorySigningSessionStore();
    const svc1 = new SigningService(60_000, store);
    const session = await svc1.createSession({
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

    const svc2 = new SigningService(60_000, store);
    expect(await svc2.isTokenValid(session.token)).toBe(true);
    await svc2.markViewed(session.token, { ip: "1.1.1.1", userAgent: "ua" });
    expect((await svc2.getSessionByTokenAsync(session.token))?.viewedAt).toBeTruthy();
  });

  it("token becomes invalid after expiry", async () => {
    const store = new InMemorySigningSessionStore();
    const svc = new SigningService(1_000, store);
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
    expect(await svc.isTokenValid(session.token)).toBe(false);
  });

  it("token becomes invalid after sign and after refuse", async () => {
    const store = new InMemorySigningSessionStore();
    const svc = new SigningService(60_000, store);
    const s1 = await svc.createSession({
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
    await svc.markSigned(s1.token, {
      ip: "1.2.3.4",
      userAgent: "ua",
      finalSignedFileName: "out.pdf",
      signerFullName: "Test"
    });
    expect(await svc.isTokenValid(s1.token)).toBe(false);

    const s2 = await svc.createSession({
      itemId: "2",
      boardId: "b1",
      flowType: "client",
      sourceFileColumnId: "file_x",
      sourceAssetId: "asset2",
      sourcePdfName: "b.pdf",
      recipientEmail: "y@example.com",
      emailSource: "primary",
      recipientName: null,
      signingEmailLanguage: "en",
      signingOrderReference: "ORD-2"
    });
    await svc.markRefused(s2.token, { reason: "no", ip: "1.2.3.4", userAgent: "ua" });
    expect(await svc.isTokenValid(s2.token)).toBe(false);
  });
});

