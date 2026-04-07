import { describe, expect, it } from "vitest";
import type { ValidationIssue } from "./generationValidation";
import { buildGroupedErrorMessage } from "./generationValidation";

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
