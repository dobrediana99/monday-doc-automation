import path from "node:path";
import { promises as fs } from "node:fs";
import type { CrmLycClient } from "../crmLyc/crmLycClient";
import type { GmailService } from "../email/gmailService";
import type { SigningService } from "../signing/signingService";
import type { PdfService } from "../documents/pdfService";
import { buildSignatureRequestEmail, buildSignedDocumentDeliveryEmail } from "../email/signingEmailTemplates";
import { getEmailLanguage } from "../email/signingEmailLocale";
import { getFromHeader } from "../email/senderSelection";
import { signingPrincipalCcAddresses } from "../email/signingEmailCc";
import type { ClientEmailSource } from "../utils/mapping";
import { maskToken } from "../signing/signingSessionStore";
import { extractFirstAssignedUserId } from "../crmLyc/extractAssignedUserId";

const CRM_LYC_STORAGE_BUCKET = "board-files";

const UNSIGNED_COLUMN_CRM_KEY: Record<string, string> = {
  client: "unsigned_client_order",
  furnizor: "unsigned_supplier_order"
};

const SIGNED_COLUMN_CRM_KEY: Record<string, string> = {
  client: "signed_client_order",
  transportator: "signed_supplier_order"
};

export class CrmLycSigningFlow {
  private readonly signedContractEmailInFlight = new Set<string>();

  constructor(
    private readonly crmLycClient: CrmLycClient,
    private readonly signingService: SigningService,
    private readonly pdfService: PdfService,
    private readonly gmailService: GmailService,
    private readonly appBaseUrl: string
  ) {}

