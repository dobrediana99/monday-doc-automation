import type { MondayColumnValue, MondayItem } from "../monday/mondayClient";

interface ParsedColumnValue {
  labels: string[];
  hasSelection: boolean;
  hasLinkedItems: boolean;
}

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
}

export function parseMondayColumnValue(column: MondayColumnValue): ParsedColumnValue {
  const labels = new Set<string>();
  const directText = (column.text ?? "").trim();
  if (directText) {
    directText
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => labels.add(entry));
  }

  const parsed = safeJsonParse(column.value);
  collectLabelsFromUnknown(parsed, labels);

  let hasLinkedItems = false;
  let hasSelection = labels.size > 0;
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    const linkedPulseIds = record.linkedPulseIds;
    if (Array.isArray(linkedPulseIds) && linkedPulseIds.length > 0) {
      hasLinkedItems = true;
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
  }

  return {
    labels: Array.from(labels).filter(Boolean),
    hasSelection,
    hasLinkedItems
  };
}

export function extractColumnDisplayText(column: MondayColumnValue): string {
  const directText = (column.text ?? "").trim();
  if (directText) {
    return directText;
  }

  const parsed = parseMondayColumnValue(column);
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
