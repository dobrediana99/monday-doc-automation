import { describe, expect, it } from "vitest";
import {
  CLIENT_LEGAL_FORM_COLUMN_ID,
  SUPPLIER_LEGAL_FORM_COLUMN_ID,
  TEMPLATE_MAPPING,
  crmLycGenerationTrigger,
  inferLegalFormFromPdfFileName,
  legalFormLabelForTrigger,
  legalFormStatusColumnForTrigger,
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

  it("defaults to SRL when legalForm omitted", () => {
    expect(crmLycGenerationTrigger("client")).toBe("Client SRL");
    expect(crmLycGenerationTrigger("furnizor")).toBe("Trans. SRL");
  });

  it("unknown template => null", () => {
    expect(crmLycGenerationTrigger("other", "SRL")).toBeNull();
  });
});

describe("resolveCrmLycSigningLegalForm", () => {
  it("prefers explicit legalForm from webhook", () => {
    expect(
      resolveCrmLycSigningLegalForm({
        template: "furnizor",
        legalForm: "GmbH",
        textValues: { furnizor_pe: "SRL" },
        sourcePdfName: "ctr_furnizor_RO_x.pdf"
      })
    ).toBe("GmbH");
  });

  it("uses Client pe / Furnizor pe column when webhook omits legalForm", () => {
    expect(
      resolveCrmLycSigningLegalForm({
        template: "client",
        textValues: { client_pe: "GmbH" },
        sourcePdfName: "ctr_client_RO_x.pdf"
      })
    ).toBe("GmbH");
  });

  it("infers from PDF filename when column is empty", () => {
    expect(
      resolveCrmLycSigningLegalForm({
        template: "furnizor",
        textValues: {},
        sourcePdfName: "ctr_furnizor_CH_CLS03449_22-06-2026.pdf"
      })
    ).toBe("GmbH");
  });

  it("defaults to SRL", () => {
    expect(
      resolveCrmLycSigningLegalForm({
        template: "client",
        textValues: {},
        sourcePdfName: "Comanda.pdf"
      })
    ).toBe("SRL");
  });
});

describe("inferLegalFormFromPdfFileName", () => {
  it("detects RO and CH suffixes", () => {
    expect(inferLegalFormFromPdfFileName("ctr_client_RO_x.pdf")).toBe("SRL");
    expect(inferLegalFormFromPdfFileName("ctr_furnizor_CH_x.pdf")).toBe("GmbH");
    expect(inferLegalFormFromPdfFileName("other.pdf")).toBeNull();
  });
});
