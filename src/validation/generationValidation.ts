import type { MondayColumnValue, MondayItem } from "../monday/mondayClient";
import { parseMondayColumnValue, parseMondayNumericValue } from "../utils/mondayValues";
import { TEMPLATE_MAPPING } from "../utils/mapping";

type GenerationVariant = keyof typeof TEMPLATE_MAPPING;
type ValidationSection = "trigger" | "client" | "supplier" | "transport" | "payment" | "driver";

type FieldType =
  | "text"
  | "status"
  | "relation"
  | "dropdown"
  | "lookup"
  | "number"
  | "email";

interface FieldRule {
  fieldId: string;
  required: boolean;
  type: FieldType;
  section: Exclude<ValidationSection, "trigger">;
  allowedValues?: string[];
}

interface VariantRule {
  variant: GenerationVariant;
  requiredFields: FieldRule[];
}

export interface ValidationIssue {
  fieldId: string;
  fieldLabel: string;
  section: ValidationSection;
  reason: "missing" | "invalid" | "unsupported_variant" | "unsupported_status";
  value?: string;
  expected?: string;
}

export interface GenerationValidationResult {
  ok: boolean;
  errors: string[];
  missingFields: Array<{ fieldId: string; fieldLabel: string; section: ValidationSection }>;
  invalidFields: Array<{ fieldId: string; fieldLabel: string; section: ValidationSection; value: string; expected?: string }>;
  issues: ValidationIssue[];
}

export const GENERATION_ERROR_TEXT_COLUMN = "text_mky32wv3";
export const PRIMARY_GENERATION_TRIGGER_COLUMN = "color_mky3xvmr";
export const SECONDARY_GENERATION_TRIGGER_COLUMN = "color_mksh6s1y";
export const SUPPORTED_GENERATION_TRIGGER_COLUMNS = new Set([
  PRIMARY_GENERATION_TRIGGER_COLUMN,
  SECONDARY_GENERATION_TRIGGER_COLUMN
]);

const INVALID_PLACEHOLDER_VALUES = new Set([
  "",
  "Alege!",
  "Alege",
  "Apasa Aici!",
  "Apasa Aici"
]);

const REQUIRED_FIELD_LABELS: Record<string, string> = {
  color_mktcr7h6: "Dep.",
  email_mkse8jyb: "Email Semnare Client",
  email_mkvneqyg: "Email Contabilitate client",
  board_relation_mkpw4bcs: "Companie Client",
  board_relation_mkse9rp2: "Companie Furnizor",
  board_relation_mkshmkgt: "Nume Persoana Client",
  deal_value: "Pret Client",
  numeric_mkpknkjp: "Pret Furnizor",
  color_mkse3amh: "Moneda Cursa",
  color_mktcvtpz: "Sursa Client",
  color_mktaev1d: "Implicare",
  deal_owner: "Principal",
  color_mktcqj26: "Client pe",
  color_mkt9as8p: "Furnizor pe",
  lookup_mksha4n0: "VAT Client",
  lookup_mksh4wrs: "Adresa Sediu Client",
  lookup_mkxwwsax: "Judet Client",
  lookup_mkxtmxv3: "Localitate Client",
  lookup_mkxttcky: "Tara Client",
  lookup_mksh7sx6: "VAT Furnizor",
  lookup_mkshzp7g: "Adresa Sediu Furnizor",
  lookup_mkshweae: "Email Furnizor",
  lookup_mkyqf8ke: "Email Companie",
  color_mkx1kx5j: "Mod Transport Principal",
  dropdown_mkx1naw3: "Tip Mijloc Transport",
  color_mkse1tmc: "Tip Marfa",
  color_mkrb3hhk: "Ocupare Mijloc Transport",
  text_mksv7ywf: "Data Incarcare",
  text_mkx0cnkt: "Program Incarcare",
  text_mksv7kwg: "Data Descarcare",
  text_mkx0wy9h: "Program Descarcare",
  dropdown_mktsr9n2: "Tara Incarcare",
  text_mkx087w5: "Localitate Incarcare",
  long_text_mkpx6q4a: "Adresa Incarcare",
  text_mkx02gge: "Cod Postal Incarcare",
  dropdown_mktswwk3: "Tara Descarcare",
  text_mkx0g98f: "Localitate Descarcare",
  long_text_mkrbe20k: "Adresa Descarcare",
  text_mkx0z0bc: "Cod Postal Descarcare",
  long_text_mkpwe0df: "Descriere Marfa",
  text_mksn2w06: "Greutate",
  numeric_mksek8d2: "Plata la (Client)",
  color_mksex1w8: "Conditii de Plata Client",
  color_mkseanqh: "Trimite originale clientului?",
  color_mkse642z: "Motiv Plata Termen",
  numeric_mksev08g: "Plata la (Furnizor)",
  color_mksed6qr: "Conditii de Plata Furnizor",
  color_mm19awa4: "Plata de la scan?",
  text_mksgp58v: "Nr. Auto"
};

