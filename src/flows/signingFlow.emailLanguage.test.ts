import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { MondayClient, MondayItem } from "../monday/mondayClient";
import type { GmailService } from "../email/gmailService";
import {
  CLIENT_COUNTRY_COLUMN_ID,
  EMAIL_SUBJECT_ORDER_ID_COLUMN_ID,
  SIGN_EMAIL_SENT_LABEL,
  SIGN_TRIGGER_COLUMN
} from "../utils/mapping";
import { extractColumnDisplayText } from "../utils/mondayValues";
import { SigningService } from "../signing/signingService";
import { SigningFlow } from "./signingFlow";

const minimalPdfBytes = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

function robustColumnTextById(item: MondayItem): Record<string, string> {
  const out: Record<string, string> = {};
  for (const col of item.column_values) {
    out[col.id] = extractColumnDisplayText(col);
  }
  return out;
}

function baseItem(params: {
  countryText?: string;
  countryDisplay?: string;
  pulseId?: string;
  pulseIdValueJsonText?: string;
  itemName?: string;
}): MondayItem {
  const cols: MondayItem["column_values"] = [
    { id: "color_mkse8v90", text: "", value: null, type: "status" },
    { id: "email_mkse8jyb", text: "client@example.com", value: null, type: "email" },
    {
      id: CLIENT_COUNTRY_COLUMN_ID,
      text: params.countryText ?? "",
      display_value: params.countryDisplay ?? null,
      value: null,
      type: "lookup"
    },
    {
      id: EMAIL_SUBJECT_ORDER_ID_COLUMN_ID,
      text: params.pulseId ?? "",
      value: params.pulseIdValueJsonText ? JSON.stringify({ text: params.pulseIdValueJsonText }) : null,
      type: "text"
    }
  ];
  return {
    id: "1",
    name: params.itemName ?? "FallbackName",
    board: { id: "b1" },
    column_values: cols,
    assets: []
  };
}

describe("SigningFlow email language from client country", () => {
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
      getColumnTextById: (item: MondayItem) => robustColumnTextById(item),
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

    const signingService = new SigningService(60_000);
    const flow = new SigningFlow(mondayClient, signingService, gmailService, "https://svc.example");
    return { mondayClient, gmailService, flow };
  }

  it("sends Romanian signature request when Tara Client is Romania", async () => {
    const { mondayClient, gmailService, flow } = makeFlow();
    mondayClient.getItemById = vi.fn().mockResolvedValue(
      baseItem({ countryDisplay: "România", pulseId: "CLS8766" })
    );

    await flow.startSigning("1", "Trimite Client");

    expect(mondayClient.downloadAssetBytes).toHaveBeenCalledWith("asset1");
    expect(mondayClient.updateStatusIfLabelExists).toHaveBeenCalledWith("b1", "1", SIGN_TRIGGER_COLUMN, SIGN_EMAIL_SENT_LABEL);
    expect(gmailService.sendEmail).toHaveBeenCalledTimes(1);
    const arg = (gmailService.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      subject: string;
      html: string;
      pdfAttachment?: { bytes: Buffer; fileName: string };
    };
    expect(arg.subject).toBe("Comanda de Expeditie Crystal Logistics");
    expect(arg.html).toContain("48 de ore");
    expect(arg.html).toContain("https://svc.example/sign/");
    expect(arg.html).not.toContain("Signing link:");
    expect(arg.html).not.toContain("Hello,");
    expect(arg.pdfAttachment?.fileName).toBe("doc.pdf");
    expect(arg.pdfAttachment?.bytes.subarray(0, 4).toString("utf8")).toBe("%PDF");
  });

  it("sends English signature request when Tara Client is not Romania", async () => {
    const { mondayClient, gmailService, flow } = makeFlow();
    mondayClient.getItemById = vi.fn().mockResolvedValue(
      baseItem({ countryDisplay: "Germany", pulseId: "CLS8766" })
    );

    await flow.startSigning("1", "Trimite Client");

    expect(mondayClient.updateStatusIfLabelExists).toHaveBeenCalledWith("b1", "1", SIGN_TRIGGER_COLUMN, SIGN_EMAIL_SENT_LABEL);
    const arg = (gmailService.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      subject: string;
      html: string;
      pdfAttachment?: { bytes: Buffer; fileName: string };
    };
    expect(arg.subject).toBe("Shipping Order Crystal Logistics");
    expect(arg.html).toContain("48 hours");
    expect(arg.html).not.toContain("48 de ore");
    expect(arg.html).not.toContain("Link semnare:");
    expect(arg.pdfAttachment?.bytes.subarray(0, 4).toString("utf8")).toBe("%PDF");
  });

  it("uses item name as order reference when pulse id is empty", async () => {
    const { mondayClient, gmailService, flow } = makeFlow();
    mondayClient.getItemById = vi.fn().mockResolvedValue(
      baseItem({ countryText: "Romania", pulseId: "", itemName: "ONLY-NAME" })
    );

    await flow.startSigning("1", "Trimite Client");

    const arg = (gmailService.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0] as { subject: string; html: string };
    expect(arg.subject).toBe("Comanda de Expeditie Crystal Logistics");
    expect(arg.html).toContain("ONLY-NAME");
  });

  it("uses pulse_id_mks1dcwz from value JSON when text is empty (no item.name fallback)", async () => {
    const { mondayClient, gmailService, flow } = makeFlow();
    mondayClient.getItemById = vi.fn().mockResolvedValue(
      baseItem({ countryDisplay: "Germany", pulseId: "", pulseIdValueJsonText: "CLS-01609", itemName: "TEST_diana" })
    );

    await flow.startSigning("1", "Trimite Client");

    const arg = (gmailService.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0] as { subject: string; html: string };
    expect(arg.subject).toBe("Shipping Order Crystal Logistics");
    expect(arg.html).toContain("CLS-01609");
    expect(arg.html).not.toContain("TEST_diana");
  });
});
