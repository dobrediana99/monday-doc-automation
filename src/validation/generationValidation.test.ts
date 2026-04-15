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

function col(
  id: string,
  text: string,
  type: string,
  value: string | null = null,
  display_value: string | null = null
): MondayItem["column_values"][number] {
  return { id, text, value, type, display_value };
}

function validClientSrlItem(params?: { postalLoad?: string; postalUnload?: string; clientPe?: string }): MondayItem {
  // Provide values for the required fields for the Client SRL variant.
  // Postal codes and "Client pe" are intentionally not required by business rules.
  const cols = [
    col(
      "email_mkse8jyb",
      "semnare@example.com - semnare@example.com",
      "email",
      JSON.stringify({
        email: "semnare@example.com",
        text: "semnare@example.com - semnare@example.com"
      }),
      "semnare@example.com - semnare@example.com"
    ),
    col(
      "email_mkvneqyg",
      "contab@example.com - contab@example.com",
      "email",
      JSON.stringify({
        email: "contab@example.com",
        text: "contab@example.com - contab@example.com"
      }),
      "contab@example.com - contab@example.com"
    ),
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
    col("color_mkx1kx5j", "", "color", JSON.stringify({ label: { index: 1, text: "Rutier" } })),
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

  it("Mod Transport Principal is satisfied when label exists only in column JSON (empty text)", () => {
    const item = validClientSrlItem();
    const res = validateGenerationRequest({ item, selectedValue: "Client SRL" });
    expect(res.ok).toBe(true);
    expect(res.missingFields.map((m) => m.fieldId)).not.toContain("color_mkx1kx5j");
  });

  it("still fails for genuinely invalid email columns", () => {
    const item = validClientSrlItem();
    const badEmail: MondayItem["column_values"][number] = {
      id: "email_mkse8jyb",
      type: "email",
      text: "not-an-email",
      value: JSON.stringify({ text: "not-an-email" }),
      display_value: "not-an-email"
    };
    item.column_values = item.column_values.map((c) => (c.id === "email_mkse8jyb" ? badEmail : c));
    const res = validateGenerationRequest({ item, selectedValue: "Client SRL" });
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.fieldId === "email_mkse8jyb" && i.reason === "invalid")).toBe(true);
  });

  it("still fails Mod Transport Principal for placeholder status", () => {
    const item = validClientSrlItem();
    const bad: MondayItem["column_values"][number] = {
      id: "color_mkx1kx5j",
      type: "color",
      text: "Alege!",
      value: JSON.stringify({ label: { text: "Alege!" } }),
      display_value: null
    };
    item.column_values = item.column_values.map((c) => (c.id === "color_mkx1kx5j" ? bad : c));
    const res = validateGenerationRequest({ item, selectedValue: "Client SRL" });
    expect(res.ok).toBe(false);
    expect(res.missingFields.map((m) => m.fieldId)).toContain("color_mkx1kx5j");
  });
});