const COMMON_TRANSPORT_FIELDS: FieldRule[] = [
  { fieldId: "color_mktcr7h6", required: true, type: "status", section: "transport" },
  { fieldId: "color_mkse3amh", required: true, type: "status", section: "transport" },
  { fieldId: "color_mktcvtpz", required: true, type: "status", section: "transport" },
  { fieldId: "color_mktaev1d", required: true, type: "status", section: "transport" },
  { fieldId: "deal_owner", required: true, type: "text", section: "transport" },
  { fieldId: "color_mkx1kx5j", required: true, type: "status", section: "transport" },
  { fieldId: "dropdown_mkx1naw3", required: true, type: "dropdown", section: "transport" },
  { fieldId: "color_mkse1tmc", required: true, type: "status", section: "transport" },
  { fieldId: "color_mkrb3hhk", required: true, type: "status", section: "transport" },
  { fieldId: "text_mksv7ywf", required: true, type: "text", section: "transport" },
  { fieldId: "text_mkx0cnkt", required: true, type: "text", section: "transport" },
  { fieldId: "text_mksv7kwg", required: true, type: "text", section: "transport" },
  { fieldId: "text_mkx0wy9h", required: true, type: "text", section: "transport" },
  { fieldId: "dropdown_mktsr9n2", required: true, type: "dropdown", section: "transport" },
  { fieldId: "text_mkx087w5", required: true, type: "text", section: "transport" },
  { fieldId: "long_text_mkpx6q4a", required: true, type: "text", section: "transport" },
  { fieldId: "text_mkx02gge", required: true, type: "text", section: "transport" },
  { fieldId: "dropdown_mktswwk3", required: true, type: "dropdown", section: "transport" },
  { fieldId: "text_mkx0g98f", required: true, type: "text", section: "transport" },
  { fieldId: "long_text_mkrbe20k", required: true, type: "text", section: "transport" },
  { fieldId: "text_mkx0z0bc", required: true, type: "text", section: "transport" },
  { fieldId: "long_text_mkpwe0df", required: true, type: "text", section: "transport" },
  { fieldId: "text_mksn2w06", required: true, type: "text", section: "transport" }
];

const CLIENT_IDENTITY_FIELDS: FieldRule[] = [
  { fieldId: "email_mkse8jyb", required: true, type: "email", section: "client" },
  { fieldId: "email_mkvneqyg", required: true, type: "email", section: "client" },
  { fieldId: "board_relation_mkpw4bcs", required: true, type: "relation", section: "client" },
  { fieldId: "board_relation_mkshmkgt", required: true, type: "relation", section: "client" },
  { fieldId: "lookup_mksha4n0", required: true, type: "lookup", section: "client" },
  { fieldId: "lookup_mksh4wrs", required: true, type: "lookup", section: "client" },
  { fieldId: "lookup_mkxwwsax", required: true, type: "lookup", section: "client" },
  { fieldId: "lookup_mkxtmxv3", required: true, type: "lookup", section: "client" },
  { fieldId: "lookup_mkxttcky", required: true, type: "lookup", section: "client" }
];

const SUPPLIER_IDENTITY_FIELDS: FieldRule[] = [
  { fieldId: "board_relation_mkse9rp2", required: true, type: "relation", section: "supplier" },
  { fieldId: "lookup_mksh7sx6", required: true, type: "lookup", section: "supplier" },
  { fieldId: "lookup_mkshzp7g", required: true, type: "lookup", section: "supplier" },
  { fieldId: "lookup_mkshweae", required: true, type: "email", section: "supplier" }
];

