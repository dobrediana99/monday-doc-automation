import type { MondayColumnValue, MondayItem } from "../monday/mondayClient";

interface ParsedColumnValue {
  labels: string[];
  displayValue: string;
  normalizedText: string;
  hasSelection: boolean;
  hasLinkedItems: boolean;
  hasDropdownValues: boolean;
}

type ParsedRecord = Record<string, unknown>;

/** Single-address format check after structured / display normalization. */
export const MONDAY_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeJsonParse(value: string | null): unknown {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function collectLabelsFromUnknown(input: unknown, labels: Set<string>): void {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed) {
      labels.add(trimmed);
    }
    return;
  }

  if (Array.isArray(input)) {
    for (const entry of input) {
      collectLabelsFromUnknown(entry, labels);
    }
    return;
  }

  if (!input || typeof input !== "object") {
    return;
  }

  const record = input as Record<string, unknown>;

  if (typeof record.text === "string") {
    labels.add(record.text.trim());
  }
  if (typeof record.name === "string") {
    labels.add(record.name.trim());
  }
  if (typeof record.label === "string") {
    labels.add(record.label.trim());
  }
  if (typeof record.display_value === "string") {
    labels.add(record.display_value.trim());
  }

  if (record.label && typeof record.label === "object") {
    const labelObj = record.label as Record<string, unknown>;
    if (typeof labelObj.text === "string") {
      labels.add(labelObj.text.trim());
    }
  }

  if (Array.isArray(record.labels)) {
    collectLabelsFromUnknown(record.labels, labels);
  }
  if (Array.isArray(record.values)) {
    collectLabelsFromUnknown(record.values, labels);
  }

  if (Array.isArray(record.mirrored_items)) {
    collectLabelsFromUnknown(record.mirrored_items, labels);
  }
  if (Array.isArray(record.linked_items)) {
    collectLabelsFromUnknown(record.linked_items, labels);
  }
}

function normalizeDisplayValue(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function addLabel(labels: Set<string>, value: unknown): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    labels.add(String(value));
    return;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      labels.add(trimmed);
    }
  }
}

function collectTypedLabels(
  column: MondayColumnValue,
  parsed: ParsedRecord | null,
  labels: Set<string>
): void {
  if (!parsed) {
    return;
  }

  switch (column.type) {
    case "numbers":
      addLabel(labels, parsed.number);
      addLabel(labels, parsed.value);
      break;
    case "email":
      addLabel(labels, parsed.email);
      addLabel(labels, parsed.text);
      break;
    case "board_relation":
      if (Array.isArray(parsed.linked_item_ids) && parsed.linked_item_ids.length > 0) {
        labels.add("linked_item");
      }
      break;
    case "mirror":
    case "lookup":
      addLabel(labels, parsed.display_value);
      break;
    case "status":
    case "color":
    case "dropdown":
    case "text":
    case "long_text":
      addLabel(labels, parsed.text);
      addLabel(labels, parsed.display_value);
      break;
    default:
      break;
  }
}

/**
 * Extracts a single RFC-like email from Monday display strings such as:
 * - "user@example.com - user@example.com"
 * - "Label - user@example.com"
 * - "user@example.com"
 */
export function extractEmailFromMondayDisplayString(raw: string): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return null;
  }

  const directMatches = trimmed.match(/[^\s@]+@[^\s@]+\.[^\s@]+/g);
  if (directMatches && directMatches.length > 0) {
    const first = directMatches[0].trim();
    if (MONDAY_EMAIL_PATTERN.test(first)) {
      return first;
    }
  }

  const segments = trimmed.split(/\s*-\s*/).map((s) => s.trim()).filter(Boolean);
  for (const segment of segments) {
    const m = segment.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
    if (m && MONDAY_EMAIL_PATTERN.test(m[0])) {
      return m[0];
    }
  }

  return null;
}

function readStructuredEmailFromJson(parsed: ParsedRecord | null): string | null {
  if (!parsed) {
    return null;
  }

  const candidates: unknown[] = [parsed.email, parsed.text];
  const label = parsed.label;
  if (label && typeof label === "object") {
    const lo = label as Record<string, unknown>;
    candidates.push(lo.text, lo.email);
  }

  for (const c of candidates) {
    if (typeof c === "string") {
      const t = c.trim();
      if (MONDAY_EMAIL_PATTERN.test(t)) {
        return t;
      }
      const extracted = extractEmailFromMondayDisplayString(t);
      if (extracted) {
        return extracted;
      }
    }
  }

  return null;
}

/**
 * Prefer structured `email` from Monday column JSON, then fall back to parsing display/text.
 */
