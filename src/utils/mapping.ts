export const TEMPLATE_MAPPING: Record<string, string> = {
  "Client SRL": "cmd_client_RO.docx",
  "Client GmbH": "cmd_client_CH.docx",
  "Trans. SRL": "cmd_furnizor_RO.docx",
  "Trans. GmbH": "cmd_furnizor_CH.docx"
};

export const GENERATION_TRIGGER_COLUMNS = new Set([
  "color_mky3xvmr",
  "color_mksh6s1y"
]);

export const SIGN_TRIGGER_COLUMN = "color_mkshk7ap";

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