const CLIENT_PAYMENT_FIELDS: FieldRule[] = [
  { fieldId: "numeric_mksek8d2", required: true, type: "number", section: "payment" },
  { fieldId: "color_mksex1w8", required: true, type: "status", section: "payment" },
  { fieldId: "numeric_mksev08g", required: true, type: "number", section: "payment" }
];

const SUPPLIER_PAYMENT_FIELDS: FieldRule[] = [...CLIENT_PAYMENT_FIELDS];

const VARIANT_RULES: Record<GenerationVariant, VariantRule> = {
  "Client SRL": {
    variant: "Client SRL",
    requiredFields: [
      ...CLIENT_IDENTITY_FIELDS,
      { fieldId: "deal_value", required: true, type: "number", section: "client" },
      { fieldId: "numeric_mkpknkjp", required: true, type: "number", section: "client" },
      ...CLIENT_PAYMENT_FIELDS,
      ...COMMON_TRANSPORT_FIELDS
    ]
  },
  "Client GmbH": {
    variant: "Client GmbH",
    requiredFields: [
      ...CLIENT_IDENTITY_FIELDS,
      { fieldId: "deal_value", required: true, type: "number", section: "client" },
      { fieldId: "numeric_mkpknkjp", required: true, type: "number", section: "client" },
      ...CLIENT_PAYMENT_FIELDS,
      ...COMMON_TRANSPORT_FIELDS
    ]
  },
  "Client EOOD": {
    variant: "Client EOOD",
    requiredFields: [
      ...CLIENT_IDENTITY_FIELDS,
      { fieldId: "deal_value", required: true, type: "number", section: "client" },
      { fieldId: "numeric_mkpknkjp", required: true, type: "number", section: "client" },
      ...CLIENT_PAYMENT_FIELDS,
      ...COMMON_TRANSPORT_FIELDS
    ]
  },
  "Trans. SRL": {
    variant: "Trans. SRL",
    requiredFields: [
      ...SUPPLIER_IDENTITY_FIELDS,
      { fieldId: "deal_value", required: true, type: "number", section: "supplier" },
      { fieldId: "numeric_mkpknkjp", required: true, type: "number", section: "supplier" },
      ...SUPPLIER_PAYMENT_FIELDS,
      ...COMMON_TRANSPORT_FIELDS
    ]
  },
  "Trans. GmbH": {
    variant: "Trans. GmbH",
    requiredFields: [
      ...SUPPLIER_IDENTITY_FIELDS,
      { fieldId: "deal_value", required: true, type: "number", section: "supplier" },
      { fieldId: "numeric_mkpknkjp", required: true, type: "number", section: "supplier" },
      ...SUPPLIER_PAYMENT_FIELDS,
      ...COMMON_TRANSPORT_FIELDS
    ]
  },
  "Trans. EOOD": {
    variant: "Trans. EOOD",
    requiredFields: [
      ...SUPPLIER_IDENTITY_FIELDS,
      { fieldId: "deal_value", required: true, type: "number", section: "supplier" },
      { fieldId: "numeric_mkpknkjp", required: true, type: "number", section: "supplier" },
      ...SUPPLIER_PAYMENT_FIELDS,
      ...COMMON_TRANSPORT_FIELDS
    ]
  }
};

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function isEmptyMondayValue(value: string | null | undefined): boolean {
  return normalizeText(value).length === 0;
}

export function isInvalidStatusChoice(value: string | null | undefined): boolean {
  const normalized = normalizeText(value);
  return INVALID_PLACEHOLDER_VALUES.has(normalized);
}

function getFieldLabel(fieldId: string): string {
  return REQUIRED_FIELD_LABELS[fieldId] ?? fieldId;
}

function buildColumnIndex(item: MondayItem): Map<string, MondayColumnValue> {
  const index = new Map<string, MondayColumnValue>();
  for (const column of item.column_values) {
    index.set(column.id, column);
  }
  return index;
}

function getColumnDisplayValue(column?: MondayColumnValue): string {
  if (!column) {
    return "";
  }
  const parsed = parseMondayColumnValue(column);
  if (parsed.displayValue) {
    return parsed.displayValue;
  }
  if (parsed.normalizedText) {
    return parsed.normalizedText;
  }
  if (parsed.labels.length > 0) {
    return parsed.labels.join(", ");
  }
  return normalizeText(column.text);
}

