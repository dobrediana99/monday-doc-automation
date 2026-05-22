import axios from "axios";
import FormData from "form-data";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import type { MondayColumnValue, MondayItem } from "../monday/mondayClient";

export const CRM_LYC_TRANSPORT_BOARD_ID = "89f5664d-43d0-4cff-964f-46d5279b7f68";
export const CRM_LYC_TRANSPORT_STATUS_CRM_KEY = "transport_status";
export const CRM_LYC_SIGNED_STATUS_LABEL = "Semnat";

type JsonRecord = Record<string, unknown>;

interface CrmLycColumn {
  id: string;
  name: string | null;
  type: string | null;
  config: unknown;
}

interface CrmLycItemValue {
  column_id: string;
  value: unknown;
}

interface CrmLycCompany {
  name: string | null;
  vat_number: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
}

const COMMON_PLACEHOLDER_MAPPING: Record<string, string> = {
  pulse_id_mks1dcwz: "order_number",
  dropdown_mktsr9n2: "origin_country",
  dropdown_mktswwk3: "dest_country",
  long_text_mkpx6q4a: "load_address",
  long_text_mkrbe20k: "unload_address",
  text_mksv7ywf: "pickup_date_text",
  text_mkx0cnkt: "pickup_schedule",
  text_mksv7kwg: "delivery_date_text",
  text_mkx0wy9h: "delivery_schedule",
  text_mksh45e7: "loading_agent",
  text_mkshv4ya: "unloading_agent",
  dropdown_mkx1naw3: "transport_type",
  color_mkse1tmc: "cargo_type",
  color_mkrb3hhk: "truck_load",
  text_mksn2w06: "weight",
  long_text_mkpwe0df: "cargo",
  long_text_mksep8bf: "extra_clauses",
  text_mksgp58v: "truck_plate",
  text_mksgs3gd: "driver_name",
  color_mkse3amh: "currency"
};

const CLIENT_PLACEHOLDER_MAPPING: Record<string, string> = {
  board_relation_mkpw4bcs: "clientCompany.name",
  lookup_mksha4n0: "clientCompany.vat_number",
  lookup_mksh4wrs: "clientCompany.address",
  lookup_mkyqf8ke: "clientCompany.email",
  deal_value: "client_price",
  numeric_mksek8d2: "client_payment_days",
  color_mksex1w8: "client_payment_terms"
};

const SUPPLIER_PLACEHOLDER_MAPPING: Record<string, string> = {
  board_relation_mkse9rp2: "supplierCompany.name",
  lookup_mksh7sx6: "supplierCompany.vat_number",
  lookup_mkshzp7g: "supplierCompany.address",
  lookup_mkshweae: "supplierCompany.email",
  numeric_mkpknkjp: "supplier_price",
  numeric_mksev08g: "supplier_payment_days",
  color_mksed6qr: "supplier_payment_terms"
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function parseConfig(config: unknown): unknown {
  if (typeof config !== "string") {
    return config;
  }
  try {
    return JSON.parse(config);
  } catch {
    return config;
  }
}

function normalizeText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return "";
}

function collectOptionCandidates(input: unknown, out: Array<{ id: string; label: string }>): void {
  const record = asRecord(input);
  if (!record) {
    return;
  }

  const labels = record.labels;
  if (labels && typeof labels === "object" && !Array.isArray(labels)) {
    for (const [id, label] of Object.entries(labels as Record<string, unknown>)) {
      const text = normalizeText(label);
      if (text) {
        out.push({ id: String(id), label: text });
      }
    }
  }

  const id = normalizeText(record.id ?? record.value ?? record.key);
  const label = normalizeText(
    record.label ?? record.name ?? record.text ?? record.title ?? record.display_value
  );
  if (id && label) {
    out.push({ id, label });
  }

  for (const value of Object.values(record)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        collectOptionCandidates(entry, out);
      }
      continue;
    }
    if (value && typeof value === "object") {
      collectOptionCandidates(value, out);
    }
  }
}

function optionLabelForId(config: unknown, id: string): string | null {
  const candidates: Array<{ id: string; label: string }> = [];
  collectOptionCandidates(parseConfig(config), candidates);
  const normalizedId = id.trim();
  return candidates.find((entry) => entry.id === normalizedId)?.label ?? null;
}

