import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import type { SigningAuditTrail } from "../signing/auditService";

const execFileAsync = promisify(execFile);

/** Minimal font surface used for audit-page text wrapping. */
export type PdfTextWidthFont = { widthOfTextAtSize: (text: string, size: number) => number };

/**
 * Word-wrap for audit PDF copy. pdf-lib's drawText({ maxWidth }) wraps visually but does not
 * expose line count, so layout must pre-compute lines to advance Y before drawing rules/footers.
 */
export function wrapPdfTextToLines(
  text: string,
  font: PdfTextWidthFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [""];
  }

  const lines: string[] = [];
  let line = "";

  for (const word of normalized.split(" ")) {
    if (!word) continue;
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line) {
      lines.push(line);
      line = "";
    }

    if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
      line = word;
      continue;
    }

    let chunk = "";
    for (const char of word) {
      const next = chunk + char;
      if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
        chunk = next;
      } else {
        if (chunk) {
          lines.push(chunk);
        }
        chunk = char;
      }
    }
    line = chunk;
  }

  if (line) {
    lines.push(line);
  }
  return lines.length ? lines : [""];
}

export interface SignaturePlacement {
  /** PDF points (origin bottom-left) */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Tunable placement for the visible signature on the last page of the source PDF (origin bottom-left).
 * - `x` / `y` of the drawn box come from {@link computeLastPageSignaturePlacement} (`y` = bottom margin).
 * - Increase `minMarginBottom` / `marginBottomRatio` to move the box upward (closer to typical stamp band).
 */
export const LAST_PAGE_SIGNATURE_BOX_LAYOUT = {
  minWidth: 160,
  widthRatio: 0.28,
  minHeight: 70,
  heightRatio: 0.11,
  minMarginRight: 40,
  marginRightRatio: 0.06,
  minMarginBottom: 235,
  marginBottomRatio: 0.25
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
    const labelFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    this.drawSigningBlockOnLastPage(lastPage, signatureImage, signatureBox, auditTrail.signerFullName, labelFont);

    await this.appendStyledAuditPage(pdfDoc, auditTrail);

    const outputPath = path.join("/tmp", `${Date.now()}-signed.pdf`);
    await fs.writeFile(outputPath, await pdfDoc.save({ useObjectStreams: false }));
    return outputPath;
  }

  /**
   * Draws typed full name (right-aligned) above the handwritten image within the same placement box
   * on the last page — no extra page.
   */
  private drawSigningBlockOnLastPage(
    page: PDFPage,
    signatureImage: PDFImage,
    box: SignaturePlacement,
    signerFullName: string | undefined,
    font: PDFFont
  ): void {
    const name = (signerFullName ?? "").trim();
    const fontSize = 10;
    const lineHeight = Math.max(12, font.heightAtSize(fontSize) + 2);
    const maxTextLines = 4;
    const topPadding = 14;

    let textBlockH = 0;
    let lines: string[] = [];
    if (name.length > 0) {
      lines = wrapPdfTextToLines(name, font, fontSize, box.width);
      if (lines.length > maxTextLines) {
        lines = lines.slice(0, maxTextLines);
      }
      textBlockH = Math.min(box.height * 0.4, lines.length * lineHeight + topPadding);
    }

    const gap = name ? 4 : 0;
    const sigAreaH = Math.max(24, box.height - textBlockH - gap);
    const sigSubBox: SignaturePlacement = {
      x: box.x,
      y: box.y,
      width: box.width,
      height: sigAreaH
    };

    if (lines.length > 0) {
      let baseline = box.y + box.height - topPadding;
      for (const line of lines) {
        const w = font.widthOfTextAtSize(line, fontSize);
        page.drawText(line, {
          x: box.x + box.width - w,
          y: baseline,
          size: fontSize,
          font,
          color: rgb(0.05, 0.05, 0.08)
        });
        baseline -= lineHeight;
      }
    }

    this.drawSignatureIntoBox(page, signatureImage, sigSubBox);
  }

  private drawSignatureIntoBox(page: PDFPage, signatureImage: PDFImage, box: SignaturePlacement): void {
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
    page.drawImage(signatureImage, { x, y, width: drawW, height: drawH });
  }

  private async appendStyledAuditPage(pdfDoc: PDFDocument, trail: SigningAuditTrail): Promise<void> {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const left = 50;
    const rightMargin = 50;
    const valueColumnX = left + 140;
    const valueMaxWidth = width - valueColumnX - rightMargin;
    const bodySize = 10;
    const bodyLineHeight = Math.max(14, font.heightAtSize(bodySize) + 2);
    const smallSize = 8;
    const smallLineHeight = Math.max(12, font.heightAtSize(smallSize) + 2);

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
      page.drawText(label, { x: left, y, size: bodySize, font: fontBold, color: rgb(0.25, 0.25, 0.25) });
      const wrapped = wrapPdfTextToLines(safe, font, bodySize, valueMaxWidth);
      let yy = y;
      for (const wline of wrapped) {
        page.drawText(wline, {
          x: valueColumnX,
          y: yy,
          size: bodySize,
          font,
          color: rgb(0.15, 0.15, 0.15)
        });
        yy -= bodyLineHeight;
      }
      y -= wrapped.length * bodyLineHeight;
    };
    const spacer = (h = 10) => {
      y -= h;
    };
    const sectionRule = () => {
      spacer(4);
      page.drawLine({
        start: { x: left, y },
        end: { x: width - rightMargin, y },
        thickness: 1,
        color: rgb(0.9, 0.9, 0.92)
      });
      y -= 14;
    };

    heading("Document Details");
    line("FileID", trail.sourceAssetId);
    line("Filename", trail.sourceFileName);
    line("Creation Date", trail.sentAt ? new Date(trail.sentAt).toLocaleDateString("en-GB") : "-");
    spacer(6);
    sectionRule();

    heading(`Signature Trail for ${trail.sourceFileName}`);

    const eventBodyMaxWidth = width - (left + 18) - rightMargin;

    const eventBlock = (title: string, bodyLines: string[]) => {
      subheading(title);
      for (const b of bodyLines) {
        const wrapped = wrapPdfTextToLines(b, font, bodySize, eventBodyMaxWidth);
        for (const wline of wrapped) {
          page.drawText(wline, {
            x: left + 18,
            y,
            size: bodySize,
            font,
            color: rgb(0.15, 0.15, 0.15)
          });
          y -= bodyLineHeight;
        }
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
      if (trail.signerFullName?.trim()) {
        parts.push(`Full name: ${trail.signerFullName.trim()}`);
      }
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

    // Optional: include hash as a small footer block if present (kept readable).
    if (trail.sourcePdfHashSha256) {
      sectionRule();
      const hashText = `Source PDF SHA-256: ${trail.sourcePdfHashSha256}`;
      const hashMaxWidth = width - left - rightMargin;
      const hashLines = wrapPdfTextToLines(hashText, font, smallSize, hashMaxWidth);
      for (const hline of hashLines) {
        page.drawText(hline, {
          x: left,
          y,
          size: smallSize,
          font,
          color: rgb(0.35, 0.35, 0.35)
        });
        y -= smallLineHeight;
      }
    }
  }
}
