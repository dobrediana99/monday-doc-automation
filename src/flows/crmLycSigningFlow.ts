import path from "node:path";
import { promises as fs } from "node:fs";
import type { CrmLycClient } from "../crmLyc/crmLycClient";
import type { GmailService } from "../email/gmailService";
import type { SigningService } from "../signing/signingService";
import type { PdfService } from "../documents/pdfService";
import { buildSignatureRequestEmail, buildSignedDocumentDeliveryEmail } from "../email/signingEmailTemplates";
import { getEmailLanguage } from "../email/signingEmailLocale";
import { getFromHeader } from "../email/senderSelection";
import { maskToken } from "../signing/signingSessionStore";

const CRM_LYC_STORAGE_BUCKET = "board-files";

const UNSIGNED_COLUMN_CRM_KEY: Record<string, string> = {
  client: "unsigned_client_order",
  furnizor: "unsigned_supplier_order"
};

const RECIPIENT_EMAIL_CRM_KEY: Record<string, string> = {
  client: "client_sign_email",
  furnizor: "supplier_sign_email"
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

    const [fileRef, textValues, unsignedColumnId] = await Promise.all([
      this.crmLycClient.getLatestFileFromColumn(itemId, boardId, unsignedCrmKey),
      this.crmLycClient.getItemTextValuesByCrmKey(itemId, boardId),
      this.crmLycClient.getColumnIdByCrmKey(boardId, unsignedCrmKey)
    ]);

    if (!fileRef) {
      throw new Error(
        `crm-lyc signing: niciun PDF nesemnat in coloana "${unsignedCrmKey}" pentru item ${itemId}`
      );
    }
    if (!unsignedColumnId) {
      throw new Error(`crm-lyc signing: coloana "${unsignedCrmKey}" nu exista pe board ${boardId}`);
    }

    const recipientEmailCrmKey = RECIPIENT_EMAIL_CRM_KEY[template];
    const recipientEmail =
      params.recipientEmail?.trim() ||
      (recipientEmailCrmKey ? textValues[recipientEmailCrmKey]?.trim() : undefined);

    if (!recipientEmail) {
      throw new Error(
        `crm-lyc signing: email destinatar lipsa. Verifica coloana "${recipientEmailCrmKey}" pentru item ${itemId}`
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
      emailSource: template === "furnizor" ? "transportator" : "primary",
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

    await this.gmailService.sendEmail({
      to: recipientEmail,
      from,
      subject: invite.subject,
      html: invite.html,
      pdfAttachment: { bytes: unsignedPdfBytes, fileName: attachmentFileName }
    });

    console.info(
      JSON.stringify({
        event: "crm_lyc_signing_email_sent",
        itemId,
        boardId,
        template,
        recipientEmail,
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

    await this.crmLycClient.uploadFile(
      session.itemId,
      session.sourceFileColumnId,
      params.signedPdfPath,
      signedFileName
    );

    await fs.unlink(params.signedPdfPath).catch(() => undefined);
    if (params.sourcePdfPath) await fs.unlink(params.sourcePdfPath).catch(() => undefined);

    console.info(
      JSON.stringify({
        event: "crm_lyc_signed_document_uploaded",
        itemId: session.itemId,
        columnId: session.sourceFileColumnId,
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

      await this.gmailService.sendEmailWithPdfAttachment({
        to: session.recipientEmail,
        from,
        subject: delivery.subject,
        html: delivery.html,
        pdfBytes,
        attachmentFileName: path.basename(attachmentFileName)
      });

      await this.signingService.markSignedContractEmailSent(params.token);

      console.info(
        JSON.stringify({
          event: "crm_lyc_signed_contract_email_sent",
          itemId: session.itemId,
          to: session.recipientEmail
        })
      );
    } finally {
      this.signedContractEmailInFlight.delete(params.token);
    }
  }
}
