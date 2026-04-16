import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PdfService } from "./pdfService";
import type { SigningAuditTrail } from "../signing/auditService";
import { inflateSync } from "node:zlib";

// 1x1 transparent PNG
const PNG_1X1_BASE64 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5yWZcAAAAASUVORK5CYII=";

async function makeSourcePdfBytes(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage();
    p.drawText(`Page ${i + 1}`, { x: 50, y: 700, size: 18 });
  }
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function sampleTrail(): SigningAuditTrail {
  return {
    boardId: "b1",
    itemId: "i1",
    flowType: "client",
    sourceFileColumnId: "file_x",
    sourceAssetId: "asset123",
    sourceFileName: "cmd_client_RO V3.pdf",
    sourcePdfHashSha256: "abc",
    recipientEmail: "pianohause.ro@gmail.com",
    recipientName: null,
    sentAt: "2026-03-10T13:27:00.000Z",
    viewedAt: "2026-03-10T14:59:00.000Z",
    consentedAt: "2026-03-10T15:00:00.000Z",
    signedAt: "2026-03-10T15:01:00.000Z",
    ipAtView: "93.122.248.178",
    ipAtSign: "82.76.245.31",
    userAgentAtView: "ua",
    userAgentAtSign: "ua",
    sessionId: "s1",
    tokenExpiresAt: "2026-03-11T00:00:00.000Z",
    finalSignedFileName: "x.pdf"
  };
}

describe("PdfService signed output composition", () => {
  it("does not include legacy CLS signing phrase", async () => {
    const svc = new PdfService();
    const src = await makeSourcePdfBytes(2);
    const outPath = await svc.generateSignedPdfFromBytes(src, PNG_1X1_BASE64, sampleTrail());
    const outBytes = await import("node:fs/promises").then((fs) => fs.readFile(outPath));
    expect(outBytes.toString("latin1")).not.toContain("Signed electronically via CLS signing workflow");
  });

  it("adds exactly one audit page and keeps original pages", async () => {
    const svc = new PdfService();
    const src = await makeSourcePdfBytes(2);
    const outPath = await svc.generateSignedPdfFromBytes(src, PNG_1X1_BASE64, sampleTrail());
    const outBytes = await import("node:fs/promises").then((fs) => fs.readFile(outPath));
    const outDoc = await PDFDocument.load(outBytes);
    expect(outDoc.getPageCount()).toBe(3); // 2 original + 1 styled audit page
  });

  it("styled audit page contains structured headings", async () => {
    const svc = new PdfService();
    const src = await makeSourcePdfBytes(1);
    const outPath = await svc.generateSignedPdfFromBytes(src, PNG_1X1_BASE64, sampleTrail());
    const outBytes = await import("node:fs/promises").then((fs) => fs.readFile(outPath));
    // PDF content streams are Flate compressed; inflate them and assert text appears in content.
    const inflated = inflateAllFlateStreams(outBytes);
    const decodedText = decodePdfHexTextRuns(inflated);
    expect(decodedText).toContain("Document Details");
    expect(decodedText).toContain("Signature Trail for");
    expect(decodedText).toContain("Sent to");
    expect(decodedText).toContain("Viewed");
    expect(decodedText).toContain("Signed");
  });
});

function inflateAllFlateStreams(pdfBytes: Buffer): string {
  const chunks: string[] = [];

  const STREAM = Buffer.from("stream\n", "ascii");
  const STREAM_CRLF = Buffer.from("stream\r\n", "ascii");
  const ENDSTREAM = Buffer.from("\nendstream", "ascii");

  // Byte-level scan: find stream markers and attempt to inflate bodies that look like zlib.
  let i = 0;
  while (i < pdfBytes.length) {
    const idxLf = pdfBytes.indexOf(STREAM, i);
    const idxCrLf = pdfBytes.indexOf(STREAM_CRLF, i);
    let idx = -1;
    let start = -1;
    if (idxLf !== -1 && (idxCrLf === -1 || idxLf < idxCrLf)) {
      idx = idxLf;
      start = idx + STREAM.length;
    } else if (idxCrLf !== -1) {
      idx = idxCrLf;
      start = idx + STREAM_CRLF.length;
    }
    if (idx === -1) {
      break;
    }
    const end = pdfBytes.indexOf(ENDSTREAM, start);
    if (end === -1) {
      break;
    }
    const body = pdfBytes.subarray(start, end);
    // zlib streams typically start with 0x78
    if (body.length > 2 && body[0] === 0x78) {
      try {
        const inflated = inflateSync(body);
        chunks.push(inflated.toString("latin1"));
      } catch {
        // ignore
      }
    }
    i = end + ENDSTREAM.length;
  }

  return chunks.join("\\n");
}

function decodePdfHexTextRuns(content: string): string {
  // pdf-lib writes text using hex strings like <446F6375...> (often followed by Tj).
  // Decode any reasonably-long hex sequences to make assertions stable.
  const re = /<([0-9A-Fa-f]{6,})>/g;
  const parts: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const hex = match[1] ?? "";
    if (hex.length < 2) continue;
    const bytes: number[] = [];
    for (let i = 0; i + 1 < hex.length; i += 2) {
      const b = Number.parseInt(hex.slice(i, i + 2), 16);
      if (Number.isFinite(b)) bytes.push(b);
    }
    parts.push(Buffer.from(bytes).toString("latin1"));
  }
  return parts.join("\\n");
}