function hasRelationValue(column?: MondayColumnValue): boolean {
  if (!column) {
    return false;
  }
  const parsed = parseMondayColumnValue(column);
  return parsed.hasLinkedItems || parsed.hasSelection;
}

function getColumnRawValue(column?: MondayColumnValue): string {
  if (!column) {
    return "";
  }
  return JSON.stringify({
    id: column.id,
    type: column.type,
    text: column.text,
    display_value: column.display_value ?? null,
    value: column.value
  });
}

function logValidationDecision(params: {
  itemId: string;
  selectedValue: string;
  fieldId: string;
  fieldType: FieldType;
  reason: "missing" | "invalid";
  rawValue: string;
  normalizedValue: string;
  expected?: string;
}): void {
  console.warn(
    JSON.stringify({
      event: "generation_field_validation_failed",
      itemId: params.itemId,
      selectedValue: params.selectedValue,
      fieldId: params.fieldId,
      fieldType: params.fieldType,
      reason: params.reason,
      rawValue: params.rawValue,
      normalizedValue: params.normalizedValue,
      expected: params.expected
    })
  );
}

function hasRequiredFieldValue(column: MondayColumnValue | undefined, type: FieldType): boolean {
  if (!column) {
    return false;
  }

  const parsed = parseMondayColumnValue(column);

  if (type === "relation") {
    return parsed.hasLinkedItems || parsed.hasSelection;
  }

  if (type === "lookup") {
    return parsed.displayValue.length > 0 || parsed.normalizedText.length > 0;
  }

  if (type === "dropdown") {
    return parsed.hasDropdownValues || parsed.normalizedText.length > 0;
  }

  if (type === "text") {
    return parsed.normalizedText.length > 0;
  }

  if (type === "status") {
    const statusValue = parsed.displayValue || parsed.normalizedText;
    return statusValue.length > 0 && !isInvalidStatusChoice(statusValue);
  }

  const display = parsed.displayValue || parsed.normalizedText || parsed.labels.join(", ");
  if (isEmptyMondayValue(display) || isInvalidStatusChoice(display)) {
    return false;
  }

  if (type === "number") {
    return parseMondayNumericValue(display) !== null;
  }

  if (type === "email") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(display);
  }

  return true;
}

function asUnsupportedStatusResult(selectedValue: string): GenerationValidationResult {
  const issue: ValidationIssue = {
    fieldId: "trigger_status",
    fieldLabel: "Status generare",
    section: "trigger",
    reason: "unsupported_status",
    value: selectedValue
  };
  return {
    ok: false,
    errors: [
      `Nu se poate genera comanda. Valoarea "${selectedValue}" nu este suportata pentru generare.`
    ],
    missingFields: [],
    invalidFields: [],
    issues: [issue]
  };
}

const SECTIONS_IN_ORDER: Array<{ key: ValidationSection; title: string }> = [
  { key: "client", title: "Date client" },
  { key: "supplier", title: "Date furnizor" },
  { key: "transport", title: "Date transport" },
  { key: "payment", title: "Date plata" },
  { key: "driver", title: "Date sofer/vehicul" },
  { key: "trigger", title: "Date trigger" }
];

function collectDedupedIssuesBySection(
  issues: ValidationIssue[],
  reason: "missing" | "invalid"
): Record<ValidationSection, ValidationIssue[]> {
  const bySection: Record<ValidationSection, ValidationIssue[]> = {
    trigger: [],
    client: [],
    supplier: [],
    transport: [],
    payment: [],
    driver: []
  };
  const seenFieldIds: Record<ValidationSection, Set<string>> = {
    trigger: new Set(),
    client: new Set(),
    supplier: new Set(),
    transport: new Set(),
    payment: new Set(),
    driver: new Set()
  };

  for (const issue of issues) {
    if (issue.reason !== reason) {
      continue;
    }
    const seen = seenFieldIds[issue.section];
    if (seen.has(issue.fieldId)) {
      continue;
    }
    seen.add(issue.fieldId);
    bySection[issue.section].push(issue);
  }

  return bySection;
}

function formatInvalidFieldEntry(issue: ValidationIssue): string {
  const current = normalizeText(issue.value);
  const expected = normalizeText(issue.expected);
  const detailParts: string[] = [];
  if (current.length > 0) {
    detailParts.push(`valoare curenta: "${current}"`);
  }
  if (expected.length > 0) {
    detailParts.push(`valoare asteptata: "${expected}"`);
  }
  if (detailParts.length === 0) {
    return issue.fieldLabel;
  }
  return `${issue.fieldLabel} (${detailParts.join(", ")})`;
}

