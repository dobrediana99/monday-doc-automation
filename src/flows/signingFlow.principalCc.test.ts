import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { MondayClient, MondayItem } from "../monday/mondayClient";
import type { GmailService } from "../email/gmailService";
import { SigningService } from "../signing/signingService";
import { SigningFlow } from "./signingFlow";

describe("SigningFlow Principal CC on signing emails", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function baseItem(overrides?: Partial<MondayItem>): MondayItem {
    return {
      id: "1",
      name: "Item",
      board: { id: "b1" },
      column_values: [
        { id: "color_mkse8v90", text: "", value: null, type: "status" },
        { id: "email_mkse8jyb", text: "client@example.com", value: null, type: "email" },
        ...(overrides?.column_values ?? [])
      ],
      assets: [],
      ...overrides
    };
  }

  it("signature request adds CC when Principal resolves", async () => {
    const item = baseItem({
      column_values: [
        { id: "color_mkse8v90", text: "", value: null, type: "status" },
        { id: "email_mkse8jyb", text: "client@example.com", value: null, type: "email" },
        {
          id: "deal_owner",
          text: "Boss",
          value: JSON.stringify({ personsAndTeams: [{ id: 42, kind: "person" }] }),
          type: "people"
        }
      ]
    });

    const mondayClient = {
      getItemById: vi.fn().mockResolvedValue(item),
      getColumnTextById: (i: MondayItem) => {
        const out: Record<string, string> = {};
        for (const col of i.column_values) {
          const dv = col.display_value?.trim();
          out[col.id] = dv && dv.length > 0 ? dv : (col.text ?? "");
        }
        return out;
      },
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updateStatusIfLabelExists: vi.fn().mockResolvedValue(true),
      resolveLatestFileAssetFromFileColumn: vi.fn().mockResolvedValue({
        assetId: "a1",
        name: "doc.pdf",
        url: "u",
        public_url: "p",
        file_extension: "pdf"
      }),
      updateText: vi.fn().mockResolvedValue(undefined),
      resolvePrincipalCcEmail: vi.fn().mockResolvedValue({ email: "principal@corp.test", userId: "42" })
    } as unknown as MondayClient;

    const gmailService = {
      sendEmail: vi.fn().mockResolvedValue(undefined),
      sendEmailWithPdfAttachment: vi.fn().mockResolvedValue(undefined)
    } as unknown as GmailService;

    const flow = new SigningFlow(mondayClient, new SigningService(60_000), gmailService, "https://svc");

    await flow.startSigning("1", "Trimite Client");

    expect(gmailService.sendEmail).toHaveBeenCalledTimes(1);
    const arg = (gmailService.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      to: string;
      cc?: string[];
    };
    expect(arg.to).toBe("client@example.com");
    expect(arg.cc).toEqual(["principal@corp.test"]);
  });

  it("signature request sends without CC when Principal empty", async () => {
    const item = baseItem();
    const mondayClient = {
      getItemById: vi.fn().mockResolvedValue(item),
      getColumnTextById: (i: MondayItem) => {
        const out: Record<string, string> = {};
        for (const col of i.column_values) out[col.id] = col.text ?? "";
        return out;
      },
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updateStatusIfLabelExists: vi.fn().mockResolvedValue(true),
      resolveLatestFileAssetFromFileColumn: vi.fn().mockResolvedValue({
        assetId: "a1",
        name: "doc.pdf",
        url: "u",
        public_url: "p",
        file_extension: "pdf"
      }),
      updateText: vi.fn().mockResolvedValue(undefined),
      resolvePrincipalCcEmail: vi.fn().mockResolvedValue(null)
    } as unknown as MondayClient;

    const gmailService = {
      sendEmail: vi.fn().mockResolvedValue(undefined),
      sendEmailWithPdfAttachment: vi.fn().mockResolvedValue(undefined)
    } as unknown as GmailService;

    const flow = new SigningFlow(mondayClient, new SigningService(60_000), gmailService, "https://svc");
    await flow.startSigning("1", "Trimite Client");

    const arg = (gmailService.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0] as { cc?: string[] };
    expect(arg.cc).toBeUndefined();
  });

  it("signed PDF email still sends when Principal resolution throws", async () => {
    const mondayClient = {
      getItemById: vi.fn().mockRejectedValue(new Error("network")),
      getColumnTextById: vi.fn(),
      updateStatus: vi.fn(),
      resolveLatestFileAssetFromFileColumn: vi.fn(),
      updateText: vi.fn(),
      resolvePrincipalCcEmail: vi.fn()
    } as unknown as MondayClient;

    const gmailService = {
      sendEmail: vi.fn(),
      sendEmailWithPdfAttachment: vi.fn().mockResolvedValue(undefined)
    } as unknown as GmailService;

    const signingService = new SigningService(60_000);
    const flow = new SigningFlow(mondayClient, signingService, gmailService, "https://svc");

    const session = await signingService.createSession({
      itemId: "9",
      boardId: "b1",
      flowType: "client",
      sourceFileColumnId: "f",
      sourceAssetId: "a",
      sourcePdfName: "x.pdf",
      recipientEmail: "client@example.com",
      emailSource: "primary",
      signingEmailLanguage: "en",
      signingOrderReference: "ORD"
    });
    await signingService.markSigned(session.token, {
      ip: "1.1.1.1",
      userAgent: "ua",
      finalSignedFileName: "x_signed.pdf",
      signerFullName: "N"
    });

    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cc-fail-"));
    const p = path.join(dir, "s.pdf");
    await fs.writeFile(p, Buffer.from("%PDF"));

    await flow.sendSignedContractRecipientEmailIfNeeded({ token: session.token, signedPdfPath: p });

    expect(gmailService.sendEmailWithPdfAttachment).toHaveBeenCalledTimes(1);
    const arg = (gmailService.sendEmailWithPdfAttachment as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      cc?: string[];
    };
    expect(arg.cc).toBeUndefined();
  });

  it("signed PDF email adds CC when item resolves", async () => {
    const mondayClient = {
      getItemById: vi.fn().mockResolvedValue(baseItem()),
      resolvePrincipalCcEmail: vi.fn().mockResolvedValue({ email: "p@cc.test", userId: "1" })
    } as unknown as MondayClient;

    const gmailService = {
      sendEmailWithPdfAttachment: vi.fn().mockResolvedValue(undefined)
    } as unknown as GmailService;

    const signingService = new SigningService(60_000);
    const flow = new SigningFlow(mondayClient, signingService, gmailService, "https://svc");

    const session = await signingService.createSession({
      itemId: "9",
      boardId: "b1",
      flowType: "client",
      sourceFileColumnId: "f",
      sourceAssetId: "a",
      sourcePdfName: "x.pdf",
      recipientEmail: "client@example.com",
      emailSource: "primary",
      signingEmailLanguage: "en",
      signingOrderReference: "ORD"
    });
    await signingService.markSigned(session.token, {
      ip: "1.1.1.1",
      userAgent: "ua",
      finalSignedFileName: "x_signed.pdf",
      signerFullName: "N"
    });

    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cc-ok-"));
    const p = path.join(dir, "s.pdf");
    await fs.writeFile(p, Buffer.from("%PDF"));

    await flow.sendSignedContractRecipientEmailIfNeeded({ token: session.token, signedPdfPath: p });

    const arg = (gmailService.sendEmailWithPdfAttachment as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      cc?: string[];
    };
    expect(arg.cc).toEqual(["p@cc.test"]);
  });

  it("does not duplicate CC when Principal email equals recipient", async () => {
    const mondayClient = {
      getItemById: vi.fn().mockResolvedValue(baseItem()),
      resolvePrincipalCcEmail: vi.fn().mockResolvedValue({ email: "client@example.com", userId: "1" })
    } as unknown as MondayClient;

    const gmailService = {
      sendEmailWithPdfAttachment: vi.fn().mockResolvedValue(undefined)
    } as unknown as GmailService;

    const signingService = new SigningService(60_000);
    const flow = new SigningFlow(mondayClient, signingService, gmailService, "https://svc");

    const session = await signingService.createSession({
      itemId: "9",
      boardId: "b1",
      flowType: "client",
      sourceFileColumnId: "f",
      sourceAssetId: "a",
      sourcePdfName: "x.pdf",
      recipientEmail: "client@example.com",
      emailSource: "primary",
      signingEmailLanguage: "en",
      signingOrderReference: "ORD"
    });
    await signingService.markSigned(session.token, {
      ip: "1.1.1.1",
      userAgent: "ua",
      finalSignedFileName: "x_signed.pdf",
      signerFullName: "N"
    });

    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cc-dup-"));
    const p = path.join(dir, "s.pdf");
    await fs.writeFile(p, Buffer.from("%PDF"));

    await flow.sendSignedContractRecipientEmailIfNeeded({ token: session.token, signedPdfPath: p });

    const arg = (gmailService.sendEmailWithPdfAttachment as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      cc?: string[];
    };
    expect(arg.cc).toBeUndefined();
  });
});
