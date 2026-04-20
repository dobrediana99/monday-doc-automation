import path from "node:path";
import { promises as fs } from "node:fs";
import { MondayClient } from "../monday/mondayClient";
import { GmailService } from "../email/gmailService";
import { SigningService } from "../signing/signingService";
import { signingEmailLanguageFromClientCountry } from "../email/signingEmailLocale";
import { signingPrincipalCcAddresses } from "../email/signingEmailCc";
import {
  buildSignatureRequestEmail,
  buildSignedDocumentDeliveryEmail
} from "../email/signingEmailTemplates";
import {
  CLIENT_COUNTRY_COLUMN_ID,
  EMAIL_SUBJECT_ORDER_ID_COLUMN_ID,
  ORDER_NUMBER_COLUMN_ID,
  parseSigningFlowType,
  declinedLabelForFlow,
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

      const clientCountryRaw = columnTextById[CLIENT_COUNTRY_COLUMN_ID] ?? "";
      const signingEmailLanguage = signingEmailLanguageFromClientCountry(clientCountryRaw);
      const emailOrderId = (columnTextById[EMAIL_SUBJECT_ORDER_ID_COLUMN_ID] ?? "").trim();
      // UX: prefer the configured email identifier; keep a non-empty fallback to avoid blank subjects.
      const fallbackOrderId =
        (columnTextById[ORDER_NUMBER_COLUMN_ID] ?? "").trim().length > 0
          ? (columnTextById[ORDER_NUMBER_COLUMN_ID] ?? "").trim()
          : item.name.trim();
      const signingOrderReference = emailOrderId.length > 0 ? emailOrderId : fallbackOrderId;

      const session = this.signingService.createSession({
        itemId: item.id,
        boardId,
        flowType,
        sourceFileColumnId,
        sourceAssetId: latest.assetId,
        sourcePdfName: latest.name,
        recipientEmail: resolved.email,
        emailSource: resolved.emailSource,
        signingEmailLanguage,
        signingOrderReference
      });

      const signingUrl = `${this.appBaseUrl}/sign/${encodeURIComponent(session.token)}`;
      const invite = buildSignatureRequestEmail({
        language: signingEmailLanguage,
        orderNumber: signingOrderReference,
        signingUrl
      });

      const principalCc = await this.mondayClient.resolvePrincipalCcEmail(item);
      const cc = signingPrincipalCcAddresses(resolved.email, principalCc?.email ?? null);

      await this.gmailService.sendEmail({
        to: resolved.email,
        subject: invite.subject,
        html: invite.html,
        cc
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

      const delivery = buildSignedDocumentDeliveryEmail({
        language: session.signingEmailLanguage,
        orderNumber: session.signingOrderReference
      });

      let cc: string[] | undefined;
      try {
        const itemForCc = await this.mondayClient.getItemById(session.itemId);
        const principalCc = await this.mondayClient.resolvePrincipalCcEmail(itemForCc);
        cc = signingPrincipalCcAddresses(session.recipientEmail, principalCc?.email ?? null);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          JSON.stringify({
            event: "principal_cc_resolution_failed",
            itemId: session.itemId,
            boardId: session.boardId,
            message: message.slice(0, 200)
          })
        );
      }

      await this.gmailService.sendEmailWithPdfAttachment({
        to: session.recipientEmail,
        subject: delivery.subject,
        html: delivery.html,
        pdfBytes,
        attachmentFileName: path.basename(attachmentFileName),
        cc
      });

      this.signingService.markSignedContractEmailSent(params.token);
      console.info(
        JSON.stringify({
          event: "signing_signed_contract_email_sent",
          itemId: session.itemId,
          flowType: session.flowType,
          to: session.recipientEmail,
          principalCcApplied: Boolean(cc?.length)
        })
      );
    } finally {
      this.signedContractEmailInFlight.delete(params.token);
    }
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
