import dayjs from "dayjs";
import type { SigningEmailLanguage } from "../email/signingEmailLocale";
import type { ClientEmailSource, SigningFlowType } from "../utils/mapping";
import type { SigningAuditTrail } from "./auditService";
import {
  type SigningSessionKeyParams,
  InMemorySigningSessionStore,
  type SigningSessionStore,
  generateSigningToken,
  makeSigningSessionKey,
  maskToken
} from "./signingSessionStore";

export interface SigningSession {
  token: string;
  sessionId: string;
  /** "crm_lyc" for sessions initiated from the CRM-LYC adapter; undefined for Monday.com sessions. */
  source?: "crm_lyc";
  itemId: string;
  boardId: string;
  flowType: SigningFlowType;
  sourceFileColumnId: string;
  sourceAssetId: string;
  sourcePdfName: string;
  recipientEmail: string;
  emailSource: ClientEmailSource | "transportator";
  recipientName?: string | null;
  /** Language for signing invite + signed-document delivery (from client country at session start). */
  signingEmailLanguage: SigningEmailLanguage;
  /** Order / transport identifier used in email subjects (from Monday column `pulse_id_mks1dcwz`, with fallback). */
  signingOrderReference: string;
  /** CRM-Lyc entity used for sender mailbox + email language (SRL vs GmbH). */
  generationLegalForm?: "SRL" | "GmbH";
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
  /** Set after the signed PDF is emailed to the session `recipientEmail` (idempotent send guard). */
  signedContractEmailSentAt?: string;
  /** Full name entered on the signing page at submit (trimmed). */
  signerFullName?: string;
}

export class SigningService {
  constructor(
    private readonly ttlMs: number,
    private readonly store: SigningSessionStore = new InMemorySigningSessionStore()
  ) {}

  async createSession(input: {
    itemId: string;
    boardId: string;
    source?: "crm_lyc";
    flowType: SigningFlowType;
    sourceFileColumnId: string;
    sourceAssetId: string;
    sourcePdfName: string;
    recipientEmail: string;
    emailSource: ClientEmailSource | "transportator";
    recipientName?: string | null;
    signingEmailLanguage: SigningEmailLanguage;
    signingOrderReference: string;
    generationLegalForm?: "SRL" | "GmbH";
  }): Promise<SigningSession> {
    const sessionId = crypto.randomUUID();
    const token = generateSigningToken(sessionId);
    const now = Date.now();

    const session: SigningSession = {
      token,
      sessionId,
      ...(input.source ? { source: input.source } : {}),
      itemId: input.itemId,
      boardId: input.boardId,
      flowType: input.flowType,
      sourceFileColumnId: input.sourceFileColumnId,
      sourceAssetId: input.sourceAssetId,
      sourcePdfName: input.sourcePdfName,
      recipientEmail: input.recipientEmail,
      emailSource: input.emailSource,
      recipientName: input.recipientName ?? null,
      signingEmailLanguage: input.signingEmailLanguage,
      signingOrderReference: input.signingOrderReference,
      ...(input.generationLegalForm ? { generationLegalForm: input.generationLegalForm } : {}),
      createdAt: now,
      expiresAt: now + this.ttlMs,
      status: "active"
    };

    try {
      await this.store.createSession(session);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(
        JSON.stringify({
          event: "signing_session_store_create_failed",
          token: maskToken(token),
          itemId: input.itemId,
          message: msg.slice(0, 200)
        })
      );
    }

    try {
      await this.store.setActiveTokenForKey(makeSigningSessionKey(session), token, this.ttlMs);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(
        JSON.stringify({
          event: "signing_session_active_index_set_failed",
          token: maskToken(token),
          itemId: input.itemId,
          message: msg.slice(0, 200)
        })
      );
    }
    console.info(
      JSON.stringify({
        event: "signing_session_created",
        token: maskToken(token),
        itemId: input.itemId,
        boardId: input.boardId,
        flowType: input.flowType,
        expiresAt: dayjs(session.expiresAt).toISOString()
      })
    );
    return session;
  }

  getSessionByToken(token: string): SigningSession | null {
    throw new Error("Use getSessionByTokenAsync in production paths");
  }

