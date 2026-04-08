import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import type { MondayColumnValue, MondayItem } from "../monday/mondayClient";
import { extractColumnDisplayText } from "./mondayValues";
import {
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
  const suffix =
    legalForm === "SRL" ? "RO" : legalForm === "GmbH" ? "CH" : "EOOD";
  return `ctr_${party}_${suffix}`;
}

function findColumn(item: MondayItem, columnId: string): MondayColumnValue | undefined {
  return item.column_values.find((c) => c.id === columnId);
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

export function buildGeneratedDocumentBaseName(params: {
  selectedValue: string;
  item: MondayItem;
}): string | null {
  const parsed = parseGenerationTrigger(params.selectedValue);
  if (!parsed) {
    return null;
  }
  const prefix = documentPrefixForVariant(parsed.kind, parsed.legalForm);
  const orderId = sanitizeOrderIdentifierFromItemName(params.item.name);
  const datePart = formatOrderDateDdMmYyyy(params.item);
  return `${prefix}_${orderId}_${datePart}`;
}

export function buildGeneratedPdfFileName(selectedValue: string, item: MondayItem): string {
  const base = buildGeneratedDocumentBaseName({ selectedValue, item });
  return `${base ?? `ctr_${item.id}_${Date.now()}`}.pdf`;
}
