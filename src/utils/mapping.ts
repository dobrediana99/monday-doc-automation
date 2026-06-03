// Board IDs and mirror column definitions for all CRM boards are in boardRelations.ts.
// Imports below expose the Comenzi/Curse-specific constants used throughout this file.
export {
  BOARD_ID,
  COMENZI_RELATIONS,
  COMENZI_CLIENT_MIRROR_COLUMNS,
  COMENZI_SUPPLIER_MIRROR_COLUMNS,
  findMirrorDef,
} from "./boardRelations";

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

// Board: "Comenzi / Curse" (2030349838)
// Trigger status column: "Status Semnare Cmd." (color_mm28cpwk)

/** Text column "Nr. cursa" — canonical order / cursă id for generated PDF names (e.g. CLS01609). Verify in Monday developer mode if filenames look wrong. */
export const ORDER_NUMBER_COLUMN_ID = "text_mksnqpn0";

/**
 * Text/lookup column used as transport/order identifier for EMAIL SUBJECTS (e.g. CLS-01609).
 * Requirement: all outgoing email subjects must include this value.
 */
export const EMAIL_SUBJECT_ORDER_ID_COLUMN_ID = "pulse_id_mks1dcwz";

/** Lookup "Tara Client" — client country of origin; drives signing email language (Romanian vs English). */
export const CLIENT_COUNTRY_COLUMN_ID = "lookup_mkxttcky";

/** Mirror "Tara Sediu Furnizor" — supplier headquarters country; drives supplier signing email language. */
export const SUPPLIER_HQ_COUNTRY_COLUMN_ID = "lookup_mm2mndk2";

/** People column "Principal" — CC on signing-related emails when user email resolves from Monday. */
export const PRINCIPAL_PEOPLE_COLUMN_ID = "deal_owner";

/** Status column "Sursa Client" — used to conditionally include transporter contact note in supplier emails. */
export const CLIENT_SOURCE_COLUMN_ID = "color_mktcvtpz";

/** Text column "Data Incarcare" */
export const LOADING_DATE_COLUMN_ID = "text_mksv7ywf";
/** Dropdown column "Tara Incarcare" */
export const LOADING_COUNTRY_COLUMN_ID = "dropdown_mktsr9n2";
/** Dropdown column "Tara Descarcare" */
export const UNLOADING_COUNTRY_COLUMN_ID = "dropdown_mktswwk3";

export const SIGN_TRIGGER_COLUMN = "color_mm28cpwk";

export const SIGN_ERROR_TEXT_COLUMN = "text_mm28m315";

export type SigningFlowType = "client" | "transportator";

export const SIGN_TRIGGER_ALLOWED_VALUES = new Set([
  "Trimite Client",
  "Trimite Transportator"
]);

export const SIGN_PROCESSING_LABEL = "Procesare";
export const SIGN_EMAIL_SENT_LABEL = "Email trimis";
export const SIGN_VIEWED_LABEL = "Vizualizat";
export const SIGN_SIGNED_LABEL = "Semnat";
export const SIGN_REFUSED_LABEL = "Refuzat";
export const SIGN_ERROR_LABEL = "Eroare";

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

export function parseSigningFlowType(selectedValue: string): SigningFlowType | null {
  switch (selectedValue) {
    case "Trimite Client":
      return "client";
    case "Trimite Transportator":
      return "transportator";
    default:
      return null;
  }
}

export const SIGN_SOURCE_FILE_COLUMN: Record<SigningFlowType, string> = {
  client: "file_mksefxnc", // Cmd. Client Nesemnata
  transportator: "file_mksh4n9q" // Cmd. Furnizor Nesemnata
};

export const SIGN_OUTPUT_FILE_COLUMN: Record<SigningFlowType, string> = {
  client: "file_mkser695", // Comanda Client Semnata
  transportator: "file_mksespqb" // Comanda Furnizor Semnata
};

