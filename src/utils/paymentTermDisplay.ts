import type { CrmLycLegalForm, GenerationLegalForm } from "./mapping";
import { parseMondayNumericValue } from "./mondayValues";

export const CLIENT_PAYMENT_DAYS_COLUMN_ID = "numeric_mksek8d2";
export const CLIENT_PAYMENT_TERMS_COLUMN_ID = "color_mksex1w8";
export const SUPPLIER_PAYMENT_DAYS_COLUMN_ID = "numeric_mksev08g";
export const SUPPLIER_PAYMENT_TERMS_COLUMN_ID = "color_mksed6qr";

/** Romanian status labels → English (GmbH / CH documents). */
export const PAYMENT_TERMS_RO_TO_EN: Record<string, string> = {
  "Zile de la Descarcare": "Days from unloading",
  "Zile de la primirea Facturii si a CMR-ului": "Days from receipt of Invoice and CMR",
  "Zile de la Incarcare": "Days from loading",
  "30% avans si 70% la descarcare": "30% advance and 70% upon unloading",
  "Zile de la semnarea comenzii": "Days from signing of the order",
  "30% avans si 70% la 30 de zile de la descarcare": "30% advance and 70% at 30 days from unloading",
  "Zile Dupa Incarcare 60% si 7 zile Dupa Descarcare 40%":
    "60% after loading and 40% 7 days after unloading",
  "80% incarcare 20% descarcare": "80% loading 20% unloading",
  "Zile de la primirea facturii si a CMR-ului": "Days from receipt of invoice and CMR"
};

const PLACEHOLDER_VALUES = new Set(["", "Alege!", "Alege", "Apasa Aici!", "Apasa Aici"]);

export type PaymentTermParty = "client" | "supplier";

export function localizePaymentTermsLabel(
  termsRo: string,
  legalForm: GenerationLegalForm | CrmLycLegalForm
): string {
  const trimmed = termsRo.trim();
  if (!trimmed || PLACEHOLDER_VALUES.has(trimmed)) {
    return "";
  }
  if (legalForm === "SRL" || legalForm === "EOOD") {
    return trimmed;
  }
  return PAYMENT_TERMS_RO_TO_EN[trimmed] ?? trimmed;
}

function isDayCountPaymentTerm(termsRo: string): boolean {
  return /^zile\b/i.test(termsRo.trim());
}

function suffixAfterDaysWord(terms: string): string {
  return terms.replace(/^(Zile|Days)\s+/i, "").trim();
}

function formatSuffixForSplitTemplate(suffix: string, legalForm: GenerationLegalForm | CrmLycLegalForm): string {
  if (!suffix) return "";
  if (legalForm === "GmbH") {
    return suffix;
  }
  return suffix.charAt(0).toLowerCase() + suffix.slice(1);
}

/**
 * Splits payment fields for DOCX templates shaped like:
 * `{days} zile / {terms}` (RO) or `{days} days / {terms}` (EN).
 */
export function paymentTermPartsForTemplate(params: {
  daysRaw: string;
  termsRo: string;
  legalForm: GenerationLegalForm | CrmLycLegalForm;
}): { days: string; terms: string; fullLine: string } {
  const termsRo = params.termsRo.trim();
  if (!termsRo || PLACEHOLDER_VALUES.has(termsRo)) {
    return { days: "", terms: "", fullLine: "" };
  }

  const localized = localizePaymentTermsLabel(termsRo, params.legalForm);
  const parsedDays = parseMondayNumericValue(String(params.daysRaw ?? ""));
  const days =
    parsedDays !== null && Number.isFinite(parsedDays) ? String(Math.round(parsedDays)) : "";

  if (isDayCountPaymentTerm(termsRo)) {
    const suffix = formatSuffixForSplitTemplate(suffixAfterDaysWord(localized), params.legalForm);
    const unit = params.legalForm === "GmbH" ? "days" : "zile";
    const fullLine =
      days && suffix ? `${days} ${unit} / ${suffix}` : days ? `${days} ${unit}` : localized;
    return { days, terms: suffix, fullLine };
  }

  return { days: "", terms: localized, fullLine: localized };
}

export function paymentTermColumnIds(party: PaymentTermParty): {
  daysColumnId: string;
  termsColumnId: string;
} {
  return party === "client"
    ? {
        daysColumnId: CLIENT_PAYMENT_DAYS_COLUMN_ID,
        termsColumnId: CLIENT_PAYMENT_TERMS_COLUMN_ID
      }
    : {
        daysColumnId: SUPPLIER_PAYMENT_DAYS_COLUMN_ID,
        termsColumnId: SUPPLIER_PAYMENT_TERMS_COLUMN_ID
      };
}

export function applyPaymentTermsToModel(params: {
  model: Record<string, unknown>;
  legalForm: GenerationLegalForm | CrmLycLegalForm;
  party: PaymentTermParty;
}): void {
  const { daysColumnId, termsColumnId } = paymentTermColumnIds(params.party);
  const parts = paymentTermPartsForTemplate({
    daysRaw: String(params.model[daysColumnId] ?? ""),
    termsRo: String(params.model[termsColumnId] ?? ""),
    legalForm: params.legalForm
  });

  params.model[daysColumnId] = parts.days;
  params.model[termsColumnId] = parts.terms;

  const lineKey = params.party === "client" ? "client_payment_term_line" : "supplier_payment_term_line";
  params.model[lineKey] = parts.fullLine;
}
