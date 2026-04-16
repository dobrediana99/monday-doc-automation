import path from "node:path";
import { promises as fs } from "node:fs";
import { MondayClient } from "../monday/mondayClient";
import { GmailService } from "../email/gmailService";
import { SigningService } from "../signing/signingService";
import {
  parseSigningFlowType,
  declinedLabelForFlow,
  recipientDisplayNameFromColumns,
  resolveRecipientEmail,
  SIGN_ERROR_LABEL,
  SIGN_ERROR_TEXT_COLUMN,
  SIGN_FLOW_STATUS_COLUMN,
  SIGN_OUTPUT_FILE_COLUMN,
  SIGN_PROCESSING_LABEL,
  SIGN_SOURCE_FILE_COLUMN,
  SIGN_TRIGGER_COLUMN,
  SIGN_REFUSED_LABEL,
  SIGN_SIGNED_LABEL,
  SIGN_VIEWED_LABEL,
  type SigningFlowType,
  viewedLabelForFlow
} from "../utils/mapping";

export class SigningFlow {
  private readonly signedContractEmailInFlight = new Set<string>();

  constructor(
    private readonly mondayClient: MondayClient,
    private readonly signingService: SigningService,
    private readonly gmailService: GmailService,
    private readonly appBaseUrl: string
  ) {}