  async getSessionByTokenAsync(token: string): Promise<SigningSession | null> {
    const session = await this.store.getSessionByToken(token);
    if (!session) {
      console.info(JSON.stringify({ event: "signing_session_not_found", token: maskToken(token) }));
      return null;
    }
    if (session.expiresAt <= Date.now()) {
      console.info(JSON.stringify({ event: "signing_session_expired", token: maskToken(token), itemId: session.itemId }));
      return null;
    }
    console.info(
      JSON.stringify({
        event: "signing_session_loaded",
        token: maskToken(token),
        itemId: session.itemId,
        status: session.status
      })
    );
    return session;
  }

  async isTokenValid(token: string): Promise<boolean> {
    const session = await this.getSessionByTokenAsync(token);
    return Boolean(session && session.status === "active");
  }

  async getActiveSession(params: SigningSessionKeyParams): Promise<SigningSession | null> {
    const key = makeSigningSessionKey(params);
    const token = await this.store.getActiveTokenForKey(key);
    if (!token) return null;
    const session = await this.getSessionByTokenAsync(token);
    if (!session || session.status !== "active") {
      await this.store.deleteActiveTokenForKey(key).catch(() => undefined);
      return null;
    }
    return session;
  }

  async getAuditTrail(token: string): Promise<SigningAuditTrail> {
    const session = await this.getSessionByTokenAsync(token);
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
      lastError: session.lastError,
      signerFullName: session.signerFullName
    };
  }

  async markViewed(token: string, meta: { ip: string; userAgent: string }): Promise<void> {
    const session = await this.getSessionByTokenAsync(token);
    if (!session) {
      throw new Error("Invalid or expired signing token");
    }
    const patch: Partial<SigningSession> = {
      ipAtView: meta.ip,
      userAgentAtView: meta.userAgent
    };
    if (!session.viewedAt) {
      patch.viewedAt = dayjs().toISOString();
    }
    await this.store.updateSession(token, patch);
  }

  async markConsented(token: string): Promise<void> {
    const session = await this.getSessionByTokenAsync(token);
    if (!session) {
      throw new Error("Invalid or expired signing token");
    }
    if (session.consentedAt) return;
    await this.store.updateSession(token, { consentedAt: dayjs().toISOString() });
  }

  async markSigned(
    token: string,
    meta: {
      ip: string;
      userAgent: string;
      finalSignedFileName: string;
      signedAt?: string;
      signerFullName: string;
    }
  ): Promise<void> {
    const session = await this.getSessionByTokenAsync(token);
    if (!session) {
      throw new Error("Invalid or expired signing token");
    }
    await this.store.updateSession(token, {
      status: "signed",
      signedAt: meta.signedAt ?? dayjs().toISOString(),
      ipAtSign: meta.ip,
      userAgentAtSign: meta.userAgent,
      finalSignedFileName: meta.finalSignedFileName,
      signerFullName: meta.signerFullName
    });
    await this.store.deleteActiveTokenForKey(makeSigningSessionKey(session)).catch(() => undefined);
    console.info(JSON.stringify({ event: "signing_session_signed", token: maskToken(token), itemId: session.itemId }));
  }

  async markRefused(token: string, params: { reason?: string; ip: string; userAgent: string }): Promise<void> {
    const session = await this.getSessionByTokenAsync(token);
    if (!session) {
      throw new Error("Invalid or expired signing token");
    }
    await this.store.updateSession(token, {
      status: "refused",
      refusalReason: params.reason ?? "refused",
      ipAtSign: params.ip,
      userAgentAtSign: params.userAgent
    });
    await this.store.deleteActiveTokenForKey(makeSigningSessionKey(session)).catch(() => undefined);
    console.info(JSON.stringify({ event: "signing_session_refused", token: maskToken(token), itemId: session.itemId }));
  }

  async setSourcePdfHash(token: string, sha256: string): Promise<void> {
    const session = await this.getSessionByTokenAsync(token);
    if (!session) {
      throw new Error("Invalid or expired signing token");
    }
    await this.store.updateSession(token, { sourcePdfHashSha256: sha256 });
  }

  async markError(token: string, message: string): Promise<void> {
    await this.store.updateSession(token, { lastError: message });
  }

  async markSignedContractEmailSent(token: string): Promise<void> {
    await this.store.updateSession(token, { signedContractEmailSentAt: dayjs().toISOString() });
  }
}