function optionIdForLabel(config: unknown, label: string): string | null {
  const candidates: Array<{ id: string; label: string }> = [];
  collectOptionCandidates(parseConfig(config), candidates);
  const normalizedLabel = label.trim().toLowerCase();
  return candidates.find((entry) => entry.label.trim().toLowerCase() === normalizedLabel)?.id ?? null;
}

function displayValueForColumnValue(value: unknown, column: CrmLycColumn): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const primitive = normalizeText(value);
    return optionLabelForId(column.config, primitive) ?? primitive;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => displayValueForColumnValue(entry, column)).filter(Boolean).join(", ");
  }

  const record = asRecord(value);
  if (!record) {
    return "";
  }

  const id = normalizeText(record.id);
  if (id) {
    const label = optionLabelForId(column.config, id);
    if (label) {
      return label;
    }
  }

  for (const key of ["label", "name", "text", "title", "display_value"]) {
    const candidate = normalizeText(record[key]);
    if (candidate) {
      return candidate;
    }
  }

  if (record.value !== undefined && record.value !== value) {
    const nested = displayValueForColumnValue(record.value, column);
    if (nested) {
      return nested;
    }
  }

  return id;
}

function linkedId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  const record = asRecord(value);
  const id = normalizeText(record?.id);
  return id || null;
}

function companyField(company: CrmLycCompany | null, field: keyof CrmLycCompany): string {
  return normalizeText(company?.[field] ?? "");
}

function mondayColumn(id: string, text: string): MondayColumnValue {
  return {
    id,
    text,
    value: JSON.stringify({ text }),
    type: "text"
  };
}

export class CrmLycClient {
  private readonly supabase: SupabaseClient;
  private readonly columnsByBoard = new Map<string, CrmLycColumn[]>();
  private loggedValueShape = false;

