import { describe, expect, it } from "vitest";
import {
  CLIENT_LEGAL_FORM_COLUMN_ID,
  SUPPLIER_LEGAL_FORM_COLUMN_ID,
  TEMPLATE_MAPPING,
  crmLycGenerationTrigger,
  crmLycSigningMailboxLegalForm,
  inferLegalFormFromPdfFileName,
  legalFormLabelForTrigger,
  legalFormStatusColumnForTrigger,
  resolveCrmLycLegalFormFromPeColumn,
  resolveCrmLycSigningLegalForm
} from "./mapping";

describe("generation trigger derivation", () => {
  it("Client SRL => Client pe column, SRL, cmd_client_RO.docx", () => {
    expect(legalFormStatusColumnForTrigger("Client SRL")).toBe(CLIENT_LEGAL_FORM_COLUMN_ID);
    expect(legalFormLabelForTrigger("Client SRL")).toBe("SRL");
    expect(TEMPLATE_MAPPING["Client SRL"]).toBe("cmd_client_RO.docx");
  });

  it("Client EOOD => Client pe column, EOOD, cmd_client_EOOD.docx", () => {
    expect(legalFormStatusColumnForTrigger("Client EOOD")).toBe(CLIENT_LEGAL_FORM_COLUMN_ID);
    expect(legalFormLabelForTrigger("Client EOOD")).toBe("EOOD");
    expect(TEMPLATE_MAPPING["Client EOOD"]).toBe("cmd_client_EOOD.docx");
  });

  it("Trans. GmbH => Furnizor pe column, GmbH, cmd_furnizor_CH.docx", () => {
    expect(legalFormStatusColumnForTrigger("Trans. GmbH")).toBe(SUPPLIER_LEGAL_FORM_COLUMN_ID);
    expect(legalFormLabelForTrigger("Trans. GmbH")).toBe("GmbH");
    expect(TEMPLATE_MAPPING["Trans. GmbH"]).toBe("cmd_furnizor_CH.docx");
  });

  it("Trans. EOOD => Furnizor pe column, EOOD, cmd_furnizor_EOOD.docx", () => {
    expect(legalFormStatusColumnForTrigger("Trans. EOOD")).toBe(SUPPLIER_LEGAL_FORM_COLUMN_ID);
    expect(legalFormLabelForTrigger("Trans. EOOD")).toBe("EOOD");
    expect(TEMPLATE_MAPPING["Trans. EOOD"]).toBe("cmd_furnizor_EOOD.docx");
  });

  it("unrelated status => no legal form mapping", () => {
    expect(legalFormStatusColumnForTrigger("Other")).toBeNull();
    expect(legalFormLabelForTrigger("Other")).toBeNull();
  });
});

describe("crmLycGenerationTrigger", () => {
  it("client + SRL => Client SRL", () => {
    expect(crmLycGenerationTrigger("client", "SRL")).toBe("Client SRL");
    expect(TEMPLATE_MAPPING["Client SRL"]).toBe("cmd_client_RO.docx");
  });

  it("client + GmbH => Client GmbH", () => {
    expect(crmLycGenerationTrigger("client", "GmbH")).toBe("Client GmbH");
    expect(TEMPLATE_MAPPING["Client GmbH"]).toBe("cmd_client_CH.docx");
  });

  it("furnizor + SRL => Trans. SRL", () => {
    expect(crmLycGenerationTrigger("furnizor", "SRL")).toBe("Trans. SRL");
    expect(TEMPLATE_MAPPING["Trans. SRL"]).toBe("cmd_furnizor_RO.docx");
  });

  it("furnizor + GmbH => Trans. GmbH", () => {
    expect(crmLycGenerationTrigger("furnizor", "GmbH")).toBe("Trans. GmbH");
    expect(TEMPLATE_MAPPING["Trans. GmbH"]).toBe("cmd_furnizor_CH.docx");
  });

  it("client + EOOD => Client EOOD", () => {
    expect(crmLycGenerationTrigger("client", "EOOD")).toBe("Client EOOD");
    expect(TEMPLATE_MAPPING["Client EOOD"]).toBe("cmd_client_EOOD.docx");
  });

  it("furnizor + EOOD => Trans. EOOD", () => {
    expect(crmLycGenerationTrigger("furnizor", "EOOD")).toBe("Trans. EOOD");
    expect(TEMPLATE_MAPPING["Trans. EOOD"]).toBe("cmd_furnizor_EOOD.docx");
  });

  it("unknown template => null", () => {
    expect(crmLycGenerationTrigger("other", "SRL")).toBeNull();
  });
});

describe("resolveCrmLycLegalFormFromPeColumn", () => {
  it("reads Client pe for client template", () => {
    expect(
      resolveCrmLycLegalFormFromPeColumn({
        template: "client",
        textValues: { client_pe: "GmbH" }
      })
    ).toBe("GmbH");
  });

  it("reads Furnizor pe for furnizor template", () => {
    expect(
      resolveCrmLycLegalFormFromPeColumn({
        template: "furnizor",
        textValues: { furnizor_pe: "EOOD" }
      })
    ).toBe("EOOD");
  });

  it("throws when column is empty or Alege!", () => {
    expect(() =>
      resolveCrmLycLegalFormFromPeColumn({ template: "client", textValues: {} })
    ).toThrow(/Client pe/);
    expect(() =>
      resolveCrmLycLegalFormFromPeColumn({
        template: "furnizor",
        textValues: { furnizor_pe: "Alege!" }
      })
    ).toThrow(/Furnizor pe/);
  });

  it("throws on invalid value", () => {
    expect(() =>
      resolveCrmLycLegalFormFromPeColumn({
        template: "client",
        textValues: { client_pe: "SA" }
      })
    ).toThrow(/invalidă/i);
  });
});

describe("resolveCrmLycSigningLegalForm", () => {
  it("uses Client pe / Furnizor pe column", () => {
    expect(
      resolveCrmLycSigningLegalForm({
        template: "client",
        textValues: { client_pe: "GmbH" }
      })
    ).toBe("GmbH");
    expect(
      resolveCrmLycSigningLegalForm({
        template: "furnizor",
        textValues: { furnizor_pe: "SRL" }
      })
    ).toBe("SRL");
  });
});

describe("crmLycSigningMailboxLegalForm", () => {
  it("maps SRL and EOOD to RO mailbox selector", () => {
    expect(crmLycSigningMailboxLegalForm("SRL")).toBe("SRL");
    expect(crmLycSigningMailboxLegalForm("EOOD")).toBe("SRL");
  });

  it("maps GmbH to CH mailbox selector", () => {
    expect(crmLycSigningMailboxLegalForm("GmbH")).toBe("GmbH");
  });
});

describe("inferLegalFormFromPdfFileName", () => {
  it("detects RO and CH suffixes", () => {
    expect(inferLegalFormFromPdfFileName("ctr_client_RO_x.pdf")).toBe("SRL");
    expect(inferLegalFormFromPdfFileName("ctr_furnizor_CH_x.pdf")).toBe("GmbH");
    expect(inferLegalFormFromPdfFileName("other.pdf")).toBeNull();
  });
});
