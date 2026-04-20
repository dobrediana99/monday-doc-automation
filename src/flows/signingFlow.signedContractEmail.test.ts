import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { MondayClient, MondayItem } from "../monday/mondayClient";
import type { GmailService } from "../email/gmailService";
import { EMAIL_SUBJECT_ORDER_ID_COLUMN_ID } from "../utils/mapping";
import { SigningService } from "../signing/signingService";
import { SigningFlow } from "./signingFlow";

describe("SigningFlow signed-contract recipient email", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function makeDeps() {
    const mondayClient = {
      getItemById: vi.fn().mockResolvedValue({
        id: "1",
        name: "Item",
        board: { id: "b1" },
        column_values: [
          {
            id: EMAIL_SUBJECT_ORDER_ID_COLUMN_ID,
            type: "text",
            text: "",
            display_value: "",
            value: JSON.stringify({ text: "CLS-01609" })
          }
        ],
        assets: []
      } as MondayItem),
      getColumnTextById: (_item: MondayItem) => ({}),
      updateStatus: vi.fn().mockResolvedValue(undefined),
      resolveLatestFileAssetFromFileColumn: vi.fn(),
      updateText: vi.fn().mockResolvedValue(undefined),
      uploadFile: vi.fn().mockResolvedValue(undefined),
      resolvePrincipalCcEmail: vi.fn().mockResolvedValue(null)
    } as unknown as MondayClient;

    const gmailService = {
      sendEmail: vi.fn().mockResolvedValue(undefined),
      sendEmailWithPdfAttachment: vi.fn().mockResolvedValue(undefined)
    } as unknown as GmailService;

    const signingService = new SigningService(60_000);
    const flow = new SigningFlow(mondayClient, signingService, gmailService, "https://svc.example");
    return { mondayClient, gmailService, signingService, flow };
  }

  it("sends signed PDF to session recipient after signing (client flow email)", async () => {
    const { gmailService, signingService, flow } = makeDeps();
    const session = signingService.createSession({
      itemId: "1",
      boardId: "b1",
      flowType: "client",
      sourceFileColumnId: "file_mksefxnc",
      sourceAssetId: "asset1",
      sourcePdfName: "Contract RO.pdf",
      recipientEmail: "client@example.com",
      emailSource: "primary",
      recipientName: null,
      signingEmailLanguage: "en",
      signingOrderReference: "CLS8766"
    });
    signingService.markSigned(session.token, {
      ip: "1.1.1.1",
      userAgent: "ua",
      finalSignedFileName: "Contract RO_signed.pdf",
      signerFullName: "Test Signer"
    });

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "signed-pdf-"));
    const signedPdfPath = path.join(dir, "ignored-name.pdf");
    const pdfBytes = Buffer.from("%PDF-1.4 signed-test-bytes");
    await fs.writeFile(signedPdfPath, pdfBytes);

    await flow.sendSignedContractRecipientEmailIfNeeded({ token: session.token, signedPdfPath });

    expect(gmailService.sendEmailWithPdfAttachment).toHaveBeenCalledTimes(1);
    const arg = (gmailService.sendEmailWithPdfAttachment as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      to: string;
      pdfBytes: Buffer;
      attachmentFileName: string;
      subject: string;
      html: string;
    };
    expect(arg.to).toBe("client@example.com");
    expect(arg.attachmentFileName).toBe("Contract RO_signed.pdf");
    expect(arg.subject).toBe("Signed document – CLS8766");
    expect(arg.html).toContain("Please find attached the signed document");
    expect(arg.html).not.toMatch(/Vă transmitem|Bună ziua,/);
    expect(Buffer.compare(arg.pdfBytes, pdfBytes)).toBe(0);
    expect(signingService.getSessionByToken(session.token)?.signedContractEmailSentAt).toBeTruthy();
  });

  it("sends signed PDF to supplier email for transportator session", async () => {
    const { gmailService, signingService, flow } = makeDeps();
    const session = signingService.createSession({
      itemId: "2",
      boardId: "b1",
      flowType: "transportator",
      sourceFileColumnId: "file_x",
      sourceAssetId: "asset2",
      sourcePdfName: "doc.pdf",
      recipientEmail: "furnizor@supplier.test",
      emailSource: "transportator",
      recipientName: null,
      signingEmailLanguage: "ro",
      signingOrderReference: "T-99"
    });
    signingService.markSigned(session.token, {
      ip: "1.1.1.1",
      userAgent: "ua",
      finalSignedFileName: "doc_signed.pdf",
      signerFullName: "Furnizor SA"
    });

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "signed-pdf-"));
    const signedPdfPath = path.join(dir, "x.pdf");
    await fs.writeFile(signedPdfPath, Buffer.from("%PDF-2"));

    await flow.sendSignedContractRecipientEmailIfNeeded({ token: session.token, signedPdfPath });

    const arg = (gmailService.sendEmailWithPdfAttachment as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      to: string;
      subject: string;
    };
    expect(arg.to).toBe("furnizor@supplier.test");
    expect(arg.subject).toBe("Transmitere document semnat – T-99");
    expect(arg.html).toContain("Vă transmitem atașat documentul semnat");
    expect(arg.html).not.toContain("Please find attached");
  });

  it("does not send duplicate emails when completion path runs twice", async () => {
    const { gmailService, signingService, flow } = makeDeps();
    const session = signingService.createSession({
      itemId: "3",
      boardId: "b1",
      flowType: "client",
      sourceFileColumnId: "file_mksefxnc",
      sourceAssetId: "asset3",
      sourcePdfName: "doc.pdf",
      recipientEmail: "client@example.com",
      emailSource: "primary",
      recipientName: null,
      signingEmailLanguage: "en",
      signingOrderReference: "ORD-3"
    });
    signingService.markSigned(session.token, {
      ip: "1.1.1.1",
      userAgent: "ua",
      finalSignedFileName: "doc_signed.pdf",
      signerFullName: "Dup Test"
    });

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "signed-pdf-"));
    const signedPdfPath = path.join(dir, "signed.pdf");
    await fs.writeFile(signedPdfPath, Buffer.from("%PDF-3"));

    await flow.sendSignedContractRecipientEmailIfNeeded({ token: session.token, signedPdfPath });
    await flow.sendSignedContractRecipientEmailIfNeeded({ token: session.token, signedPdfPath });

    expect(gmailService.sendEmailWithPdfAttachment).toHaveBeenCalledTimes(1);
  });
});
