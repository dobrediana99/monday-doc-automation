import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { MondayClient, MondayItem } from "../monday/mondayClient";
import type { GmailService } from "../email/gmailService";
import { CLIENT_COUNTRY_COLUMN_ID, EMAIL_SUBJECT_ORDER_ID_COLUMN_ID } from "../utils/mapping";
import { SigningService } from "../signing/signingService";
import { SigningFlow } from "./signingFlow";

function mondayLikeColumnTextById(item: MondayItem): Record<string, string> {
  const out: Record<string, string> = {};
  for (const col of item.column_values) {
    const dv = col.display_value?.trim();
    out[col.id] = dv && dv.length > 0 ? dv : (col.text ?? "");
  }
  return out;
}

function baseItem(params: {
  countryText?: string;
  countryDisplay?: string;
  pulseId?: string;
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
      value: null,
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
      getColumnTextById: (item: MondayItem) => mondayLikeColumnTextById(item),
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
    const flow = new SigningFlow(mondayClient, signingService, gmailService, "https://svc.example");
    return { mondayClient, gmailService, flow };
  }

  it("sends Romanian signature request when Tara Client is Romania", async () => {
    const { mondayClient, gmailService, flow } = makeFlow();
    mondayClient.getItemById = vi.fn().mockResolvedValue(
      baseItem({ countryDisplay: "România", pulseId: "CLS8766" })
    );

    await flow.startSigning("1", "Trimite Client");

    expect(gmailService.sendEmail).toHaveBeenCalledTimes(1);
    const arg = (gmailService.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      subject: string;
      html: string;
    };
    expect(arg.subject).toBe("Solicitare semnare comandă de expediție – CLS8766");
    expect(arg.html).toContain("Link semnare:");
    expect(arg.html).toContain("https://svc.example/sign/");
    expect(arg.html).not.toContain("Signing link:");
    expect(arg.html).not.toContain("Hello,");
  });

  it("sends English signature request when Tara Client is not Romania", async () => {
    const { mondayClient, gmailService, flow } = makeFlow();
    mondayClient.getItemById = vi.fn().mockResolvedValue(
      baseItem({ countryDisplay: "Germany", pulseId: "CLS8766" })
    );

    await flow.startSigning("1", "Trimite Client");

    const arg = (gmailService.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      subject: string;
      html: string;
    };
    expect(arg.subject).toBe("Signature request for shipment order – CLS8766");
    expect(arg.html).toContain("Signing link:");
    expect(arg.html).not.toContain("Link semnare:");
    expect(arg.html).not.toContain("Vă rugăm să semnați");
  });

  it("uses item name as order reference when pulse id is empty", async () => {
    const { mondayClient, gmailService, flow } = makeFlow();
    mondayClient.getItemById = vi.fn().mockResolvedValue(
      baseItem({ countryText: "Romania", pulseId: "", itemName: "ONLY-NAME" })
    );

    await flow.startSigning("1", "Trimite Client");

    const arg = (gmailService.sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0] as { subject: string };
    expect(arg.subject).toContain("ONLY-NAME");
  });
});
