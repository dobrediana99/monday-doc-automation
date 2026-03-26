import axios from "axios";
import path from "node:path";
import { promises as fs } from "node:fs";
import { MondayClient, type MondayItem } from "../monday/mondayClient";
import { GmailService } from "../email/gmailService";
import { SigningService } from "../signing/signingService";
import {
  extractEmailByVariant,
  getLinkColumn,
  getSignedFileColumn,
  getSignedStatusColumn,
  getUploadPdfColumn
} from "../utils/mapping";

function toModel(item: MondayItem): Record<string, unknown> {
  const model: Record<string, unknown> = {};
  for (const col of item.column_values) {
    model[col.id] = col.text ?? "";
  }
  return model;
}

export class SigningFlow {
  constructor(
    private readonly mondayClient: MondayClient,
    private readonly signingService: SigningService,
    private readonly gmailService: GmailService,
    private readonly appBaseUrl: string
  ) {}

  async startSigning(itemId: string, selectedValue: string): Promise<void> {
    const item = await this.mondayClient.getItemById(itemId);
    const sourceColumn = getUploadPdfColumn(selectedValue);

    const pdfAsset = await this.findPdfForColumn(item, sourceColumn);
    if (!pdfAsset) {
      throw new Error(`PDF missing in column ${sourceColumn}; generate it first`);
    }

    const model = toModel(item);
    const recipient = extractEmailByVariant(selectedValue, model);
    if (!recipient) {
      throw new Error("Recipient email not found in mapped column values");
    }

    const session = this.signingService.createSession({
      itemId: item.id,
      boardId: item.board.id,
      variant: selectedValue,
      sourcePdfAssetUrl: pdfAsset.public_url || pdfAsset.url,
      sourcePdfName: pdfAsset.name,
      recipientEmail: recipient
    });

    const signingUrl = `${this.appBaseUrl}/sign/${encodeURIComponent(session.token)}`;

    await this.mondayClient.updateLink(
      item.board.id,
      item.id,
      getLinkColumn(selectedValue),
      signingUrl,
      "Open signing page"
    );

    await this.gmailService.sendEmail({
      to: recipient,
      subject: "Document ready for signature",
      html: `<p>Please sign your document using this secure link:</p><p><a href="${signingUrl}">${signingUrl}</a></p>`
    });
  }

  async finalizeSignedDocument(params: {
    token: string;
    signedPdfPath: string;
    sourcePdfPath?: string;
  }): Promise<void> {
    const session = this.signingService.getSession(params.token);
    if (!session) {
      throw new Error("Invalid or expired signing session");
    }

    const uploadColumn = getSignedFileColumn(session.variant);
    const statusColumn = getSignedStatusColumn(session.variant);

    await this.mondayClient.uploadFile(
      session.itemId,
      uploadColumn,
      params.signedPdfPath,
      `${path.basename(session.sourcePdfName, ".pdf")}_signed.pdf`
    );

    await this.mondayClient.updateStatus(session.boardId, session.itemId, statusColumn, "Signed");

    await fs.unlink(params.signedPdfPath).catch(() => undefined);
    if (params.sourcePdfPath) {
      await fs.unlink(params.sourcePdfPath).catch(() => undefined);
    }
  }

  async downloadSourcePdf(token: string): Promise<string> {
    const session = this.signingService.getSession(token);
    if (!session) {
      throw new Error("Invalid or expired signing token");
    }

    const response = await axios.get<ArrayBuffer>(session.sourcePdfAssetUrl, {
      responseType: "arraybuffer",
      timeout: 20_000
    });

    const outPath = `/tmp/${Date.now()}-${session.itemId}-source.pdf`;
    await fs.writeFile(outPath, Buffer.from(response.data));
    return outPath;
  }

  private async findPdfForColumn(
    item: MondayItem,
    columnId: string
  ): Promise<{ name: string; url: string; public_url: string } | null> {
    const column = item.column_values.find((c) => c.id === columnId);
    if (!column?.value) {
      return null;
    }

    try {
      const parsed = JSON.parse(column.value) as {
        files?: Array<{ assetId: number }>;
      };
      const lastAssetId = parsed.files?.[parsed.files.length - 1]?.assetId;
      if (!lastAssetId) {
        return null;
      }

      const asset = item.assets.find((a) => Number(a.id) === Number(lastAssetId));
      return asset ? { name: asset.name, url: asset.url, public_url: asset.public_url } : null;
    } catch {
      return null;
    }
  }
}