export const SIGN_FLOW_STATUS_COLUMN: Record<SigningFlowType, string> = {
  client: "color_mkse8v90", // Status Semnare Client
  transportator: "color_mksn3kgw" // Status Semnare Transportator
};

export type ClientEmailSource = "primary" | "fallback";

export const SUPPLIER_SIGNING_EMAIL_COLUMN_ID = "email_mm32zqxt"; // Email Semnare Furnizor
export const SUPPLIER_EMAIL_FALLBACK_COLUMN_ID = "lookup_mkshweae"; // Email Furnizor

const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmailCandidate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const v = value.trim();
  if (!v) {
    return null;
  }
  return SIMPLE_EMAIL.test(v) ? v : null;
}

export function resolveRecipientEmail(params: {
  flowType: SigningFlowType;
  itemColumnTextById: Record<string, string>;
}): { email: string; emailSource: ClientEmailSource | "transportator"; usedColumnId: string } | null {
  const { flowType, itemColumnTextById } = params;

  if (flowType === "client") {
    const primaryColumnId = "email_mkse8jyb"; // Email Semnare Client
    const fallbackColumnId = "lookup_mkyqf8ke"; // Email Companie

    const primary = normalizeEmailCandidate(itemColumnTextById[primaryColumnId]);
    if (primary) {
      return { email: primary, emailSource: "primary", usedColumnId: primaryColumnId };
    }
    const fallback = normalizeEmailCandidate(itemColumnTextById[fallbackColumnId]);
    if (fallback) {
      return { email: fallback, emailSource: "fallback", usedColumnId: fallbackColumnId };
    }
    return null;
  }

  const signingEmail = normalizeEmailCandidate(itemColumnTextById[SUPPLIER_SIGNING_EMAIL_COLUMN_ID]);
  if (signingEmail) {
    return {
      email: signingEmail,
      emailSource: "transportator",
      usedColumnId: SUPPLIER_SIGNING_EMAIL_COLUMN_ID
    };
  }

  const fallbackEmail = normalizeEmailCandidate(itemColumnTextById[SUPPLIER_EMAIL_FALLBACK_COLUMN_ID]);
  if (fallbackEmail) {
    return {
      email: fallbackEmail,
      emailSource: "transportator",
      usedColumnId: SUPPLIER_EMAIL_FALLBACK_COLUMN_ID
    };
  }

  return null;
}

export function viewedLabelForFlow(params: {
  flowType: SigningFlowType;
  emailSource: ClientEmailSource | "transportator";
}): string {
  if (params.flowType === "client") {
    return params.emailSource === "primary"
      ? "Viewed by Email Semnare Client"
      : "Viewed by Email Companie Client";
  }
  return "Viewed by Email Furnizor";
}

export function declinedLabelForFlow(params: {
  flowType: SigningFlowType;
  emailSource: ClientEmailSource | "transportator";
}): string {
  if (params.flowType === "client") {
    return params.emailSource === "primary"
      ? "Declined by Email Semnare Client"
      : "Declined by Email Companie Client";
  }
  return "Declined by Email Furnizor";
}

export function recipientDisplayNameFromColumns(itemColumnTextById: Record<string, string>): string | null {
  const candidateIds = [
    "board_relation_mkshmkgt", // Nume Persoana Client
    "board_relation_mkpw4bcs", // Companie Client
    "board_relation_mkse9rp2" // Companie Furnizor
  ];

  for (const id of candidateIds) {
    const value = itemColumnTextById[id];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

// Legacy helper used by document generation flow variants (Client/Trans. + legal form).
export function getUploadPdfColumn(selectedValue: string): string {
  const parsed = parseGenerationTrigger(selectedValue);
  if (parsed) {
    return parsed.kind === "client" ? "file_mksefxnc" : "file_mksh4n9q";
  }
  return selectedValue.includes("Client") ? "file_mksefxnc" : "file_mksh4n9q";
}
