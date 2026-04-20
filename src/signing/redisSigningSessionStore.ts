import { createClient, type RedisClientType } from "redis";
import type { SigningSession } from "./signingService";
import type { SigningSessionStore } from "./signingSessionStore";

function sessionKey(token: string): string {
  return `sign:sess:${token}`;
}

function activeKey(key: string): string {
  return `sign:active:${key}`;
}

export class RedisSigningSessionStore implements SigningSessionStore {
  private client: RedisClientType;

  constructor(redisUrl: string) {
    this.client = createClient({ url: redisUrl });
    this.client.on("error", (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ event: "signing_redis_error", message: msg.slice(0, 200) }));
    });
  }

  async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async createSession(session: SigningSession): Promise<void> {
    await this.connect();
    const ttlSeconds = Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000));
    await this.client.set(sessionKey(session.token), JSON.stringify(session), { EX: ttlSeconds });
  }

  async getSessionByToken(token: string): Promise<SigningSession | null> {
    await this.connect();
    const raw = await this.client.get(sessionKey(token));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SigningSession;
    } catch {
      return null;
    }
  }

  async updateSession(token: string, patch: Partial<SigningSession>): Promise<void> {
    const current = await this.getSessionByToken(token);
    if (!current) return;
    const next: SigningSession = { ...current, ...patch };
    const ttlSeconds = Math.max(1, Math.floor((next.expiresAt - Date.now()) / 1000));
    await this.client.set(sessionKey(token), JSON.stringify(next), { EX: ttlSeconds });
  }

  async deleteSession(token: string): Promise<void> {
    await this.connect();
    await this.client.del(sessionKey(token));
  }

  async setActiveTokenForKey(key: string, token: string, ttlMs: number): Promise<void> {
    await this.connect();
    const ttlSeconds = Math.max(1, Math.floor(ttlMs / 1000));
    await this.client.set(activeKey(key), token, { EX: ttlSeconds });
  }

  async getActiveTokenForKey(key: string): Promise<string | null> {
    await this.connect();
    const v = await this.client.get(activeKey(key));
    return v ?? null;
  }

  async deleteActiveTokenForKey(key: string): Promise<void> {
    await this.connect();
    await this.client.del(activeKey(key));
  }
}

