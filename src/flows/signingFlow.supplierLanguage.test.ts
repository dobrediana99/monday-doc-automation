import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { MondayClient, MondayItem } from "../monday/mondayClient";
import type { GmailService } from "../email/gmailService";
import {
  EMAIL_SUBJECT_ORDER_ID_COLUMN_ID,
  SIGN_EMAIL_SENT_LABEL,
  SIGN_TRIGGER_COLUMN,
  SUPPLIER_HQ_COUNTRY_COLUMN_ID
} from "../utils/mapping";
import { SigningService } from "../signing/signingService";
import { SigningFlow } from "./signingFlow";

const minimalPdfBytes = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

function supplierItem(params: { supplierCountry?: string; orderRef?: string }): MondayItem {
  return {
    id: "1",
    name: "Item",
    board: { id: "b1" },
    column_values: [
      { id: "color_mksn3kgw", text: "", value: null, type: "status" }, // Status Semnare Transportator
      { id: "lookup_mkshweae", text: "supplier@example.com", value: null, type: "lookup" }, // Email Furnizor
      {
        id: SUPPLIER_HQ_COUNTRY_COLUMN_ID,
        text: params.supplierCountry ?? "",
        display_value: params.supplierCountry ?? null,
        value: null,
        type: "mirror"
      },
      {
        id: EMAIL_SUBJECT_ORDER_ID_COLUMN_ID,
        text: params.orderRef ?? "CLS-01609",
        value: null,
        type: "text"
      }
    ],
    assets: []
  };
}

describe("SigningFlow supplier/transporter email language from supplier HQ country", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function makeFlow() {
    const mondayClient = {
      getItemById: vi.fn(),
      getColumnTextById: (item: MondayItem) => {
        const out: Record<string, string> = {};
        for (const col of item.column_values) out[col.id] = col.display_value?.trim() || col.text || "";
        return out;
      },
      updateStatus: vi.fn().mockResolvedValue(undefined),
      updateStatusIfLabelExists: vi.fn().mockResolvedValue(true),
      resolveLatestFileAssetFromFileColumn: vi.fn().mockResolvedValue({
        assetId: "asset1",
        name: "doc.pdf",
        url: "u",
        public_url: "p",
        file_extension: "pdf"
      }),
      downloadAssetBytes: vi.fn().mockResolvedValue(minimalPdfBytes),
      updateText: vi.fn().mockResolvedValue(undefined),
      resolvePrincipalCcEmail: vi.fn().mockResolvedValue(null)
    } as unknown as MondayClient;

    const gmailService = {
      sendEmail: vi.fn().mockResolvedValue(undefined),
      sendEmailWithPdfAttachment: vi.fn().mockResolvedValue(undefined)
    } as unknown as GmailService;

    const flow = new SigningFlow(mondayClient, new SigningService(60_000), gmailService, "https://svc.example");
    return { mondayClient, gmailService, flow };
  }

  it("supplier country Romania -> Romanian transportator email", async () => {
    const { mondayClient, gmailService, flow } = makeFlow();
    mondayClient.getItemById = vi.fn().mockResolvedValue(supplierItem({ supplierCountry: "Romania", orderRef: "CLS-01609" }));

    await flow.startSigning("1", "Trimite Transportator");

    expect(mondayClient.updateStatusIfLabelExists).toHaveBeenCalledWith("b1", "1", SIGN_TRIGGER_COLUMN, SIGN_EMAIL_SENT_LABEL);
    const arg = (gmailService.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0] as { subject: string; html: string; from?: string };
    expect(arg.from).toContain("acc@crystal-logistics-services.com");
    expect(arg.subject).toBe("Comanda transport Crystal Logistics - CLS-01609");
    expect(arg.html).toContain("am atasat comanda de transport");
    expect(arg.html).toContain("Linkul este valabil 48 de ore");
    expect(arg.html).toContain("Atentie!");
  });

  it("supplier country România -> Romanian transportator email", async () => {
    const { mondayClient, gmailService, flow } = makeFlow();
    mondayClient.getItemById = vi.fn().mockResolvedValue(supplierItem({ supplierCountry: "România", orderRef: "CLS-01609" }));

    await flow.startSigning("1", "Trimite Transportator");

    const arg = (gmailService.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0] as { subject: string };
    expect(arg.subject).toBe("Comanda transport Crystal Logistics - CLS-01609");
  });

  it("supplier country RO -> Romanian transportator email", async () => {
    const { mondayClient, gmailService, flow } = makeFlow();
    mondayClient.getItemById = vi.fn().mockResolvedValue(supplierItem({ supplierCountry: "RO", orderRef: "CLS-01609" }));

    await flow.startSigning("1", "Trimite Transportator");

    const arg = (gmailService.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0] as { subject: string };
    expect(arg.subject).toBe("Comanda transport Crystal Logistics - CLS-01609");
  });

  it("supplier country Germany -> English transportator email", async () => {
    const { mondayClient, gmailService, flow } = makeFlow();
    mondayClient.getItemById = vi.fn().mockResolvedValue(supplierItem({ supplierCountry: "Germany", orderRef: "CLS-01609" }));

    await flow.startSigning("1", "Trimite Transportator");

    const arg = (gmailService.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0] as { subject: string; html: string; from?: string };
    expect(arg.from).toContain("acc.ch@crystal-logistics-services.com");
    expect(arg.subject).toBe("Transport Order Crystal Logistics - CLS-01609");
    expect(arg.html).toContain("Please find the transport order attached.");
    expect(arg.html).toContain("The signing link is valid for 48 hours");
    expect(arg.html).toContain("Attention!");
  });

  it("supplier country missing -> falls back to English", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { mondayClient, gmailService, flow } = makeFlow();
    mondayClient.getItemById = vi.fn().mockResolvedValue(supplierItem({ supplierCountry: "", orderRef: "CLS-01609" }));

    await flow.startSigning("1", "Trimite Transportator");

    expect(warn).toHaveBeenCalled();
    const arg = (gmailService.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0] as { subject: string };
    expect(arg.subject).toBe("Transport Order Crystal Logistics - CLS-01609");
  });
});

