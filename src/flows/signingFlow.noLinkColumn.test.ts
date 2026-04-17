import { describe, expect, it, vi } from "vitest";
import type { MondayClient, MondayItem } from "../monday/mondayClient";
import type { GmailService } from "../email/gmailService";
import { SigningService } from "../signing/signingService";
import { SigningFlow } from "./signingFlow";

describe("SigningFlow without Monday link column", () => {
  it("does not attempt to call mondayClient.updateLink", async () => {
    const mondayClient = {
      getItemById: vi.fn().mockResolvedValue({
        id: "1",
        name: "Item",
        board: { id: "b1" },
        column_values: [
          { id: "color_mkse8v90", text: "", value: null, type: "status" },
          { id: "email_mkse8jyb", text: "client@example.com", value: null, type: "email" }
        ],
        assets: []
      } as MondayItem),
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
      updateText: vi.fn().mockResolvedValue(undefined),
      resolvePrincipalCcEmail: vi.fn().mockResolvedValue(null)
    } as unknown as MondayClient;

    const gmailService = {
      sendEmail: vi.fn().mockResolvedValue(undefined),
      sendEmailWithPdfAttachment: vi.fn().mockResolvedValue(undefined)
    } as unknown as GmailService;
    const signingService = new SigningService(60_000);
    const flow = new SigningFlow(mondayClient, signingService, gmailService, "https://svc");

    await flow.startSigning("1", "Trimite Client");

    // If the flow still depended on a link column, it would call updateLink and explode.
    expect((mondayClient as unknown as { updateLink?: unknown }).updateLink).toBeUndefined();
    expect(gmailService.sendEmail).toHaveBeenCalledTimes(1);
  });
});

