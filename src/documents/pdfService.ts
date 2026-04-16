import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { SigningAuditTrail } from "../signing/auditService";

const execFileAsync = promisify(execFile);

export interface SignaturePlacement {
  /** PDF points (origin bottom-left) */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Tunable placement for the visible signature on the last page of the source PDF (origin bottom-left).
 * Increase `minMarginBottom` / `marginBottomRatio` to move the box upward.
 */
export const LAST_PAGE_SIGNATURE_BOX_LAYOUT = {
  minWidth: 160,
  widthRatio: 0.28,
  minHeight: 70,
  heightRatio: 0.11,
  minMarginRight: 40,
  marginRightRatio: 0.06,
  minMarginBottom: 130,
  marginBottomRatio: 0.16
} as const;

export function computeLastPageSignaturePlacement(pageSize: { width: number; height: number }): SignaturePlacement {
  const { width, height } = pageSize;
  const L = LAST_PAGE_SIGNATURE_BOX_LAYOUT;
  const boxWidth = Math.max(L.minWidth, width * L.widthRatio);
  const boxHeight = Math.max(L.minHeight, height * L.heightRatio);
  const marginRight = Math.max(L.minMarginRight, width * L.marginRightRatio);
  const marginBottom = Math.max(L.minMarginBottom, height * L.marginBottomRatio);
  return {
    x: width - marginRight - boxWidth,
    y: marginBottom,
    width: boxWidth,
    height: boxHeight
  };
}

export class PdfService {
  sha256Hex(buffer: Buffer): string {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  async convertDocxToPdf(docxPath: string): Promise<string> {
    const outDir = "/tmp";
    await execFileAsync("soffice", [
      "--headless",
      "--convert-to",
      "pdf",
      "--outdir",
      outDir,
      docxPath
    ]);

    const pdfPath = path.join(outDir, `${path.basename(docxPath, path.extname(docxPath))}.pdf`);
    await fs.access(pdfPath);
    return pdfPath;
  }

  async generateSignedPdf(inputPdfPath: string, signaturePngBase64: string, auditTrail: SigningAuditTrail): Promise<string> {
    const pdfBytes = await fs.readFile(inputPdfPath);
    return this.generateSignedPdfFromBytes(pdfBytes, signaturePngBase64, auditTrail);
  }

  async generateSignedPdfFromBytes(sourcePdfBytes: Buffer, signaturePngBase64: string, auditTrail: SigningAuditTrail): Promise<string> {
    const pdfDoc = await PDFDocument.load(sourcePdfBytes);

    const signatureRaw = signaturePngBase64.replace(/^data:image\/png;base64,/, "");
    const signatureImage = await pdfDoc.embedPng(Buffer.from(signatureRaw, "base64"));
    const pages = pdfDoc.getPages();
    if (pages.length === 0) {
      throw new Error("Source PDF has no pages");
    }

    const lastPage = pages[pages.length - 1];
    const signatureBox = computeLastPageSignaturePlacement(lastPage.getSize());
    this.drawSignatureIntoBox(lastPage, signatureImage, signatureBox);

    await this.appendStyledAuditPage(pdfDoc, auditTrail);

    const outputPath = path.join("/tmp", `${Date.now()}-signed.pdf`);
    await fs.writeFile(outputPath, await pdfDoc.save({ useObjectStreams: false }));
    return outputPath;
  }

  private drawSignatureIntoBox(
    page: { drawImage: Function; getSize: () => { width: number; height: number } },
    signatureImage: { width: number; height: number },
    box: SignaturePlacement
  ): void {
    // Fit signature into box while preserving aspect ratio.
    const imgAspect = signatureImage.width / signatureImage.height;
    const boxAspect = box.width / box.height;
    let drawW = box.width;
    let drawH = box.height;
    if (imgAspect > boxAspect) {
      drawH = box.width / imgAspect;
    } else {
      drawW = box.height * imgAspect;
    }
    const x = box.x + (box.width - drawW) / 2;
    const y = box.y + (box.height - drawH) / 2;
    page.drawImage(signatureImage as any, { x, y, width: drawW, height: drawH });
  }

  private async appendStyledAuditPage(pdfDoc: PDFDocument, trail: SigningAuditTrail): Promise<void> {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const left = 50;
    let y = height - 60;

    const heading = (text: string) => {
      page.drawText(text, { x: left, y, size: 18, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
      y -= 26;
    };
    const subheading = (text: string) => {
      page.drawText(text, { x: left, y, size: 14, font: fontBold, color: rgb(0.15, 0.15, 0.15) });
      y -= 18;
    };
    const line = (label: string, value: string) => {
      const safe = (value ?? "").trim() || "-";
      page.drawText(label, { x: left, y, size: 10, font: fontBold, color: rgb(0.25, 0.25, 0.25) });
      page.drawText(safe, { x: left + 140, y, size: 10, font, color: rgb(0.15, 0.15, 0.15), maxWidth: width - left - 60 });
      y -= 14;
    };
    const spacer = (h = 10) => {
      y -= h;
    };
    const sectionRule = () => {
      page.drawLine({ start: { x: left, y }, end: { x: width - 50, y }, thickness: 1, color: rgb(0.9, 0.9, 0.92) });
      y -= 14;
    };

    heading("Document Details");
    line("FileID", trail.sourceAssetId);
    line("Filename", trail.sourceFileName);
    line("Creation Date", trail.sentAt ? new Date(trail.sentAt).toLocaleDateString("en-GB") : "-");
    spacer(6);
    sectionRule();

    heading(`Signature Trail for ${trail.sourceFileName}`);

    const eventBlock = (title: string, bodyLines: string[]) => {
      subheading(title);
      for (const b of bodyLines) {
        page.drawText(b, { x: left + 18, y, size: 10, font, color: rgb(0.15, 0.15, 0.15), maxWidth: width - left - 60 });
        y -= 14;
      }
      spacer(8);
    };

    eventBlock("Sent", [
      `Sent to ${trail.recipientEmail}`,
      trail.sentAt ?? "-"
    ]);

    if (trail.viewedAt) {
      const parts = [`Viewed by ${trail.recipientEmail}`, trail.viewedAt];
      if (trail.ipAtView) {
        parts.push(`IP ${trail.ipAtView}`);
      }
      eventBlock("Viewed", parts);
    }

    if (trail.signedAt) {
      const parts = [`Signed by ${trail.recipientEmail}`, trail.signedAt];
      if (trail.ipAtSign) {
        parts.push(`IP ${trail.ipAtSign}`);
      }
      if (trail.consentedAt) {
        parts.push(`Consent ${trail.consentedAt}`);
      }
      if (trail.userAgentAtSign) {
        parts.push(`User agent ${trail.userAgentAtSign}`);
      }
      eventBlock("Signed", parts);
    }

    // Optional: include hash as a small footer line if present (kept readable).
    if (trail.sourcePdfHashSha256) {
      sectionRule();
      page.drawText(`Source PDF SHA-256: ${trail.sourcePdfHashSha256}`, {
        x: left,
        y: Math.max(40, y),
        size: 8,
        font,
        color: rgb(0.35, 0.35, 0.35),
        maxWidth: width - left - 60
      });
    }
  }
}
