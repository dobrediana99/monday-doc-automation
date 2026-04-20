import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { RedisSigningSessionStore } from "./redisSigningSessionStore";
import type { SigningSession } from "./signingService";

type SetOpts = { EX?: number };

class FakeRedisClient {
  public isOpen = false;
  private readonly data = new Map<string, { value: string; expiresAt: number | null }>();
  on() {
    // no-op
    return this;
  }
  async connect() {
    this.isOpen = true;
  }
  async quit() {
    this.isOpen = false;
  }
  async get(key: string): Promise<string | null> {
    const entry = this.data.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.data.delete(key);
      return null;
    }
    return entry.value;
  }
  async set(key: string, value: string, opts?: SetOpts): Promise<void> {
    const expiresAt = opts?.EX ? Date.now() + opts.EX * 1000 : null;
    this.data.set(key, { value, expiresAt });
  }
  async del(key: string): Promise<void> {
    this.data.delete(key);
  }
}

function sessionFixture(overrides: Partial<SigningSession> = {}): SigningSession {
  const now = Date.now();
  return {
    token: "tok-1",
    sessionId: "sid",
    itemId: "1",
    boardId: "b1",
    flowType: "client",
    sourceFileColumnId: "file_x",
    sourceAssetId: "asset1",
    sourcePdfName: "doc.pdf",
    recipientEmail: "a@example.com",
    emailSource: "primary",
    recipientName: null,
    signingEmailLanguage: "en",
    signingOrderReference: "ORD",
    createdAt: now,
    expiresAt: now + 60_000,
    status: "active",
    ...overrides
  };
}

describe("RedisSigningSessionStore (adapter behavior)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips sessions and respects TTL expiry", async () => {
    const client = new FakeRedisClient();
    const store = new RedisSigningSessionStore({ redisUrl: "redis://example", prefix: "signing", client });
    const s = sessionFixture({ token: "tok-ttl", expiresAt: Date.now() + 2000 });
    await store.createSession(s);
    expect((await store.getSessionByToken("tok-ttl"))?.token).toBe("tok-ttl");
    vi.advanceTimersByTime(2500);
    expect(await store.getSessionByToken("tok-ttl")).toBeNull();
  });

  it("uses prefix for session and active index keys", async () => {
    const client = new FakeRedisClient();
    const store = new RedisSigningSessionStore({ redisUrl: "redis://example", prefix: "myprefix", client });
    const s = sessionFixture({ token: "tok-2" });
    await store.createSession(s);
    // verify stored under the prefixed key by observing that default prefix key misses
    const storeDefault = new RedisSigningSessionStore({ redisUrl: "redis://example", prefix: "signing", client });
    expect(await storeDefault.getSessionByToken("tok-2")).toBeNull();
    expect((await store.getSessionByToken("tok-2"))?.token).toBe("tok-2");
  });

  it("supports active-session index set/get/delete", async () => {
    const client = new FakeRedisClient();
    const store = new RedisSigningSessionStore({ redisUrl: "redis://example", prefix: "signing", client });
    await store.setActiveTokenForKey("k1", "tokX", 1000);
    expect(await store.getActiveTokenForKey("k1")).toBe("tokX");
    await store.deleteActiveTokenForKey("k1");
    expect(await store.getActiveTokenForKey("k1")).toBeNull();
  });
});

