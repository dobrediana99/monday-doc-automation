import { describe, expect, it } from "vitest";
import { buildSignatureRequestEmail } from "./signingEmailTemplates";

describe("buildSignatureRequestEmail", () => {
  it("RO client includes attachment notice, 48h validity, and signing link", () => {
    const { html, subject } = buildSignatureRequestEmail({
      language: "ro",
      flowType: "client",
      orderNumber: "CLS-1",
      signingUrl: "https://svc/sign/tok"
    });
    expect(subject).toBe("Comanda de Expeditie Crystal Logistics");
    expect(html).toContain("Am atașat");
    expect(html).toContain("48 de ore");
    expect(html).toContain("https://svc/sign/tok");
  });

  it("EN transportator includes attachment notice, 48h validity, and signing link", () => {
    const { html, subject } = buildSignatureRequestEmail({
      language: "en",
      flowType: "transportator",
      orderNumber: "CLS-1",
      signingUrl: "https://svc/sign/tok"
    });
    expect(subject).toBe("Transport Order Crystal Logistics");
    expect(html).toContain("attached");
    expect(html).toContain("48 hours");
    expect(html).toContain("https://svc/sign/tok");
  });
});