function buildSectionFragments(
  bySection: Record<ValidationSection, ValidationIssue[]>,
  formatEntry: (issue: ValidationIssue) => string
): string {
  const fragments = SECTIONS_IN_ORDER.filter((entry) => bySection[entry.key].length > 0).map(
    (entry) => `${entry.title}: ${bySection[entry.key].map(formatEntry).join(", ")}`
  );
  return fragments.join("; ");
}

export function buildGroupedErrorMessage(issues: ValidationIssue[]): string {
  const missingBySection = collectDedupedIssuesBySection(issues, "missing");
  const invalidBySection = collectDedupedIssuesBySection(issues, "invalid");

  const missingPart = buildSectionFragments(missingBySection, (issue) => issue.fieldLabel);
  const invalidPart = buildSectionFragments(invalidBySection, formatInvalidFieldEntry);

  const blocks: string[] = [];
  if (missingPart.length > 0) {
    blocks.push(`Campuri lipsa: ${missingPart}`);
  }
  if (invalidPart.length > 0) {
    blocks.push(`Campuri cu valoare invalida: ${invalidPart}`);
  }

  if (blocks.length === 0) {
    return "Nu se poate genera comanda. Exista campuri obligatorii invalide.";
  }

  return `Nu se poate genera comanda. ${blocks.join(". ")}.`;
}

export function validateGenerationRequest(params: {
  item: MondayItem;
  selectedValue: string;
}): GenerationValidationResult {
  const { item, selectedValue } = params;

  if (!(selectedValue in VARIANT_RULES)) {
    return asUnsupportedStatusResult(selectedValue);
  }

  const variantRules = VARIANT_RULES[selectedValue as GenerationVariant];
  const columnIndex = buildColumnIndex(item);
  const issues: ValidationIssue[] = [];

  for (const rule of variantRules.requiredFields) {
    if (!rule.required) {
      continue;
    }
    const column = columnIndex.get(rule.fieldId);
    const displayValue = getColumnDisplayValue(column);
    const rawValue = getColumnRawValue(column);
    const hasValue = hasRequiredFieldValue(column, rule.type);
    if (!hasValue) {
      const reason =
        isEmptyMondayValue(displayValue) || isInvalidStatusChoice(displayValue) ? "missing" : "invalid";
      logValidationDecision({
        itemId: item.id,
        selectedValue,
        fieldId: rule.fieldId,
        fieldType: rule.type,
        reason,
        rawValue,
        normalizedValue: displayValue
      });
      issues.push({
        fieldId: rule.fieldId,
        fieldLabel: getFieldLabel(rule.fieldId),
        section: rule.section,
        reason,
        value: displayValue
      });
      continue;
    }

    if (rule.allowedValues && rule.allowedValues.length > 0) {
      const normalized = displayValue.toLowerCase();
      if (!rule.allowedValues.some((allowed) => allowed.toLowerCase() === normalized)) {
        logValidationDecision({
          itemId: item.id,
          selectedValue,
          fieldId: rule.fieldId,
          fieldType: rule.type,
          reason: "invalid",
          rawValue,
          normalizedValue: displayValue,
          expected: rule.allowedValues.join(" / ")
        });
        issues.push({
          fieldId: rule.fieldId,
          fieldLabel: getFieldLabel(rule.fieldId),
          section: rule.section,
          reason: "invalid",
          value: displayValue,
          expected: rule.allowedValues.join(" / ")
        });
      }
    }
  }

  const missingFields = issues
    .filter((issue) => issue.reason === "missing")
    .map((issue) => ({
      fieldId: issue.fieldId,
      fieldLabel: issue.fieldLabel,
      section: issue.section
    }));
  const invalidFields = issues
    .filter((issue) => issue.reason === "invalid")
    .map((issue) => ({
      fieldId: issue.fieldId,
      fieldLabel: issue.fieldLabel,
      section: issue.section,
      value: issue.value ?? "",
      expected: issue.expected
    }));

  return {
    ok: issues.length === 0,
    errors: issues.length > 0 ? [buildGroupedErrorMessage(issues)] : [],
    missingFields,
    invalidFields,
    issues
  };
}
