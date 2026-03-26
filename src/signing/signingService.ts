import crypto from "node:crypto";
import dayjs from "dayjs";
import type { AuditEvent } from "./auditService";

export interface SigningSession {
  token: string;
  itemId: string;
  boardId: string;
  variant: string;
  sourcePdfAssetUrl: string;
  sourcePdfName: string;
  recipientEmail: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
  audit: AuditEvent[];
}

export class SigningService {
  private readonly sessions = new Map<string, SigningSession>();

  constructor(private readonly ttlMs: number) {}

  createSession(input: {
    itemId: string;
    boardId: string;
    variant: string;
    sourcePdfAssetUrl: string;
    sourcePdfName: string;
    recipientEmail: string;
  }): SigningSession {
    this.cleanupExpired();

    const token = `${crypto.randomUUID()}-${crypto.randomBytes(24).toString("hex")}`;
    const now = Date.now();

    const session: SigningSession = {
      token,
      itemId: input.itemId,
      boardId: input.boardId,
      variant: input.variant,
      sourcePdfAssetUrl: input.sourcePdfAssetUrl,
      sourcePdfName: input.sourcePdfName,
      recipientEmail: input.recipientEmail,
      createdAt: now,
      expiresAt: now + this.ttlMs,
      used: false,
      audit: []
    };

    this.sessions.set(token, session);
    return session;
  }

  getSession(token: string): SigningSession | null {
    this.cleanupExpired();
    const session = this.sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      this.sessions.delete(token);
      return null;
    }

    return session;
  }

  appendAudit(token: string, event: Omit<AuditEvent, "timestamp">): void {
    const session = this.getSession(token);
    if (!session) {
      throw new Error("Invalid or expired signing token");
    }

    session.audit.push({
      ...event,
      timestamp: dayjs().toISOString()
    });
  }

  markUsed(token: string): void {
    const session = this.getSession(token);
    if (!session) {
      throw new Error("Invalid or expired signing token");
    }
    session.used = true;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [token, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(token);
      }
    }
  }
}