  async startSigning(params: {
    itemId: string;
    boardId: string;
    template: string;
    recipientEmail?: string;
  }): Promise<void> {
    const { itemId, boardId, template } = params;

    const unsignedCrmKey = UNSIGNED_COLUMN_CRM_KEY[template];
    if (!unsignedCrmKey) {
      throw new Error(`crm-lyc signing: unknown template "${template}"`);
    }

    const [fileRef, textValues, unsignedColumnId, assignedRaw] = await Promise.all([
      this.crmLycClient.getLatestFileFromColumn(itemId, boardId, unsignedCrmKey),
      this.crmLycClient.getItemTextValuesByCrmKey(itemId, boardId),
      this.crmLycClient.getColumnIdByCrmKey(boardId, unsignedCrmKey),
      this.crmLycClient.getRawValueByCrmKey(itemId, boardId, "assigned")
    ]);

    const assignedUserId = extractFirstAssignedUserId(assignedRaw);
    let principalEmail: string | null = null;
    if (assignedUserId) {
      principalEmail = await this.crmLycClient.getUserEmail(assignedUserId).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          JSON.stringify({
            event: "crm_lyc_principal_cc_resolution_failed",
            itemId,
            boardId,
            principalUserId: assignedUserId,
            message: message.slice(0, 200)
          })
        );
        return null;
      });
    } else if (assignedRaw != null) {
      console.info(
        JSON.stringify({
          event: "crm_lyc_principal_cc_missing",
          reason: "no_assigned_user_id",
          itemId,
          boardId
        })
      );
    }

    if (!fileRef) {
      throw new Error(
        `crm-lyc signing: niciun PDF nesemnat in coloana "${unsignedCrmKey}" pentru item ${itemId}`
      );
    }
    if (!unsignedColumnId) {
      throw new Error(`crm-lyc signing: coloana "${unsignedCrmKey}" nu exista pe board ${boardId}`);
    }

    let recipientEmail: string;
    let recipientEmailSource: string | undefined;
    let sessionEmailSource: ClientEmailSource | "transportator" = "primary";

    if (template === "furnizor") {
      const resolved = await this.crmLycClient.resolveSupplierRecipientEmail({
        itemId,
        boardId,
        textValues,
        overrideEmail: params.recipientEmail
      });
      if (!resolved) {
        throw new Error(
          `crm-lyc signing: nu există email valid pentru furnizor. Verifică Email Semnare Furnizor sau Email Furnizor pentru item ${itemId}`
        );
      }
      recipientEmail = resolved.email;
      recipientEmailSource = resolved.source;
      sessionEmailSource = "transportator";
      console.info(
        JSON.stringify({
          event: "crm_lyc_supplier_recipient_email_resolved",
          itemId,
          boardId,
          emailSource: resolved.source
        })
      );
    } else {
      const resolved = await this.crmLycClient.resolveClientRecipientEmail({
        itemId,
        boardId,
        textValues,
        overrideEmail: params.recipientEmail
      });
      if (!resolved) {
        throw new Error(
          `crm-lyc signing: nu există email valid pentru client. Verifică Email Semnare Client, Email Contabilitate client sau Email Companie Client pentru item ${itemId}`
        );
      }
      recipientEmail = resolved.email;
      recipientEmailSource = resolved.source;
      sessionEmailSource = resolved.emailSource;
      console.info(
        JSON.stringify({
          event: "crm_lyc_client_recipient_email_resolved",
          itemId,
          boardId,
          emailSource: resolved.source
        })
      );
    }

    const orderRef =
      (textValues["order_number"] || "").trim() ||
      (textValues["transport_status"] || "").trim() ||
      itemId;

    const clientCountry = (textValues["origin_country"] || "").trim();
    const signingEmailLanguage = getEmailLanguage(clientCountry);
    const flowType = template === "furnizor" ? "transportator" : "client";

    const session = await this.signingService.createSession({
      itemId,
      boardId,
      source: "crm_lyc",
      flowType,
      sourceFileColumnId: unsignedColumnId,
      sourceAssetId: fileRef.storagePath,
      sourcePdfName: fileRef.name,
      recipientEmail,
      emailSource: sessionEmailSource,
      signingEmailLanguage,
      signingOrderReference: orderRef
    });

    const signingUrl = `${this.appBaseUrl}/sign/${encodeURIComponent(session.token)}`;

    const unsignedPdfBytes = await this.crmLycClient.downloadFileFromStorage(
      CRM_LYC_STORAGE_BUCKET,
      fileRef.storagePath
    );

    const attachmentFileName = (() => {
      const base = path.basename(fileRef.name || "Comanda.pdf");
      return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
    })();

    const loadingDate = (textValues["pickup_date_text"] || "").trim();
    const loadingCountry = (textValues["origin_country"] || "").trim();
    const unloadingCountry = (textValues["dest_country"] || "").trim();

    const invite = buildSignatureRequestEmail({
      language: signingEmailLanguage,
      flowType,
      orderNumber: orderRef,
      signingUrl,
      clientSource: "",
      loadingDate,
      loadingCountry,
      unloadingCountry
    });

    const from = getFromHeader(clientCountry);

    const cc = signingPrincipalCcAddresses(recipientEmail, principalEmail);

    await this.gmailService.sendEmail({
      to: recipientEmail,
      from,
      subject: invite.subject,
      html: invite.html,
      cc,
      pdfAttachment: { bytes: unsignedPdfBytes, fileName: attachmentFileName }
    });

    console.info(
      JSON.stringify({
        event: "crm_lyc_signing_email_sent",
        itemId,
        boardId,
        template,
        recipientEmail,
        ...(recipientEmailSource ? { recipientEmailSource } : {}),
        cc,
        principalCcApplied: Boolean(cc?.length),
        token: maskToken(session.token)
      })
    );
  }

  async getSourcePdfBytes(token: string): Promise<Buffer> {
    const session = await this.signingService.getSessionByTokenAsync(token);
    if (!session) throw new Error("Invalid or expired signing token");
    return this.crmLycClient.downloadFileFromStorage(CRM_LYC_STORAGE_BUCKET, session.sourceAssetId);
  }

  async markViewedAndUpdateMonday(_params: { token: string }): Promise<void> {
    // No-op for CRM sessions — status updates happen via callback when needed.
  }

  async markRefusedAndUpdateMonday(_params: { token: string }): Promise<void> {
    // No-op for CRM sessions.
  }

  async markSignedAndUpdateMonday(_params: { token: string }): Promise<void> {
    // No-op for CRM sessions.
  }

  async finalizeSignedDocument(params: { token: string; signedPdfPath: string; sourcePdfPath?: string }): Promise<void> {
    const session = await this.signingService.getSessionByTokenAsync(params.token);
    if (!session) throw new Error("Invalid or expired signing session");

    const signedFileName = `${path.basename(session.sourcePdfName, ".pdf")}_signed.pdf`;

    // Upload în coloana dedicată documentelor semnate (Cmd. Client / Cmd. Furnizor)
    const signedCrmKey = SIGNED_COLUMN_CRM_KEY[session.flowType];
    const signedColumnId = signedCrmKey
      ? await this.crmLycClient.getColumnIdByCrmKey(session.boardId, signedCrmKey).catch(() => null)
      : null;

    await this.crmLycClient.uploadFile(
      session.itemId,
      signedColumnId ?? session.sourceFileColumnId,
      params.signedPdfPath,
      signedFileName
    );

    await fs.unlink(params.signedPdfPath).catch(() => undefined);
    if (params.sourcePdfPath) await fs.unlink(params.sourcePdfPath).catch(() => undefined);

    console.info(
      JSON.stringify({
        event: "crm_lyc_signed_document_uploaded",
        itemId: session.itemId,
        columnId: signedColumnId ?? session.sourceFileColumnId,
        fileName: signedFileName
      })
    );
  }

  async sendSignedContractRecipientEmailIfNeeded(params: { token: string; signedPdfPath: string }): Promise<void> {
    if (this.signedContractEmailInFlight.has(params.token)) return;

    const session = await this.signingService.getSessionByTokenAsync(params.token);
    if (!session || session.status !== "signed") {
      throw new Error("Invalid signing session for signed-contract email");
    }
    if (session.signedContractEmailSentAt) return;

    this.signedContractEmailInFlight.add(params.token);
    try {
      const pdfBytes = await fs.readFile(params.signedPdfPath);
      const attachmentFileName =
        session.finalSignedFileName ?? `${path.basename(session.sourcePdfName, ".pdf")}_signed.pdf`;

      const delivery = buildSignedDocumentDeliveryEmail({
        language: session.signingEmailLanguage,
        orderNumber: session.signingOrderReference,
        loadingDate: null,
        loadingCountry: null,
        unloadingCountry: null
      });

      const from = getFromHeader(session.signingEmailLanguage === "ro" ? "Romania" : "CH");

      let cc: string[] | undefined;
      try {
        const assignedRaw = await this.crmLycClient.getRawValueByCrmKey(
          session.itemId,
          session.boardId,
          "assigned"
        );
        const assignedUserId = extractFirstAssignedUserId(assignedRaw);
        const principalEmail = assignedUserId
          ? await this.crmLycClient.getUserEmail(assignedUserId).catch(() => null)
          : null;
        cc = signingPrincipalCcAddresses(session.recipientEmail, principalEmail);
      } catch {
        // Email still sends to recipient without CC.
      }

      await this.gmailService.sendEmailWithPdfAttachment({
        to: session.recipientEmail,
        from,
        subject: delivery.subject,
        html: delivery.html,
        pdfBytes,
        attachmentFileName: path.basename(attachmentFileName),
        cc
      });

      await this.signingService.markSignedContractEmailSent(params.token);

      console.info(
        JSON.stringify({
          event: "crm_lyc_signed_contract_email_sent",
          itemId: session.itemId,
          to: session.recipientEmail,
          principalCcApplied: Boolean(cc?.length)
        })
      );
    } finally {
      this.signedContractEmailInFlight.delete(params.token);
    }
  }
}
