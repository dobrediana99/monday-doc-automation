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

  it("Trans. GmbH => Furnizor pe column, GmbH, cmd_furnizor_CH.docx", () => {
    expect(legalFormStatusColumnForTrigger("Trans. GmbH")).toBe(SUPPLIER_LEGAL_FORM_COLUMN_ID);
    expect(legalFormLabelForTrigger("Trans. GmbH")).toBe("GmbH");
    expect(TEMPLATE_MAPPING["Trans. GmbH"]).toBe("cmd_furnizor_CH.docx");
  });
});
