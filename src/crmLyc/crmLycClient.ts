import axios from "axios";
import FormData from "form-data";
import { promises as fs } from "node:fs";
import type { MondayColumnValue, MondayItem } from "../monday/mondayClient";

const COUNTRY_NAMES: Record<string, string> = {
  AF:"Afghanistan",AL:"Albania",DZ:"Algeria",AD:"Andorra",AO:"Angola",AR:"Argentina",
  AM:"Armenia",AU:"Australia",AT:"Austria",AZ:"Azerbaijan",BS:"Bahamas",BH:"Bahrain",
  BD:"Bangladesh",BY:"Belarus",BE:"Belgium",BZ:"Belize",BJ:"Benin",BO:"Bolivia",
  BA:"Bosnia-Herzegovina",BW:"Botswana",BR:"Brazil",BN:"Brunei Darussalam",BG:"Bulgaria",
  KH:"Cambodia",CA:"Canada",CL:"Chile",CN:"China",CO:"Colombia",HR:"Croatia",CU:"Cuba",
  CY:"Cyprus",CZ:"Czech Republic",DK:"Denmark",DO:"Dominican Republic",EG:"Egypt",
  EE:"Estonia",ET:"Ethiopia",FI:"Finland",FR:"France",GE:"Georgia, Republic of",
  DE:"Germany",GH:"Ghana",GR:"Greece",GT:"Guatemala",HN:"Honduras",HK:"Hong Kong",
  HU:"Hungary",IS:"Iceland",IN:"India",ID:"Indonesia",IR:"Iran",IQ:"Iraq",IE:"Ireland",
  IL:"Israel",IT:"Italy",JP:"Japan",JO:"Jordan",KZ:"Kazakhstan",KE:"Kenya",XK:"Kosovo",
  KW:"Kuwait",LV:"Latvia",LB:"Lebanon",LY:"Libya",LI:"Liechtenstein",LT:"Lithuania",
  LU:"Luxembourg",MY:"Malaysia",MT:"Malta",MX:"Mexico",MD:"Moldova",ME:"Montenegro",
  MA:"Morocco",MZ:"Mozambique",NL:"Netherlands",NZ:"New Zealand",NG:"Nigeria",
  MK:"North Macedonia",NO:"Norway",OM:"Oman",PK:"Pakistan",PA:"Panama",PY:"Paraguay",
  PE:"Peru",PH:"Philippines",PL:"Poland",PT:"Portugal",QA:"Qatar",RO:"Romania",
  RU:"Russia",RW:"Rwanda",SA:"Saudi Arabia",SN:"Senegal",RS:"Serbia",SG:"Singapore",
  SK:"Slovakia",SI:"Slovenia",SO:"Somalia",ZA:"South Africa",ES:"Spain",LK:"Sri Lanka",
  SD:"Sudan",SE:"Sweden",CH:"Switzerland",SY:"Syria",TW:"Taiwan",TJ:"Tajikistan",
  TZ:"Tanzania",TH:"Thailand",TN:"Tunisia",TR:"Turkey",TM:"Turkmenistan",UG:"Uganda",
  UA:"Ukraine",AE:"United Arab Emirates",GB:"United Kingdom",US:"USA",UY:"Uruguay",
  UZ:"Uzbekistan",VA:"Vatican City",VE:"Venezuela",VN:"Vietnam",YE:"Yemen",ZM:"Zambia",
  ZW:"Zimbabwe"
};

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
  judet: string | null;
  localitate: string | null;
  country: string | null;
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
  lookup_mkxwwsax: "clientCompany.judet",
  lookup_mkxtmxv3: "clientCompany.localitate",
  lookup_mkxttcky: "clientCompany.country",
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
  if (Array.isArray(input)) {
    input.forEach((entry, index) => {
      const record = asRecord(entry);
      const label = normalizeText(
        record?.label ?? record?.name ?? record?.text ?? record?.title ?? record?.display_value
      );
      if (label) {
        out.push({ id: String(index), label });
      }
      collectOptionCandidates(entry, out);
    });
    return;
  }

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
      collectOptionCandidates(value, out);
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

  for (const key of ["label", "name", "text", "title", "display_value", "display", "email", "phone"]) {
    const candidate = normalizeText(record[key]);
    if (candidate) {
      return candidate;
    }
  }

  // { codes: ["RO"] } — country column
  const codesArr = record.codes;
  if (Array.isArray(codesArr) && codesArr.length > 0) {
    return codesArr
      .map((c) => COUNTRY_NAMES[normalizeText(c).toUpperCase()] ?? normalizeText(c))
      .filter(Boolean)
      .join(", ");
  }

  if (record.value !== undefined && record.value !== value) {
    const nested = displayValueForColumnValue(record.value, column);
    if (nested) {
      return nested;
    }
  }

  // { values: [index, ...] } — dropdown / multi-select stored as option indices
  const valuesArray = record.values;
  if (Array.isArray(valuesArray) && valuesArray.length > 0) {
    return valuesArray
      .map((v) => {
        const label = optionLabelForId(column.config, normalizeText(v));
        return label ?? normalizeText(v);
      })
      .filter(Boolean)
      .join(", ");
  }

  // { number: N } — numeric columns, optionally formatted with prefix+padding (e.g. "CLS0001")
  // Prefix is only applied when padding > 0; currency-prefix columns (padding absent/0) return the bare number
  const numVal = record.number;
  if (numVal !== undefined && numVal !== null) {
    const config = asRecord(column.config);
    const padding = typeof config?.padding === "number" ? config.padding : 0;
    const numStr = normalizeText(numVal);
    if (padding > 0) {
      const prefix = typeof config?.prefix === "string" ? config.prefix : "";
      return prefix + numStr.padStart(padding, "0");
    }
    return numStr;
  }

  return id;
}

