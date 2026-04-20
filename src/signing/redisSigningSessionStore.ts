import { createClient } from "redis";
import type { SigningSession } from "./signingService";
import type { SigningSessionStore } from "./signingSessionStore";

type RedisLike = {
  isOpen: boolean;
  connect: () => Promise<unknown>;
  quit: () => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, opts?: { EX?: number }) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
  on: (event: string, handler: (...args: any[]) => void) => unknown;
};

export class RedisSigningSessionStore implements SigningSessionStore {
  private readonly client: RedisLike;
  private readonly prefix: string;

  constructor(params: {
    redisUrl: string;
    prefix?: string;
    connectTimeoutMs?: number;
    client?: RedisLike;
  }) {
    this.prefix = (params.prefix ?? "signing").trim();
    this.client =
      params.client ??
      createClient({
        url: params.redisUrl,
        socket: {
          connectTimeout: params.connectTimeoutMs ?? 5000,
          // Keep retries bounded so Cloud Run startup doesn't hang forever.
          reconnectStrategy: (retries) => (retries >= 5 ? new Error("redis_reconnect_retries_exceeded") : 250)
        }
      }) as unknown as RedisLike;
    this.client.on("error", (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ event: "signing_redis_error", message: msg.slice(0, 200) }));
    });
  }

  private sessionKey(token: string): string {
    return `${this.prefix}:sess:${token}`;
  }

  private activeKey(key: string): string {
    return `${this.prefix}:active:${key}`;
  }

  async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  async close(): Promise<void> {
    // Quit closes cleanly and flushes pending commands.
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  async createSession(session: SigningSession): Promise<void> {
    await this.connect();
    const ttlSeconds = Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000));
    await this.client.set(this.sessionKey(session.token), JSON.stringify(session), { EX: ttlSeconds });
  }

  async getSessionByToken(token: string): Promise<SigningSession | null> {
    await this.connect();
    const raw = await this.client.get(this.sessionKey(token));
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
    await this.client.set(this.sessionKey(token), JSON.stringify(next), { EX: ttlSeconds });
  }

  async deleteSession(token: string): Promise<void> {
    await this.connect();
    await this.client.del(this.sessionKey(token));
  }

  async setActiveTokenForKey(key: string, token: string, ttlMs: number): Promise<void> {
    await this.connect();
    const ttlSeconds = Math.max(1, Math.floor(ttlMs / 1000));
    await this.client.set(this.activeKey(key), token, { EX: ttlSeconds });
  }

  async getActiveTokenForKey(key: string): Promise<string | null> {
    await this.connect();
    const v = await this.client.get(this.activeKey(key));
    return v ?? null;
  }

  async deleteActiveTokenForKey(key: string): Promise<void> {
    await this.connect();
    await this.client.del(this.activeKey(key));
  }
}

