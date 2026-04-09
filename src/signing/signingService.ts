import crypto from "node:crypto";
import dayjs from "dayjs";
import type { ClientEmailSource, SigningFlowType } from "../utils/mapping";
import type { SigningAuditTrail } from "./auditService";

export interface SigningSession {
  token: string;
  sessionId: string;
  itemId: string;
  boardId: string;
  flowType: SigningFlowType;
  sourceFileColumnId: string;
  sourceAssetId: string;
  sourcePdfName: string;
  recipientEmail: string;
  emailSource: ClientEmailSource | "transportator";
  recipientName?: string | null;
  createdAt: number;
  expiresAt: number;
  status: "active" | "signed" | "refused";
  consentedAt?: string;
  viewedAt?: string;
  signedAt?: string;
  ipAtView?: string;
  ipAtSign?: string;
  userAgentAtView?: string;
  userAgentAtSign?: string;
  sourcePdfHashSha256?: string;
  finalSignedFileName?: string;
  refusalReason?: string;
  lastError?: string;
}

export class SigningService {
  private readonly sessions = new Map<string, SigningSession>();

  constructor(private readonly ttlMs: number) {}

  createSession(input: {
    itemId: string;
    boardId: string;
    flowType: SigningFlowType;
    sourceFileColumnId: string;
    sourceAssetId: string;
    sourcePdfName: string;
    recipientEmail: string;
    emailSource: ClientEmailSource | "transportator";
    recipientName?: string | null;
  }): SigningSession {
    this.cleanupExpired();

    const sessionId = crypto.randomUUID();
    const token = `${sessionId}-${crypto.randomBytes(24).toString("hex")}`;
    const now = Date.now();

    const session: SigningSession = {
      token,
      sessionId,
      itemId: input.itemId,
      boardId: input.boardId,
      flowType: input.flowType,
      sourceFileColumnId: input.sourceFileColumnId,
      sourceAssetId: input.sourceAssetId,
      sourcePdfName: input.sourcePdfName,
      recipientEmail: input.recipientEmail,
      emailSource: input.emailSource,
      recipientName: input.recipientName ?? null,
      createdAt: now,
      expiresAt: now + this.ttlMs,
      status: "active"
    };

    this.sessions.set(token, session);
    return session;
  }

  getSessionByToken(token: string): SigningSession | null {
    this.cleanupExpired();
    const session = this.sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      this.sessions.delete(token);
      return null;
    }

    return session;
  }

  getAuditTrail(token: string): SigningAuditTrail {
    const session = this.getSessionByToken(token);
    if (!session) {
      throw new Error("Invalid or expired signing token");
    }
    return {
      boardId: session.boardId,
      itemId: session.itemId,
      flowType: session.flowType,
      sourceFileColumnId: session.sourceFileColumnId,
      sourceAssetId: session.sourceAssetId,
      sourceFileName: session.sourcePdfName,
      sourcePdfHashSha256: session.sourcePdfHashSha256,
      recipientEmail: session.recipientEmail,
      recipientName: session.recipientName ?? null,
      sentAt: dayjs(session.createdAt).toISOString(),
      viewedAt: session.viewedAt,
      consentedAt: session.consentedAt,
      signedAt: session.signedAt,
      ipAtView: session.ipAtView,
      ipAtSign: session.ipAtSign,
      userAgentAtView: session.userAgentAtView,
      userAgentAtSign: session.userAgentAtSign,
      sessionId: session.sessionId,
      tokenExpiresAt: dayjs(session.expiresAt).toISOString(),
      finalSignedFileName: session.finalSignedFileName,
      refusalReason: session.refusalReason,
      lastError: session.lastError
    };
  }

  markViewed(token: string, meta: { ip: string; userAgent: string }): void {
    const session = this.getSessionByToken(token);
    if (!session) {
      throw new Error("Invalid or expired signing token");
    }
    if (!session.viewedAt) {
      session.viewedAt = dayjs().toISOString();
    }
    session.ipAtView = meta.ip;
    session.userAgentAtView = meta.userAgent;
  }

  markConsented(token: string): void {
    const session = this.getSessionByToken(token);
    if (!session) {
      throw new Error("Invalid or expired signing token");
    }
    if (!session.consentedAt) {
      session.consentedAt = dayjs().toISOString();
    }
  }

  markSigned(token: string, meta: { ip: string; userAgent: string; finalSignedFileName: string }): void {
    const session = this.getSessionByToken(token);
    if (!session) {
      throw new Error("Invalid or expired signing token");
    }
    session.status = "signed";
    session.signedAt = dayjs().toISOString();
    session.ipAtSign = meta.ip;
    session.userAgentAtSign = meta.userAgent;
    session.finalSignedFileName = meta.finalSignedFileName;
  }

  markRefused(token: string, params: { reason?: string; ip: string; userAgent: string }): void {
    const session = this.getSessionByToken(token);
    if (!session) {
      throw new Error("Invalid or expired signing token");
    }
    session.status = "refused";
    session.refusalReason = params.reason ?? "refused";
    session.ipAtSign = params.ip;
    session.userAgentAtSign = params.userAgent;
  }

  setSourcePdfHash(token: string, sha256: string): void {
    const session = this.getSessionByToken(token);
    if (!session) {
      throw new Error("Invalid or expired signing token");
    }
    session.sourcePdfHashSha256 = sha256;
  }

  markError(token: string, message: string): void {
    const session = this.getSessionByToken(token);
    if (!session) {
      return;
    }
    session.lastError = message;
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
