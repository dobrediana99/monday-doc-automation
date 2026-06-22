import { describe, expect, it } from "vitest";
import {
  applyPaymentTermsToModel,
  localizePaymentTermsLabel,
  paymentTermPartsForTemplate
} from "./paymentTermDisplay";

describe("paymentTermPartsForTemplate", () => {
  it("combines client days + RO terms for SRL", () => {
    expect(
      paymentTermPartsForTemplate({
        daysRaw: "60",
        termsRo: "Zile de la primirea Facturii si a CMR-ului",
        legalForm: "SRL"
      })
    ).toEqual({
      days: "60",
      terms: "de la primirea Facturii si a CMR-ului",
      fullLine: "60 zile / de la primirea Facturii si a CMR-ului"
    });
  });

  it("combines client days + translated terms for GmbH", () => {
    expect(
      paymentTermPartsForTemplate({
        daysRaw: "30",
        termsRo: "Zile de la Descarcare",
        legalForm: "GmbH"
      })
    ).toEqual({
      days: "30",
      terms: "from unloading",
      fullLine: "30 days / from unloading"
    });
  });

  it("keeps percentage terms as a single phrase", () => {
    expect(
      paymentTermPartsForTemplate({
        daysRaw: "30",
        termsRo: "30% avans si 70% la descarcare",
        legalForm: "SRL"
      })
    ).toEqual({
      days: "",
      terms: "30% avans si 70% la descarcare",
      fullLine: "30% avans si 70% la descarcare"
    });
  });
});

describe("applyPaymentTermsToModel", () => {
  it("writes split values into Monday column placeholders", () => {
    const model: Record<string, unknown> = {
      numeric_mksek8d2: "60",
      color_mksex1w8: "Zile de la primirea Facturii si a CMR-ului"
    };
    applyPaymentTermsToModel({ model, legalForm: "SRL", party: "client" });
    expect(model.numeric_mksek8d2).toBe("60");
    expect(model.color_mksex1w8).toBe("de la primirea Facturii si a CMR-ului");
    expect(model.client_payment_term_line).toBe(
      "60 zile / de la primirea Facturii si a CMR-ului"
    );
  });
});

describe("localizePaymentTermsLabel", () => {
  it("translates known RO labels for GmbH", () => {
    expect(
      localizePaymentTermsLabel("Zile de la primirea Facturii si a CMR-ului", "GmbH")
    ).toBe("Days from receipt of Invoice and CMR");
  });
});
