import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { MondayClient, MondayItem } from "../monday/mondayClient";
import type { GmailService } from "../email/gmailService";
import { SigningService } from "../signing/signingService";
import { SigningFlow } from "./signingFlow";

function itemFixture(params: {
  itemId: string;
  boardId: string;
  flowType: "client" | "transportator";
  link?: string;
  flowStatus?: string;
}): MondayItem {
  const linkColumnId = params.flowType === "client" ? "link_mksvc32a" : "link_mkx8cgp8";
  const statusColumnId = params.flowType === "client" ? "color_mkse8v90" : "color_mksn3kgw";

  return {
    id: params.itemId,
    name: "Item",
    board: { id: params.boardId },
    column_values: [
      { id: linkColumnId, text: params.link ?? "", value: null, type: "link" },
      { id: statusColumnId, text: params.flowStatus ?? "", value: null, type: "status" },
      // Recipient columns used by resolveRecipientEmail (client primary)
      { id: "email_mkse8jyb", text: "client@example.com", value: null, type: "email" }
    ],
    assets: []
  };
}

describe("SigningFlow resend behavior for expired links", () => {
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
      getItemById: vi.fn(),
      getColumnTextById: (item: MondayItem) => {
        const out: Record<string, string> = {};
        for (const col of item.column_values) out[col.id] = col.text ?? "";
        return out;
      },
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updateLink: vi.fn().mockResolvedValue(undefined),
      resolveLatestFileAssetFromFileColumn: vi.fn().mockResolvedValue({
        assetId: "asset1",
        name: "doc.pdf",
        url: "u",
        public_url: "p",
        file_extension: "pdf"
      }),
      updateText: vi.fn().mockResolvedValue(undefined)
    } as unknown as MondayClient;

    const gmailService = { sendEmail: vi.fn().mockResolvedValue(undefined) } as unknown as GmailService;
    const signingService = new SigningService(60_000);
    const flow = new SigningFlow(mondayClient, signingService, gmailService, "https://svc");
    return { mondayClient, gmailService, signingService, flow };
  }

  it("existing valid link + Sent => no resend", async () => {
    const { mondayClient, gmailService, signingService, flow } = makeDeps();
    const session = signingService.createSession({
      itemId: "1",
      boardId: "b1",
      flowType: "client",
      sourceFileColumnId: "file_mksefxnc",
      sourceAssetId: "asset1",
      sourcePdfName: "doc.pdf",
      recipientEmail: "client@example.com",
      emailSource: "primary",
      recipientName: null
    });
    const item = itemFixture({
      itemId: "1",
      boardId: "b1",
      flowType: "client",
      link: `https://svc/sign/${encodeURIComponent(session.token)}`,
      flowStatus: "Sent"
    });
    mondayClient.getItemById = vi.fn().mockResolvedValue(item);

    await flow.startSigning("1", "Trimite Client");

    expect(mondayClient.updateStatus).not.toHaveBeenCalled(); // should not set Procesare
    expect(mondayClient.updateLink).not.toHaveBeenCalled();
    expect(gmailService.sendEmail).not.toHaveBeenCalled();
  });

  it("existing expired link + Sent => resend with new link", async () => {
    const { mondayClient, gmailService, signingService, flow } = makeDeps();
    // very short TTL for this test
    const shortTtlService = new SigningService(1_000);
    (flow as unknown as { signingService: SigningService }).signingService = shortTtlService;

    const session = shortTtlService.createSession({
      itemId: "1",
      boardId: "b1",
      flowType: "client",
      sourceFileColumnId: "file_mksefxnc",
      sourceAssetId: "asset1",
      sourcePdfName: "doc.pdf",
      recipientEmail: "client@example.com",
      emailSource: "primary",
      recipientName: null
    });
    vi.advanceTimersByTime(1_001);

    const item = itemFixture({
      itemId: "1",
      boardId: "b1",
      flowType: "client",
      link: `https://svc/sign/${encodeURIComponent(session.token)}`,
      flowStatus: "Sent"
    });
    mondayClient.getItemById = vi.fn().mockResolvedValue(item);

    await flow.startSigning("1", "Trimite Client");

    expect(mondayClient.updateStatus).toHaveBeenCalled(); // Procesare set
    expect(mondayClient.updateLink).toHaveBeenCalled();
    expect(gmailService.sendEmail).toHaveBeenCalled();
  });

  it("existing expired link + Viewed by ... => resend", async () => {
    const { mondayClient, gmailService, flow } = makeDeps();
    const shortTtlService = new SigningService(1_000);
    (flow as unknown as { signingService: SigningService }).signingService = shortTtlService;

    const session = shortTtlService.createSession({
      itemId: "1",
      boardId: "b1",
      flowType: "client",
      sourceFileColumnId: "file_mksefxnc",
      sourceAssetId: "asset1",
      sourcePdfName: "doc.pdf",
      recipientEmail: "client@example.com",
      emailSource: "primary",
      recipientName: null
    });
    vi.advanceTimersByTime(1_001);

    const item = itemFixture({
      itemId: "1",
      boardId: "b1",
      flowType: "client",
      link: `https://svc/sign/${encodeURIComponent(session.token)}`,
      flowStatus: "Viewed by Email Semnare Client"
    });
    mondayClient.getItemById = vi.fn().mockResolvedValue(item);

    await flow.startSigning("1", "Trimite Client");

    expect(mondayClient.updateLink).toHaveBeenCalled();
    expect(gmailService.sendEmail).toHaveBeenCalled();
  });

  it("existing valid link + Viewed by ... => no resend", async () => {
    const { mondayClient, gmailService, signingService, flow } = makeDeps();
    const session = signingService.createSession({
      itemId: "1",
      boardId: "b1",
      flowType: "client",
      sourceFileColumnId: "file_mksefxnc",
      sourceAssetId: "asset1",
      sourcePdfName: "doc.pdf",
      recipientEmail: "client@example.com",
      emailSource: "primary",
      recipientName: null
    });

    const item = itemFixture({
      itemId: "1",
      boardId: "b1",
      flowType: "client",
      link: `https://svc/sign/${encodeURIComponent(session.token)}`,
      flowStatus: "Viewed by Email Semnare Client"
    });
    mondayClient.getItemById = vi.fn().mockResolvedValue(item);

    await flow.startSigning("1", "Trimite Client");

    expect(mondayClient.updateLink).not.toHaveBeenCalled();
    expect(gmailService.sendEmail).not.toHaveBeenCalled();
  });

  it("Completed => no resend (even if link missing/expired)", async () => {
    const { mondayClient, gmailService, flow } = makeDeps();
    const item = itemFixture({
      itemId: "1",
      boardId: "b1",
      flowType: "client",
      link: "https://svc/sign/badtoken",
      flowStatus: "Completed"
    });
    mondayClient.getItemById = vi.fn().mockResolvedValue(item);

    await flow.startSigning("1", "Trimite Client");

    expect(mondayClient.updateLink).not.toHaveBeenCalled();
    expect(gmailService.sendEmail).not.toHaveBeenCalled();
  });

  it("malformed old link + Sent => treat as invalid and resend", async () => {
    const { mondayClient, gmailService, flow } = makeDeps();
    const item = itemFixture({
      itemId: "1",
      boardId: "b1",
      flowType: "client",
      link: "not a url",
      flowStatus: "Sent"
    });
    mondayClient.getItemById = vi.fn().mockResolvedValue(item);

    await flow.startSigning("1", "Trimite Client");

    expect(mondayClient.updateLink).toHaveBeenCalled();
    expect(gmailService.sendEmail).toHaveBeenCalled();
  });
});

