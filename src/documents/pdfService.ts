import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const execFileAsync = promisify(execFile);

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

  async generateSignedPdf(inputPdfPath: string, signaturePngBase64: string, auditLines: string[]): Promise<string> {
    const pdfBytes = await fs.readFile(inputPdfPath);
    return this.generateSignedPdfFromBytes(pdfBytes, signaturePngBase64, auditLines);
  }

  async generateSignedPdfFromBytes(sourcePdfBytes: Buffer, signaturePngBase64: string, auditLines: string[]): Promise<string> {
    const pdfDoc = await PDFDocument.load(sourcePdfBytes);

    const signatureRaw = signaturePngBase64.replace(/^data:image\/png;base64,/, "");
    const signatureImage = await pdfDoc.embedPng(Buffer.from(signatureRaw, "base64"));
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const page = pdfDoc.addPage();
    const { width, height } = page.getSize();

    page.drawText("Signed electronically via CLS signing workflow", {
      x: 50,
      y: height - 60,
      size: 14,
      font,
      color: rgb(0.1, 0.1, 0.1)
    });

    const signatureWidth = 220;
    const signatureHeight = (signatureImage.height / signatureImage.width) * signatureWidth;
    page.drawText("Signature:", { x: 50, y: height - 110, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
    page.drawImage(signatureImage, {
      x: 50,
      y: height - 110 - signatureHeight - 10,
      width: signatureWidth,
      height: signatureHeight
    });

    page.drawText("Audit:", { x: 50, y: height - 140 - signatureHeight, size: 11, font, color: rgb(0.2, 0.2, 0.2) });

    const fontSize = 9;
    let cursorY = height - 160 - signatureHeight;
    for (const line of auditLines) {
      if (cursorY < 60) {
        break;
      }
      page.drawText(line, {
        x: 50,
        y: cursorY,
        size: fontSize,
        font,
        color: rgb(0.2, 0.2, 0.2),
        maxWidth: width - 100
      });
      cursorY -= 12;
    }

    const outputPath = path.join("/tmp", `${Date.now()}-signed.pdf`);
    await fs.writeFile(outputPath, await pdfDoc.save());
    return outputPath;
  }
}