  async startSigning(itemId: string, selectedValue: string): Promise<void> {
    const flowType = parseSigningFlowType(selectedValue);
    if (!flowType) {
      throw new Error(`Unsupported signing trigger value: ${selectedValue}`);
    }

    let boardIdForError: string | null = null;
    try {
      const item = await this.mondayClient.getItemById(itemId);
      const boardId = item.board.id;
      boardIdForError = boardId;

      const columnTextById = this.mondayClient.getColumnTextById(item);
      const existingFlowStatus = (columnTextById[SIGN_FLOW_STATUS_COLUMN[flowType]] ?? "").trim();

      if (existingFlowStatus === "Completed") {
        console.info(
          JSON.stringify({
            event: "signing_restart_after_completed",
            itemId,
            boardId,
            flowType,
            previousFlowStatus: existingFlowStatus
          })
        );
      }

      const sourceFileColumnId = SIGN_SOURCE_FILE_COLUMN[flowType];
      const latest = await this.mondayClient.resolveLatestFileAssetFromFileColumn(item, sourceFileColumnId);
      if (!latest) {
        throw new Error(
          `Nu exista niciun PDF nesemnat in coloana ${sourceFileColumnId}. Genereaza documentul si reincerca.`
        );
      }

      const resolved = resolveRecipientEmail({ flowType, itemColumnTextById: columnTextById });
      if (!resolved) {
        throw new Error("Nu am putut determina email-ul destinatarului pentru semnare (verifica coloanele email).");
      }

      const existingSession = this.signingService.getActiveSession({
        itemId: item.id,
        flowType,
        sourceAssetId: latest.assetId,
        recipientEmail: resolved.email
      });
      if (existingSession) {
        console.info(
          JSON.stringify({
            event: "signing_start_skipped_active_existing_session",
            itemId,
            boardId,
            flowType,
            previousFlowStatus: existingFlowStatus
          })
        );
        return;
      }

      console.info(
        JSON.stringify({
          event: existingFlowStatus === "Completed"
            ? "signing_restart_after_completed"
            : existingFlowStatus.length > 0
              ? "signing_restart_after_expired_session"
              : "signing_start_new_session",
          itemId,
          boardId,
          flowType,
          previousFlowStatus: existingFlowStatus
        })
      );

      // Only now set main trigger status to Procesare
      await this.mondayClient.updateStatus(boardId, item.id, SIGN_TRIGGER_COLUMN, SIGN_PROCESSING_LABEL);

      const recipientName = recipientDisplayNameFromColumns(columnTextById);

      const session = this.signingService.createSession({
        itemId: item.id,
        boardId,
        flowType,
        sourceFileColumnId,
        sourceAssetId: latest.assetId,
        sourcePdfName: latest.name,
        recipientEmail: resolved.email,
        emailSource: resolved.emailSource,
        recipientName
      });

      const signingUrl = `${this.appBaseUrl}/sign/${encodeURIComponent(session.token)}`;

      await this.gmailService.sendEmail({
        to: resolved.email,
        subject: "Document pentru semnare / Document ready for signature",
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.5;">
            <h2 style="margin: 0 0 12px 0;">Semnare document</h2>
            <p>Buna${recipientName ? `, ${recipientName}` : ""},</p>
            <p>Te rugam sa semnezi electronic documentul folosind linkul securizat de mai jos:</p>
            <p><a href="${signingUrl}">${signingUrl}</a></p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
            <p style="margin: 0;">EN: Please electronically sign the document using the secure link above.</p>
          </div>
        `
      });

      // On email successfully sent
      await this.mondayClient.updateStatus(boardId, item.id, SIGN_FLOW_STATUS_COLUMN[flowType], "Sent");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Signing flow failed";
      if (boardIdForError) {
        await this.mondayClient.updateText(boardIdForError, itemId, SIGN_ERROR_TEXT_COLUMN, message).catch(() => undefined);
        await this.mondayClient.updateStatus(boardIdForError, itemId, SIGN_TRIGGER_COLUMN, SIGN_ERROR_LABEL).catch(() => undefined);
      }
      throw error;
    }
  }

  /**
   * Emails the final signed PDF to {@link SigningSession.recipientEmail} (same address used for the signing invite).
   * Idempotent per session: skips if already sent or while another send for this token is in progress.
   */
  async sendSignedContractRecipientEmailIfNeeded(params: { token: string; signedPdfPath: string }): Promise<void> {
    if (this.signedContractEmailInFlight.has(params.token)) {
      console.info(
        JSON.stringify({
          event: "signing_signed_contract_email_skipped_in_flight",
          token: params.token
        })
      );
      return;
    }

    const session = this.signingService.getSessionByToken(params.token);
    if (!session || session.status !== "signed") {
      throw new Error("Invalid signing session for signed-contract email");
    }
    if (session.signedContractEmailSentAt) {
      console.info(
        JSON.stringify({
          event: "signing_signed_contract_email_skipped_already_sent",
          itemId: session.itemId,
          flowType: session.flowType
        })
      );
      return;
    }

    this.signedContractEmailInFlight.add(params.token);
    try {
      const pdfBytes = await fs.readFile(params.signedPdfPath);
      const attachmentFileName =
        session.finalSignedFileName ?? `${path.basename(session.sourcePdfName, ".pdf")}_signed.pdf`;
      const safeTitle = this.escapeHtml(path.basename(attachmentFileName));

      await this.gmailService.sendEmailWithPdfAttachment({
        to: session.recipientEmail,
        subject: `Contract semnat - ${path.basename(attachmentFileName)}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.5;">
            <p>Buna ziua,</p>
            <p>Va trimitem atasat documentul semnat${safeTitle ? ` (<strong>${safeTitle}</strong>)` : ""}.</p>
            <p>O zi buna!</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
            <p style="margin: 0; font-size: 12px; color: #555;">EN: Please find the signed contract attached.</p>
          </div>
        `,
        pdfBytes,
        attachmentFileName: path.basename(attachmentFileName)
      });

      this.signingService.markSignedContractEmailSent(params.token);
      console.info(
        JSON.stringify({
          event: "signing_signed_contract_email_sent",
          itemId: session.itemId,
          flowType: session.flowType,
          to: session.recipientEmail
        })
      );
    } finally {
      this.signedContractEmailInFlight.delete(params.token);
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async finalizeSignedDocument(params: {
    token: string;
    signedPdfPath: string;
    sourcePdfPath?: string;
  }): Promise<void> {
    const session = this.signingService.getSessionByToken(params.token);
    if (!session) {
      throw new Error("Invalid or expired signing session");
    }

    const uploadColumn = SIGN_OUTPUT_FILE_COLUMN[session.flowType];

    await this.mondayClient.uploadFile(
      session.itemId,
      uploadColumn,
      params.signedPdfPath,
      `${path.basename(session.sourcePdfName, ".pdf")}_signed.pdf`
    );

    await fs.unlink(params.signedPdfPath).catch(() => undefined);
    if (params.sourcePdfPath) {
      await fs.unlink(params.sourcePdfPath).catch(() => undefined);
    }
  }

  async downloadSourcePdfToTmp(token: string): Promise<string> {
    const session = this.signingService.getSessionByToken(token);
    if (!session) {
      throw new Error("Invalid or expired signing token");
    }

    const bytes = await this.mondayClient.downloadAssetBytes(session.sourceAssetId);

    const outPath = `/tmp/${Date.now()}-${session.itemId}-source.pdf`;
    await fs.writeFile(outPath, bytes);
    return outPath;
  }

  async getSourcePdfBytes(token: string): Promise<Buffer> {
    const session = this.signingService.getSessionByToken(token);
    if (!session) {
      throw new Error("Invalid or expired signing token");
    }
    return await this.mondayClient.downloadAssetBytes(session.sourceAssetId);
  }

  async markViewedAndUpdateMonday(params: {
    token: string;
  }): Promise<void> {
    const session = this.signingService.getSessionByToken(params.token);
    if (!session) {
      throw new Error("Invalid or expired signing token");
    }
    await this.mondayClient.updateStatus(session.boardId, session.itemId, SIGN_TRIGGER_COLUMN, SIGN_VIEWED_LABEL);
    const viewedLabel = viewedLabelForFlow({ flowType: session.flowType, emailSource: session.emailSource });
    await this.mondayClient.updateStatusIfLabelExists(session.boardId, session.itemId, SIGN_FLOW_STATUS_COLUMN[session.flowType], viewedLabel);
  }

  async markRefusedAndUpdateMonday(params: { token: string }): Promise<void> {
    const session = this.signingService.getSessionByToken(params.token);
    if (!session) {
      throw new Error("Invalid or expired signing token");
    }
    await this.mondayClient.updateStatus(session.boardId, session.itemId, SIGN_TRIGGER_COLUMN, SIGN_REFUSED_LABEL);
    const declinedLabel = declinedLabelForFlow({ flowType: session.flowType, emailSource: session.emailSource });
    await this.mondayClient.updateStatusIfLabelExists(
      session.boardId,
      session.itemId,
      SIGN_FLOW_STATUS_COLUMN[session.flowType],
      declinedLabel
    );
  }

  async markSignedAndUpdateMonday(params: { token: string }): Promise<void> {
    const session = this.signingService.getSessionByToken(params.token);
    if (!session) {
      throw new Error("Invalid or expired signing token");
    }
    await this.mondayClient.updateStatus(session.boardId, session.itemId, SIGN_TRIGGER_COLUMN, SIGN_SIGNED_LABEL);
    await this.mondayClient.updateStatus(session.boardId, session.itemId, SIGN_FLOW_STATUS_COLUMN[session.flowType], "Completed");
  }
}
