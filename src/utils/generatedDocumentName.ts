import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import type { MondayColumnValue, MondayItem } from "../monday/mondayClient";
import { extractColumnDisplayText } from "./mondayValues";
import {
  ORDER_NUMBER_COLUMN_ID,
  type GenerationLegalForm,
  type GenerationPartyKind,
  parseGenerationTrigger
} from "./mapping";

dayjs.extend(customParseFormat);

/** Monday column "Data Incarcare" — used as primary date for generated document names */
export const ORDER_DATE_COLUMN_ID = "text_mksv7ywf";

const DATE_PARSE_FORMATS = [
  "DD-MM-YYYY",
  "D-M-YYYY",
  "DD.MM.YYYY",
  "D.M.YYYY",
  "DD/MM/YYYY",
  "D/M/YYYY",
  "YYYY-MM-DD",
  "YYYY.MM.DD"
];

function documentPrefixForVariant(kind: GenerationPartyKind, legalForm: GenerationLegalForm): string {
  const party = kind === "client" ? "client" : "furnizor";
  const suffix = legalForm === "SRL" ? "RO" : legalForm === "GmbH" ? "CH" : "EOOD";
  return `ctr_${party}_${suffix}`;
}

function findColumn(item: MondayItem, columnId: string): MondayColumnValue | undefined {
  return item.column_values.find((c) => c.id === columnId);
}

/**
 * Monday text columns often expose `text` in the UI but persist only `value: {"text":"..."}`.
 * Used for order/transport id so filenames do not fall back to the pulse (company) name.
 */
export function readMondayTextColumnRawTrimmed(column: MondayColumnValue | undefined): string {
  if (!column) {
    return "";
  }
  const direct = (column.text ?? "").trim();
  if (direct.length > 0) {
    return direct;
  }
  const rawValue = column.value?.trim();
  if (rawValue) {
    try {
      const parsed = JSON.parse(rawValue) as { text?: unknown };
      if (typeof parsed.text === "string") {
        const fromJson = parsed.text.trim();
        if (fromJson.length > 0) {
          return fromJson;
        }
      }
    } catch {
      // ignore malformed JSON
    }
  }
  return extractColumnDisplayText(column).trim();
}

export function formatOrderDateDdMmYyyy(item: MondayItem): string {
  const col = findColumn(item, ORDER_DATE_COLUMN_ID);
  const raw = col ? extractColumnDisplayText(col).trim() : "";
  if (!raw) {
    return dayjs().format("DD-MM-YYYY");
  }
  for (const fmt of DATE_PARSE_FORMATS) {
    const d = dayjs(raw, fmt, true);
    if (d.isValid()) {
      return d.format("DD-MM-YYYY");
    }
  }
  const loose = dayjs(raw);
  return loose.isValid() ? loose.format("DD-MM-YYYY") : dayjs().format("DD-MM-YYYY");
}

export function sanitizeOrderIdentifierFromItemName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "order";
  }
  const compact = trimmed.replace(/\s+/g, "_");
  const safe = compact.replace(/[^A-Za-z0-9_-]/g, "");
  return safe.length > 0 ? safe : "order";
}

function readFilenameOrderSlugFromColumn(item: MondayItem, columnId: string): string | undefined {
  const col = findColumn(item, columnId);
  if (!col) {
    return undefined;
  }
  const raw = readMondayTextColumnRawTrimmed(col);
  if (!raw) {
    return undefined;
  }
  const slug = sanitizeOrderIdentifierFromItemName(raw);
  return slug && slug !== "order" ? slug : undefined;
}

/**
 * Order segment for `ctr_*_*_<slug>_<date>.pdf`: prefer Monday "Nr. cursa" ({@link ORDER_NUMBER_COLUMN_ID}),
 * else any column whose entire value matches `CLS` + digits (case-insensitive).
 * Does not use the item pulse name (often company/test title) — missing data yields the stable placeholder `order`.
 */
export function resolveOrderSlugForFilename(item: MondayItem): string {
  const fromNrCursa = readFilenameOrderSlugFromColumn(item, ORDER_NUMBER_COLUMN_ID);
  if (fromNrCursa) {
    return fromNrCursa;
  }

  for (const col of item.column_values) {
    const t = readMondayTextColumnRawTrimmed(col);
    if (/^CLS\d+$/i.test(t)) {
      return sanitizeOrderIdentifierFromItemName(t);
    }
  }

  return "order";
}

export function buildGeneratedDocumentBaseName(params: {
  selectedValue: string;
  item: MondayItem;
}): string | null {
  const parsed = parseGenerationTrigger(params.selectedValue);
  if (!parsed) {
    return null;
  }
  const prefix = documentPrefixForVariant(parsed.kind, parsed.legalForm);
  const orderId = resolveOrderSlugForFilename(params.item);
  const datePart = formatOrderDateDdMmYyyy(params.item);
  return `${prefix}_${orderId}_${datePart}`;
}

export function buildGeneratedPdfFileName(selectedValue: string, item: MondayItem): string {
  const base = buildGeneratedDocumentBaseName({ selectedValue, item });
  return `${base ?? `ctr_${item.id}_${Date.now()}`}.pdf`;
}
