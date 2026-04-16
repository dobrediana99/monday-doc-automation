import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { MondayClient, MondayItem } from "../monday/mondayClient";
import type { GmailService } from "../email/gmailService";
import { SigningService } from "../signing/signingService";
import { SigningFlow } from "./signingFlow";

function itemFixture(params: {
  itemId: string;
  boardId: string;
  flowType: "client" | "transportator";
  flowStatus?: string;
}): MondayItem {
  const statusColumnId = params.flowType === "client" ? "color_mkse8v90" : "color_mksn3kgw";

  return {
    id: params.itemId,
    name: "Item",
    board: { id: params.boardId },
    column_values: [
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
      flowStatus: "Sent"
    });
    mondayClient.getItemById = vi.fn().mockResolvedValue(item);

    await flow.startSigning("1", "Trimite Client");

    expect(mondayClient.updateStatus).not.toHaveBeenCalled(); // should not set Procesare
    expect(gmailService.sendEmail).not.toHaveBeenCalled();
  });

  it("existing expired session + Sent => resend with new link", async () => {
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
      flowStatus: "Sent"
    });
    mondayClient.getItemById = vi.fn().mockResolvedValue(item);

    await flow.startSigning("1", "Trimite Client");

    expect(mondayClient.updateStatus).toHaveBeenCalled(); // Procesare set
    expect(gmailService.sendEmail).toHaveBeenCalled();
  });

  it("existing expired session + Viewed by ... => resend", async () => {
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
      flowStatus: "Viewed by Email Semnare Client"
    });
    mondayClient.getItemById = vi.fn().mockResolvedValue(item);

    await flow.startSigning("1", "Trimite Client");

    expect(gmailService.sendEmail).toHaveBeenCalled();
  });

  it("existing valid session + Viewed by ... => no resend", async () => {
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
      flowStatus: "Viewed by Email Semnare Client"
    });
    mondayClient.getItemById = vi.fn().mockResolvedValue(item);

    await flow.startSigning("1", "Trimite Client");

    expect(gmailService.sendEmail).not.toHaveBeenCalled();
  });

  it("Completed => allows explicit restart and sends again", async () => {
    const { mondayClient, gmailService, flow } = makeDeps();
    const item = itemFixture({
      itemId: "1",
      boardId: "b1",
      flowType: "client",
      flowStatus: "Completed"
    });
    mondayClient.getItemById = vi.fn().mockResolvedValue(item);

    await flow.startSigning("1", "Trimite Client");

    expect(gmailService.sendEmail).toHaveBeenCalled();
  });

  it("second call with active session => skips duplicate send", async () => {
    const { mondayClient, gmailService, flow } = makeDeps();
    const item = itemFixture({
      itemId: "1",
      boardId: "b1",
      flowType: "client",
      flowStatus: "Sent"
    });
    mondayClient.getItemById = vi.fn().mockResolvedValue(item);

    await flow.startSigning("1", "Trimite Client");
    await flow.startSigning("1", "Trimite Client");

    expect(gmailService.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("Sent with no stored link column => generates and sends", async () => {
    const { mondayClient, gmailService, flow } = makeDeps();
    const item = itemFixture({
      itemId: "1",
      boardId: "b1",
      flowType: "client",
      flowStatus: "Sent"
    });
    mondayClient.getItemById = vi.fn().mockResolvedValue(item);

    await flow.startSigning("1", "Trimite Client");

    expect(gmailService.sendEmail).toHaveBeenCalled();
  });
});

