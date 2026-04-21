import { describe, expect, it } from "vitest";
import { buildSignatureRequestEmail } from "./signingEmailTemplates";

describe("buildSignatureRequestEmail", () => {
  it("RO client subject includes order reference and body includes required text + signing link", () => {
    const { html, subject } = buildSignatureRequestEmail({
      language: "ro",
      flowType: "client",
      orderNumber: "CLS-1",
      signingUrl: "https://svc/sign/tok"
    });
    expect(subject).toBe("Comanda de Expeditie Crystal Logistics - CLS-1");
    expect(html).toContain("am atasat comanda de expeditie,");
    expect(html).toContain("am rugamintea sa mi-o trimiteti scanata, semnata si stampilata.");
    expect(html).toContain("Linkul este valabil 48 de ore");
    expect(html).toContain("https://svc/sign/tok");
    expect(html).toContain("multumim ca ati ales sa lucrati cu Crystal Logistics,");
    expect(html).toContain("In cazul in care marfa transportata se incadreaza intr-una din categoriile bunurilor cu risc fiscal ridicat (BRFR)");
  });

  it("RO transportator subject includes order reference and body includes required text + signing link", () => {
    const { html, subject } = buildSignatureRequestEmail({
      language: "ro",
      flowType: "transportator",
      orderNumber: "CLS-1",
      signingUrl: "https://svc/sign/tok"
    });
    expect(subject).toBe("Comanda transport Crystal Logistics - CLS-1");
    expect(html).toContain("am atasat comanda de transport, am rugamintea sa mi-o trimiteti scanata, semnata si stampilata alaturi de asigurarea CMR.");
    expect(html).toContain("Linkul este valabil 48 de ore");
    expect(html).toContain("https://svc/sign/tok");
    expect(html).toContain("Atentie!");
    expect(html).toContain("Furnizorii nu accepta descarcarea marfurilor din camioane");
  });

  it("EN client subject includes order reference and body includes required text + signing link", () => {
    const { html, subject } = buildSignatureRequestEmail({
      language: "en",
      flowType: "client",
      orderNumber: "CLS-1",
      signingUrl: "https://svc/sign/tok"
    });
    expect(subject).toBe("Shipping Order Crystal Logistics - CLS-1");
    expect(html).toContain("Please find the shipping order attached.");
    expect(html).toContain("Kindly send it back to us scanned, signed and stamped.");
    expect(html).toContain("The signing link is valid for 48 hours");
    expect(html).toContain("https://svc/sign/tok");
    expect(html).toContain("Thank you for choosing to work with Crystal Logistics.");
    expect(html).toContain("If the transported goods fall within one of the categories of high fiscal risk goods");
  });

  it("EN transportator subject includes order reference and body includes required text + signing link", () => {
    const { html, subject } = buildSignatureRequestEmail({
      language: "en",
      flowType: "transportator",
      orderNumber: "CLS-1",
      signingUrl: "https://svc/sign/tok"
    });
    expect(subject).toBe("Transport Order Crystal Logistics - CLS-1");
    expect(html).toContain("Please find the transport order attached. Kindly send it back to us scanned, signed and stamped, together with the CMR insurance.");
    expect(html).toContain("The signing link is valid for 48 hours");
    expect(html).toContain("https://svc/sign/tok");
    expect(html).toContain("Attention!");
    expect(html).toContain("Suppliers do not accept unloading of goods from trucks");
  });
});