export function getMondayEmailForValidation(column: MondayColumnValue | undefined): string {
  if (!column) {
    return "";
  }

  const parsedUnknown = safeJsonParse(column.value);
  const parsedRecord =
    parsedUnknown && typeof parsedUnknown === "object" ? (parsedUnknown as ParsedRecord) : null;

  const structured = readStructuredEmailFromJson(parsedRecord);
  if (structured) {
    return structured;
  }

  const parsed = parseMondayColumnValue(column);
  const blobs = [parsed.displayValue, parsed.normalizedText, ...parsed.labels];
  for (const blob of blobs) {
    const extracted = extractEmailFromMondayDisplayString(blob);
    if (extracted) {
      return extracted;
    }
  }

  return "";
}

/**
 * Status label for validation: same resolution order as user-visible summary,
 * including labels parsed from column.value JSON (Monday often omits column.text).
 */
export function getMondayStatusLabelForValidation(column: MondayColumnValue | undefined): string {
  if (!column) {
    return "";
  }
  const parsed = parseMondayColumnValue(column);
  if (parsed.displayValue.trim()) {
    return parsed.displayValue.trim();
  }
  if (parsed.normalizedText.trim()) {
    return parsed.normalizedText.trim();
  }
  for (const label of parsed.labels) {
    const t = label.trim();
    if (t.length > 0) {
      return t;
    }
  }
  return "";
}

export function parseMondayColumnValue(column: MondayColumnValue): ParsedColumnValue {
  const labels = new Set<string>();
  const directText = normalizeDisplayValue(column.text);
  if (directText) {
    directText
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => labels.add(entry));
  }

  const parsedUnknown = safeJsonParse(column.value);
  const parsedRecord = parsedUnknown && typeof parsedUnknown === "object"
    ? (parsedUnknown as ParsedRecord)
    : null;
  collectLabelsFromUnknown(parsedRecord, labels);
  collectTypedLabels(column, parsedRecord, labels);
  const directDisplayValue = normalizeDisplayValue(column.display_value);
  if (directDisplayValue) {
    labels.add(directDisplayValue);
  }

  let hasLinkedItems = false;
  let hasSelection = labels.size > 0;
  let displayValue = directDisplayValue;
  let hasDropdownValues = false;
  if (parsedRecord) {
    const record = parsedRecord;
    const linkedPulseIds = record.linkedPulseIds;
    if (Array.isArray(linkedPulseIds) && linkedPulseIds.length > 0) {
      hasLinkedItems = true;
      hasSelection = true;
    }

    const linkedItemIds = record.linked_item_ids;
    if (Array.isArray(linkedItemIds) && linkedItemIds.length > 0) {
      hasLinkedItems = true;
      hasSelection = true;
    }

    const linkedItems = record.linked_items;
    if (Array.isArray(linkedItems) && linkedItems.length > 0) {
      hasLinkedItems = true;
      hasSelection = true;
    }

    const dropdownValues = record.values;
    if (Array.isArray(dropdownValues) && dropdownValues.length > 0) {
      hasDropdownValues = true;
      hasSelection = true;
    }

    const personsAndTeams = record.personsAndTeams;
    if (Array.isArray(personsAndTeams) && personsAndTeams.length > 0) {
      hasSelection = true;
    }

    const ids = record.ids;
    if (Array.isArray(ids) && ids.length > 0) {
      hasSelection = true;
    }

    if (!displayValue && typeof record.display_value === "string") {
      displayValue = normalizeDisplayValue(record.display_value);
    }
  }

  return {
    labels: Array.from(labels).filter(Boolean),
    displayValue,
    normalizedText: directText,
    hasSelection,
    hasLinkedItems,
    hasDropdownValues
  };
}

export function extractColumnDisplayText(column: MondayColumnValue): string {
  if (column.type === "email") {
    const normalized = getMondayEmailForValidation(column);
    if (normalized) {
      return normalized;
    }
  }

  const directText = (column.text ?? "").trim();
  if (directText) {
    return directText;
  }

  const parsed = parseMondayColumnValue(column);
  if (parsed.displayValue) {
    return parsed.displayValue;
  }
  return parsed.labels.join(", ");
}

export function buildNormalizedItemModel(item: MondayItem): Record<string, unknown> {
  const model: Record<string, unknown> = {};
  for (const col of item.column_values) {
    model[col.id] = extractColumnDisplayText(col);
  }
  return model;
}

export function parseMondayNumericValue(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const sanitized = trimmed.replace(/[^\d,.\-]/g, "");
  const withoutSpaces = sanitized.replace(/\s/g, "");
  if (!withoutSpaces) {
    return null;
  }

  const normalized =
    withoutSpaces.includes(".") && withoutSpaces.includes(",")
      ? withoutSpaces.replace(/\./g, "").replace(",", ".")
      : withoutSpaces.replace(",", ".");

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
