import { describe, expect, it } from "vitest";
import {
  CLIENT_LEGAL_FORM_COLUMN_ID,
  SUPPLIER_LEGAL_FORM_COLUMN_ID,
  TEMPLATE_MAPPING,
  legalFormLabelForTrigger,
  legalFormStatusColumnForTrigger
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