  constructor(
    params: {
      supabaseUrl: string;
      supabaseServiceRoleKey: string;
      crmLycBaseUrl: string;
      docAutomationApiKey: string;
    },
    supabaseClient?: SupabaseClient
  ) {
    this.supabase =
      supabaseClient ??
      createClient(params.supabaseUrl, params.supabaseServiceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      });
    this.crmLycBaseUrl = params.crmLycBaseUrl.replace(/\/+$/, "");
    this.docAutomationApiKey = params.docAutomationApiKey;
  }

  private readonly crmLycBaseUrl: string;
  private readonly docAutomationApiKey: string;

  async getBoardColumns(boardId: string): Promise<CrmLycColumn[]> {
    const cached = this.columnsByBoard.get(boardId);
    if (cached) {
      return cached;
    }

    const { data, error } = await this.supabase
      .from("board_columns")
      .select("id, name, type, config")
      .eq("board_id", boardId)
      .is("archived_at", null);

    if (error) {
      throw new Error(`crm-lyc Supabase board_columns fetch failed: ${error.message}`);
    }

    const columns = (data ?? []).map((column) => ({
      id: String(column.id),
      name: column.name ?? null,
      type: column.type ?? null,
      config: parseConfig(column.config)
    })) satisfies CrmLycColumn[];
    this.columnsByBoard.set(boardId, columns);
    return columns;
  }

  async getColumnByCrmKey(boardId: string, crmKey: string): Promise<CrmLycColumn | null> {
    const columns = await this.getBoardColumns(boardId);
    return columns.find((column) => asRecord(column.config)?.crmKey === crmKey) ?? null;
  }

  async isStatusValueForCrmKey(params: {
    boardId: string;
    columnId: string;
    crmKey: string;
    value: unknown;
    label: string;
  }): Promise<boolean> {
    const column = await this.getColumnByCrmKey(params.boardId, params.crmKey);
    if (!column) {
      throw new Error(`crm-lyc column with crmKey "${params.crmKey}" not found on board ${params.boardId}`);
    }
    if (column.id !== params.columnId) {
      return false;
    }

    const expectedId = optionIdForLabel(column.config, params.label);
    if (!expectedId) {
      throw new Error(`crm-lyc status option "${params.label}" not found for crmKey "${params.crmKey}"`);
    }

    const actualId = normalizeText(asRecord(params.value)?.id ?? params.value);
    return actualId === expectedId;
  }

  async getItemById(itemId: string, boardId = CRM_LYC_TRANSPORT_BOARD_ID): Promise<MondayItem> {
    const [{ data: itemValues, error: itemValuesError }, columns] = await Promise.all([
      this.supabase
        .from("item_values")
        .select("column_id, value")
        .eq("item_id", itemId),
      this.getBoardColumns(boardId)
    ]);

    if (itemValuesError) {
      throw new Error(`crm-lyc Supabase item_values fetch failed: ${itemValuesError.message}`);
    }

    const valueByColumnId = new Map<string, unknown>();
    for (const value of (itemValues ?? []) as CrmLycItemValue[]) {
      valueByColumnId.set(String(value.column_id), value.value);
    }

    const rawByKey: Record<string, unknown> = {};
    const textByKey: Record<string, string> = {};
    for (const column of columns) {
      const crmKey = asRecord(column.config)?.crmKey;
      if (typeof crmKey !== "string" || !crmKey.trim()) {
        continue;
      }
      if (!valueByColumnId.has(column.id)) {
        continue;
      }
      const value = valueByColumnId.get(column.id);
      rawByKey[crmKey] = value;
      textByKey[crmKey] = displayValueForColumnValue(value, column);
    }

    this.logValueShapeOnce(boardId, itemId, rawByKey);

    const [clientCompany, supplierCompany] = await Promise.all([
      this.fetchCompany(linkedId(rawByKey.company)),
      this.fetchCompany(linkedId(rawByKey.supplier_company))
    ]);

    const columnValues: MondayColumnValue[] = [];
    for (const [placeholder, crmKey] of Object.entries(COMMON_PLACEHOLDER_MAPPING)) {
      columnValues.push(mondayColumn(placeholder, textByKey[crmKey] ?? ""));
    }
    for (const [placeholder, source] of Object.entries(CLIENT_PLACEHOLDER_MAPPING)) {
      const text = source.startsWith("clientCompany.")
        ? companyField(clientCompany, source.replace("clientCompany.", "") as keyof CrmLycCompany)
        : textByKey[source] ?? "";
      columnValues.push(mondayColumn(placeholder, text));
    }
    for (const [placeholder, source] of Object.entries(SUPPLIER_PLACEHOLDER_MAPPING)) {
      const text = source.startsWith("supplierCompany.")
        ? companyField(supplierCompany, source.replace("supplierCompany.", "") as keyof CrmLycCompany)
        : textByKey[source] ?? "";
      columnValues.push(mondayColumn(placeholder, text));
    }

    const itemName = textByKey.order_number || itemId;
    return {
      id: itemId,
      name: itemName,
      board: { id: boardId },
      column_values: columnValues,
      assets: []
    };
  }

  async uploadFile(itemId: string, columnId: string, filePath: string, fileName: string): Promise<void> {
    const fileBuffer = await fs.readFile(filePath);
    const form = new FormData();
    form.append("file", fileBuffer, { filename: fileName, contentType: "application/pdf" });
    form.append("columnId", columnId);
    form.append("mode", "replace");

    const response = await axios.post(`${this.crmLycBaseUrl}/api/items/${encodeURIComponent(itemId)}/file-column`, form, {
      headers: {
        Authorization: `Bearer ${this.docAutomationApiKey}`,
        ...form.getHeaders()
      },
      maxBodyLength: Infinity,
      timeout: 30_000,
      validateStatus: () => true
    });

    if (response.status < 200 || response.status >= 300) {
      console.error(
        JSON.stringify({
          event: "crm_lyc_file_upload_failed",
          itemId,
          columnId,
          status: response.status,
          responseBody: response.data
        })
      );
      throw new Error(`crm-lyc file upload failed with status ${response.status}`);
    }
  }

  private async fetchCompany(companyId: string | null): Promise<CrmLycCompany | null> {
    if (!companyId) {
      return null;
    }
    const { data, error } = await this.supabase
      .from("companies")
      .select("name, vat_number, address, email, phone")
      .eq("id", companyId)
      .maybeSingle();

    if (error) {
      throw new Error(`crm-lyc Supabase company fetch failed: ${error.message}`);
    }
    return (data as CrmLycCompany | null) ?? null;
  }

  private logValueShapeOnce(boardId: string, itemId: string, rawByKey: Record<string, unknown>): void {
    if (this.loggedValueShape) {
      return;
    }
    this.loggedValueShape = true;
    const valueShapes = Object.fromEntries(
      Object.entries(rawByKey).map(([key, value]) => [
        key,
        Array.isArray(value) ? "array" : value === null ? "null" : typeof value
      ])
    );
    console.info(
      JSON.stringify({
        event: "crm_lyc_item_value_shape_sample",
        boardId,
        itemId,
        valueShapes
      })
    );
  }
}
