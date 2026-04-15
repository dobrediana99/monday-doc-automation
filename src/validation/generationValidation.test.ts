import { describe, expect, it } from "vitest";
import type { ValidationIssue } from "./generationValidation";
import { buildGroupedErrorMessage, validateGenerationRequest } from "./generationValidation";
import type { MondayItem } from "../monday/mondayClient";

describe("buildGroupedErrorMessage", () => {
  it("lists only missing fields by section", () => {
    const issues: ValidationIssue[] = [
      {
        fieldId: "text_mkx0cnkt",
        fieldLabel: "Program Incarcare",
        section: "transport",
        reason: "missing"
      },
      {
        fieldId: "text_mkx0wy9h",
        fieldLabel: "Program Descarcare",
        section: "transport",
        reason: "missing"
      }
    ];
    expect(buildGroupedErrorMessage(issues)).toBe(
      "Nu se poate genera comanda. Campuri lipsa: Date transport: Program Incarcare, Program Descarcare."
    );
  });

  it("lists only invalid fields with current and expected values", () => {
    const issues: ValidationIssue[] = [
      {
        fieldId: "color_mkt9as8p",
        fieldLabel: "Furnizor pe",
        section: "supplier",
        reason: "invalid",
        value: "SRL",
        expected: "GmbH"
      }
    ];
    expect(buildGroupedErrorMessage(issues)).toBe(
      'Nu se poate genera comanda. Campuri cu valoare invalida: Date furnizor: Furnizor pe (valoare curenta: "SRL", valoare asteptata: "GmbH").'
    );
  });

  it("separates missing and invalid blocks", () => {
    const issues: ValidationIssue[] = [
      {
        fieldId: "board_relation_mkse9rp2",
        fieldLabel: "Companie Furnizor",
        section: "supplier",
        reason: "missing"
      },
      {
        fieldId: "lookup_mksh7sx6",
        fieldLabel: "VAT Furnizor",
        section: "supplier",
        reason: "missing"
      },
      {
        fieldId: "color_mkt9as8p",
        fieldLabel: "Furnizor pe",
        section: "supplier",
        reason: "invalid",
        value: "SRL",
        expected: "GmbH"
      }
    ];
    expect(buildGroupedErrorMessage(issues)).toBe(
      'Nu se poate genera comanda. Campuri lipsa: Date furnizor: Companie Furnizor, VAT Furnizor. Campuri cu valoare invalida: Date furnizor: Furnizor pe (valoare curenta: "SRL", valoare asteptata: "GmbH").'
    );
  });

  it("dedupes duplicate fieldIds in the same section", () => {
    const issues: ValidationIssue[] = [
      {
        fieldId: "text_mkx0cnkt",
        fieldLabel: "Program Incarcare",
        section: "transport",
        reason: "missing"
      },
      {
        fieldId: "text_mkx0cnkt",
        fieldLabel: "Program Incarcare",
        section: "transport",
        reason: "missing"
      }
    ];
    expect(buildGroupedErrorMessage(issues)).toBe(
      "Nu se poate genera comanda. Campuri lipsa: Date transport: Program Incarcare."
    );
  });
});

function col(id: string, text: string, type: string): { id: string; text: string; value: string | null; type: string } {
  return { id, text, value: null, type };
}

function validClientSrlItem(params?: { postalLoad?: string; postalUnload?: string; clientPe?: string }): MondayItem {
  // Provide values for the required fields for the Client SRL variant.
  // Postal codes and "Client pe" are intentionally not required by business rules.
  const cols = [
    col("email_mkse8jyb", "semnare@example.com", "email"),
    col("email_mkvneqyg", "contab@example.com", "email"),
    col("board_relation_mkpw4bcs", "Companie Client", "board_relation"),
    col("board_relation_mkshmkgt", "Nume Persoana", "board_relation"),
    col("lookup_mksha4n0", "RO123", "lookup"),
    col("lookup_mksh4wrs", "Adresa", "lookup"),
    col("lookup_mkxwwsax", "Judet", "lookup"),
    col("lookup_mkxtmxv3", "Localitate", "lookup"),
    col("lookup_mkxttcky", "Tara", "lookup"),
    col("deal_value", "1000", "numeric"),
    col("numeric_mkpknkjp", "900", "numeric"),
    col("numeric_mksek8d2", "10", "numeric"),
    col("color_mksex1w8", "OK", "status"),
    col("numeric_mksev08g", "10", "numeric"),

    col("color_mktcr7h6", "OK", "status"),
    col("color_mkse3amh", "OK", "status"),
    col("color_mktcvtpz", "OK", "status"),
    col("color_mktaev1d", "OK", "status"),
    col("deal_owner", "Owner", "text"),
    col("color_mkx1kx5j", "OK", "status"),
    col("dropdown_mkx1naw3", "OK", "dropdown"),
    col("color_mkse1tmc", "OK", "status"),
    col("color_mkrb3hhk", "OK", "status"),
    col("text_mksv7ywf", "19.12.2025", "text"),
    col("text_mkx0cnkt", "09:00", "text"),
    col("text_mksv7kwg", "20.12.2025", "text"),
    col("text_mkx0wy9h", "18:00", "text"),
    col("dropdown_mktsr9n2", "RO", "dropdown"),
    col("text_mkx087w5", "Bucuresti", "text"),
    col("long_text_mkpx6q4a", "Adresa incarcare", "long_text"),
    col("dropdown_mktswwk3", "RO", "dropdown"),
    col("text_mkx0g98f", "Cluj", "text"),
    col("long_text_mkrbe20k", "Adresa descarcare", "long_text"),
    col("long_text_mkpwe0df", "Marfa", "long_text"),
    col("text_mksn2w06", "1000", "text")
  ];

  if (params?.postalLoad !== undefined) {
    cols.push(col("text_mkx02gge", params.postalLoad, "text"));
  }
  if (params?.postalUnload !== undefined) {
    cols.push(col("text_mkx0z0bc", params.postalUnload, "text"));
  }
  if (params?.clientPe !== undefined) {
    cols.push(col("color_mktcqj26", params.clientPe, "status"));
  }

  return {
    id: "1",
    name: "CLS1",
    board: { id: "b1" },
    column_values: cols,
    assets: []
  };
}

describe("validateGenerationRequest business rules", () => {
  it("does not fail when Cod Postal Incarcare is empty", () => {
    const item = validClientSrlItem({ postalLoad: "" });
    const res = validateGenerationRequest({ item, selectedValue: "Client SRL" });
    expect(res.ok).toBe(true);
  });

  it("does not fail when Cod Postal Descarcare is empty", () => {
    const item = validClientSrlItem({ postalUnload: "" });
    const res = validateGenerationRequest({ item, selectedValue: "Client SRL" });
    expect(res.ok).toBe(true);
  });

  it("postal code fields do not appear in missing-fields output", () => {
    const item = validClientSrlItem({ postalLoad: "", postalUnload: "" });
    const res = validateGenerationRequest({ item, selectedValue: "Client SRL" });
    expect(res.ok).toBe(true);
    const missingIds = res.missingFields.map((m) => m.fieldId);
    expect(missingIds).not.toContain("text_mkx02gge");
    expect(missingIds).not.toContain("text_mkx0z0bc");
  });

  it("does not fail when Client Pe is empty in Monday", () => {
    const item = validClientSrlItem({ clientPe: "" });
    const res = validateGenerationRequest({ item, selectedValue: "Client SRL" });
    expect(res.ok).toBe(true);
  });
});
