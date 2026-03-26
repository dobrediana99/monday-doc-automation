import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const execFileAsync = promisify(execFile);

export class PdfService {
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
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];

    const signatureRaw = signaturePngBase64.replace(/^data:image\/png;base64,/, "");
    const signatureImage = await pdfDoc.embedPng(Buffer.from(signatureRaw, "base64"));

    const { width } = lastPage.getSize();
    const signatureWidth = 180;
    const signatureHeight = (signatureImage.height / signatureImage.width) * signatureWidth;

    lastPage.drawImage(signatureImage, {
      x: 50,
      y: 110,
      width: signatureWidth,
      height: signatureHeight
    });

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontSize = 10;
    let cursorY = 80;
    for (const line of auditLines) {
      lastPage.drawText(line, {
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
