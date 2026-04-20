import crypto from "node:crypto";
import type { SigningSession } from "./signingService";
import type { SigningFlowType } from "../utils/mapping";

export type SigningSessionKeyParams = {
  itemId: string;
  flowType: SigningFlowType;
  sourceAssetId: string;
  recipientEmail: string;
};

export function makeSigningSessionKey(params: SigningSessionKeyParams): string {
  return `${params.itemId}:${params.flowType}:${params.sourceAssetId}:${params.recipientEmail.toLowerCase()}`;
}

export function maskToken(token: string): string {
  if (!token) return "";
  if (token.length <= 10) return token.slice(0, 2) + "***";
  return `${token.slice(0, 6)}***${token.slice(-4)}`;
}

export interface SigningSessionStore {
  createSession(session: SigningSession): Promise<void>;
  getSessionByToken(token: string): Promise<SigningSession | null>;
  updateSession(token: string, patch: Partial<SigningSession>): Promise<void>;
  deleteSession(token: string): Promise<void>;

  setActiveTokenForKey(key: string, token: string, ttlMs: number): Promise<void>;
  getActiveTokenForKey(key: string): Promise<string | null>;
  deleteActiveTokenForKey(key: string): Promise<void>;
}

/**
 * In-memory store. Useful for tests and local dev.
 * NOT safe for multi-instance or restarts (unless the same instance is reused).
 */
export class InMemorySigningSessionStore implements SigningSessionStore {
  private readonly sessions = new Map<string, SigningSession>();
  private readonly activeIndex = new Map<string, { token: string; expiresAt: number }>();

  async createSession(session: SigningSession): Promise<void> {
    this.sessions.set(session.token, session);
  }

  async getSessionByToken(token: string): Promise<SigningSession | null> {
    const s = this.sessions.get(token);
    if (!s) return null;
    if (s.expiresAt <= Date.now()) {
      this.sessions.delete(token);
      return null;
    }
    return s;
  }

  async updateSession(token: string, patch: Partial<SigningSession>): Promise<void> {
    const s = await this.getSessionByToken(token);
    if (!s) return;
    Object.assign(s, patch);
  }

  async deleteSession(token: string): Promise<void> {
    this.sessions.delete(token);
  }

  async setActiveTokenForKey(key: string, token: string, ttlMs: number): Promise<void> {
    this.activeIndex.set(key, { token, expiresAt: Date.now() + ttlMs });
  }

  async getActiveTokenForKey(key: string): Promise<string | null> {
    const v = this.activeIndex.get(key);
    if (!v) return null;
    if (v.expiresAt <= Date.now()) {
      this.activeIndex.delete(key);
      return null;
    }
    return v.token;
  }

  async deleteActiveTokenForKey(key: string): Promise<void> {
    this.activeIndex.delete(key);
  }
}

export function generateSigningToken(sessionId: string): string {
  return `${sessionId}-${crypto.randomBytes(24).toString("hex")}`;
}

