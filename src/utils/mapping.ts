export const TEMPLATE_MAPPING: Record<string, string> = {
  "Client SRL": "cmd_client_RO.docx",
  "Client GmbH": "cmd_client_CH.docx",
  "Client EOOD": "cmd_client_EOOD.docx",
  "Trans. SRL": "cmd_furnizor_RO.docx",
  "Trans. GmbH": "cmd_furnizor_CH.docx",
  "Trans. EOOD": "cmd_furnizor_EOOD.docx"
};

export const GENERATION_TRIGGER_COLUMNS = new Set([
  "color_mky3xvmr",
  "color_mksh6s1y"
]);

export const SIGN_TRIGGER_COLUMN = "color_mkshk7ap";

export const CLIENT_LEGAL_FORM_COLUMN_ID = "color_mktcqj26";
export const SUPPLIER_LEGAL_FORM_COLUMN_ID = "color_mkt9as8p";

export type GenerationLegalForm = "SRL" | "GmbH" | "EOOD";
export type GenerationPartyKind = "client" | "supplier";

export function parseGenerationTrigger(
  selectedValue: string
): { kind: GenerationPartyKind; legalForm: GenerationLegalForm } | null {
  switch (selectedValue) {
    case "Client SRL":
      return { kind: "client", legalForm: "SRL" };
    case "Client GmbH":
      return { kind: "client", legalForm: "GmbH" };
    case "Client EOOD":
      return { kind: "client", legalForm: "EOOD" };
    case "Trans. SRL":
      return { kind: "supplier", legalForm: "SRL" };
    case "Trans. GmbH":
      return { kind: "supplier", legalForm: "GmbH" };
    case "Trans. EOOD":
      return { kind: "supplier", legalForm: "EOOD" };
    default:
      return null;
  }
}

export function legalFormStatusColumnForTrigger(selectedValue: string): string | null {
  const parsed = parseGenerationTrigger(selectedValue);
  if (!parsed) {
    return null;
  }
  return parsed.kind === "client" ? CLIENT_LEGAL_FORM_COLUMN_ID : SUPPLIER_LEGAL_FORM_COLUMN_ID;
}

export function legalFormLabelForTrigger(selectedValue: string): string | null {
  return parseGenerationTrigger(selectedValue)?.legalForm ?? null;
}

export const GENERATION_ALLOWED_VALUES = new Set(Object.keys(TEMPLATE_MAPPING));

export const SIGN_ALLOWED_VALUES = new Set([
  "Trimite Client SRL",
  "Trimite Client GmbH",
  "Trimite Furnizor SRL",
  "Trimite Funizor GmbH"
]);

export function isClientVariant(value: string): boolean {
  return value.includes("Client");
}

export function getUploadPdfColumn(value: string): string {
  return isClientVariant(value) ? "file_mksefxnc" : "file_mksh4n9q";
}

export function getLinkColumn(value: string): string {
  return isClientVariant(value) ? "link_mksvc32a" : "link_mkx8cgp8";
}

export function getSignedFileColumn(value: string): string {
  return isClientVariant(value) ? "file_mkser695" : "file_mksespqb";
}

export function getSignedStatusColumn(value: string): string {
  return isClientVariant(value) ? "color_mkse8v90" : "color_mksn3kgw";
}

export function extractEmailByVariant(value: string, itemModel: Record<string, unknown>): string | null {
  const key = isClientVariant(value) ? "client_email" : "supplier_email";
  const candidate = itemModel[key];
  return typeof candidate === "string" && candidate.includes("@") ? candidate : null;
}