function linkedId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  const record = asRecord(value);
  if (Array.isArray(record?.company_ids) && (record.company_ids as unknown[]).length > 0) {
    const first = (record.company_ids as unknown[])[0];
    return typeof first === "string" && first.trim() ? first.trim() : null;
  }
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
  private readonly columnsByBoard = new Map<string, CrmLycColumn[]>();
  private loggedValueShape = false;
  private readonly supabaseUrl: string;
  private readonly supabaseServiceRoleKey: string;
  private readonly crmLycBaseUrl: string;
  private readonly docAutomationApiKey: string;

  constructor(params: {
    supabaseUrl: string;
    supabaseServiceRoleKey: string;
    crmLycBaseUrl: string;
    docAutomationApiKey: string;
  }) {
    this.supabaseUrl = params.supabaseUrl.replace(/\/+$/, "");
    this.supabaseServiceRoleKey = params.supabaseServiceRoleKey;
    this.crmLycBaseUrl = params.crmLycBaseUrl.replace(/\/+$/, "");
    this.docAutomationApiKey = params.docAutomationApiKey;
  }

  async getBoardColumns(boardId: string): Promise<CrmLycColumn[]> {
    const cached = this.columnsByBoard.get(boardId);
    if (cached) {
      return cached;
    }

    const data = await this.supabaseSelect<CrmLycColumn>("board_columns", {
      select: "id,name,type,config",
      board_id: `eq.${boardId}`,
      archived_at: "is.null"
    });

    const columns = data.map((column) => ({
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
    const [itemValues, columns] = await Promise.all([
      this.supabaseSelect<CrmLycItemValue>("item_values", {
        select: "column_id,value",
        item_id: `eq.${itemId}`
      }),
      this.getBoardColumns(boardId)
    ]);

    const valueByColumnId = new Map<string, unknown>();
    for (const value of itemValues) {
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

  /** Returns { storagePath, name } for the latest file in a column identified by crmKey, or null. */
  async getLatestFileFromColumn(
    itemId: string,
    boardId: string,
    columnCrmKey: string
  ): Promise<{ storagePath: string; name: string } | null> {
    const column = await this.getColumnByCrmKey(boardId, columnCrmKey);
    if (!column) return null;

    const data = await this.supabaseSelect<{ value: unknown }>("item_values", {
      select: "value",
      item_id: `eq.${itemId}`,
      column_id: `eq.${column.id}`,
      limit: "1"
    });
    const val = data[0]?.value;
    if (!val || typeof val !== "object") return null;
    const files = (val as { files?: { path: string; name: string }[] }).files;
    if (!Array.isArray(files) || files.length === 0) return null;
    const last = files[files.length - 1];
    return last?.path ? { storagePath: last.path, name: last.name ?? "document.pdf" } : null;
  }

  /** Returns the column UUID for a given crmKey on a board, or null. */
  async getColumnIdByCrmKey(boardId: string, crmKey: string): Promise<string | null> {
    const col = await this.getColumnByCrmKey(boardId, crmKey);
    return col?.id ?? null;
  }

  /** Returns display-value dict keyed by crmKey for all columns that have a crmKey. */
  async getItemTextValuesByCrmKey(itemId: string, boardId: string): Promise<Record<string, string>> {
    const [itemValues, columns] = await Promise.all([
      this.supabaseSelect<{ column_id: string; value: unknown }>("item_values", {
        select: "column_id,value",
        item_id: `eq.${itemId}`
      }),
      this.getBoardColumns(boardId)
    ]);

    const valueByColumnId = new Map<string, unknown>();
    for (const iv of itemValues) valueByColumnId.set(String(iv.column_id), iv.value);

    const result: Record<string, string> = {};
    for (const col of columns) {
      const crmKey = asRecord(col.config)?.crmKey;
      if (typeof crmKey !== "string" || !crmKey.trim()) continue;
      const raw = valueByColumnId.get(col.id);
      result[crmKey] = displayValueForColumnValue(raw, col);
    }
    return result;
  }

  /** Returns the raw JSON value for a specific crmKey column on an item, or null. */
  async getRawValueByCrmKey(itemId: string, boardId: string, crmKey: string): Promise<unknown> {
    const col = await this.getColumnByCrmKey(boardId, crmKey);
    if (!col) return null;
    const data = await this.supabaseSelect<{ value: unknown }>("item_values", {
      select: "value",
      item_id: `eq.${itemId}`,
      column_id: `eq.${col.id}`,
      limit: "1"
    });
    return data[0]?.value ?? null;
  }

  /** Returns the email of a Supabase auth user by their UUID, or null. */
  async getUserEmail(userId: string): Promise<string | null> {
    if (!userId || !/^[0-9a-f-]{36}$/.test(userId)) return null;
    const response = await axios.get<{ email?: string }>(
      `${this.supabaseUrl}/auth/v1/admin/users/${userId}`,
      {
        headers: {
          Authorization: `Bearer ${this.supabaseServiceRoleKey}`,
          apikey: this.supabaseServiceRoleKey
        },
        timeout: 10_000,
        validateStatus: () => true
      }
    );
    if (response.status !== 200) return null;
    return response.data?.email ?? null;
  }

  /** Downloads a file from Supabase Storage and returns its bytes. */
  async downloadFileFromStorage(bucket: string, storagePath: string): Promise<Buffer> {
    const url = `${this.supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${storagePath}`;
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: "arraybuffer",
      headers: {
        Authorization: `Bearer ${this.supabaseServiceRoleKey}`,
        apikey: this.supabaseServiceRoleKey
      },
      timeout: 30_000,
      validateStatus: () => true
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`crm-lyc storage download failed for ${storagePath}: HTTP ${response.status}`);
    }
    return Buffer.from(response.data);
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
    const data = await this.supabaseSelect<CrmLycCompany>("companies", {
      select: "name,vat_number,address,judet,localitate,country,email,phone",
      id: `eq.${companyId}`,
      limit: "1"
    });
    return data[0] ?? null;
  }

  private async supabaseSelect<T>(table: string, params: Record<string, string>): Promise<T[]> {
    const response = await axios.get<T[]>(`${this.supabaseUrl}/rest/v1/${table}`, {
      headers: {
        apikey: this.supabaseServiceRoleKey,
        Authorization: `Bearer ${this.supabaseServiceRoleKey}`,
        Accept: "application/json"
      },
      params,
      timeout: 20_000,
      validateStatus: () => true
    });

    if (response.status < 200 || response.status >= 300) {
      console.error(
        JSON.stringify({
          event: "crm_lyc_supabase_rest_failed",
          table,
          status: response.status,
          responseBody: response.data
        })
      );
      throw new Error(`crm-lyc Supabase REST fetch failed for ${table} with status ${response.status}`);
    }

    return Array.isArray(response.data) ? response.data : [];
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
