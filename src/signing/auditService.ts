import type { SigningFlowType } from "../utils/mapping";

export type AuditEventType =
  | "SENT"
  | "VIEWED"
  | "CONSENTED"
  | "SIGNED"
  | "REFUSED"
  | "ERROR";

export interface SigningAuditTrail {
  boardId: string;
  itemId: string;
  flowType: SigningFlowType;
  sourceFileColumnId: string;
  sourceAssetId: string;
  sourceFileName: string;
  sourcePdfHashSha256?: string;
  recipientEmail: string;
  recipientName?: string | null;
  sentAt?: string;
  viewedAt?: string;
  consentedAt?: string;
  signedAt?: string;
  ipAtView?: string;
  ipAtSign?: string;
  userAgentAtView?: string;
  userAgentAtSign?: string;
  sessionId: string;
  tokenExpiresAt: string;
  finalSignedFileName?: string;
  refusalReason?: string;
  lastError?: string;
}

export class AuditService {
  buildAuditLines(trail: SigningAuditTrail): string[] {
    const lines: string[] = [];
    lines.push("CLS signing workflow audit trail");
    lines.push(`Session: ${trail.sessionId}`);
    lines.push(`Board: ${trail.boardId} | Item: ${trail.itemId}`);
    lines.push(`Flow: ${trail.flowType}`);
    lines.push(`Recipient: ${trail.recipientEmail}${trail.recipientName ? ` (${trail.recipientName})` : ""}`);
    lines.push(`Token expires: ${trail.tokenExpiresAt}`);
    lines.push(`Source: ${trail.sourceFileName} (asset ${trail.sourceAssetId}, column ${trail.sourceFileColumnId})`);
    if (trail.sourcePdfHashSha256) {
      lines.push(`Source PDF SHA-256: ${trail.sourcePdfHashSha256}`);
    }
    if (trail.sentAt) lines.push(`Sent at: ${trail.sentAt}`);
    if (trail.viewedAt) lines.push(`Viewed at: ${trail.viewedAt} | IP: ${trail.ipAtView ?? "n/a"} | UA: ${trail.userAgentAtView ?? "n/a"}`);
    if (trail.consentedAt) lines.push(`Consented at: ${trail.consentedAt}`);
    if (trail.signedAt) lines.push(`Signed at: ${trail.signedAt} | IP: ${trail.ipAtSign ?? "n/a"} | UA: ${trail.userAgentAtSign ?? "n/a"}`);
    if (trail.finalSignedFileName) lines.push(`Signed file: ${trail.finalSignedFileName}`);
    if (trail.refusalReason) lines.push(`Refused: ${trail.refusalReason}`);
    if (trail.lastError) lines.push(`Last error: ${trail.lastError}`);
    return lines;
  }
}
