import axios, { AxiosInstance } from "axios";
import FormData from "form-data";
import { promises as fs } from "node:fs";
import {
  ADD_FILE_TO_COLUMN,
  GET_ASSETS_BY_IDS,
  GET_ITEM_BY_ID,
  GET_STATUS_COLUMN_SETTINGS,
  UPDATE_LINK,
  UPDATE_STATUS,
  UPDATE_TEXT
} from "./queries";

export interface MondayColumnValue {
  id: string;
  text: string | null;
  display_value?: string | null;
  value: string | null;
  type: string;
}

export interface MondayAsset {
  id: string;
  name: string;
  url: string;
  public_url: string;
  file_extension: string;
}

export interface MondayItem {
  id: string;
  name: string;
  board: { id: string };
  column_values: MondayColumnValue[];
  assets: MondayAsset[];
}

export interface MondayLatestFileAsset {
  assetId: string;
  name: string;
  url: string;
  public_url: string;
  file_extension: string;
}

export class MondayClient {
  private readonly http: AxiosInstance;
  private readonly token: string;
  private readonly apiUrl: string;

  constructor(token: string, apiUrl: string) {
    this.token = token;
    this.apiUrl = apiUrl;
    this.http = axios.create({
      baseURL: apiUrl,
      headers: {
        Authorization: token,
        "Content-Type": "application/json"
      },
      timeout: 20_000
    });
  }

  async getItemById(itemId: string): Promise<MondayItem> {
    const data = await this.graphql<{ items: MondayItem[] }>(GET_ITEM_BY_ID, { itemId: [itemId] });
    const item = data.items?.[0];
    if (!item) {
      throw new Error(`Monday item not found: ${itemId}`);
    }
    return item;
  }

  getColumnTextById(item: MondayItem): Record<string, string> {
    const out: Record<string, string> = {};
    for (const col of item.column_values) {
      out[col.id] = col.text ?? "";
      if (col.display_value && col.display_value.trim().length > 0) {
        out[col.id] = col.display_value;
      }
    }
    return out;
  }

  getColumnRawValueById(item: MondayItem): Record<string, string> {
    const out: Record<string, string> = {};
    for (const col of item.column_values) {
      out[col.id] = col.value ?? "";
    }
    return out;
  }

  getLatestFileAssetFromFileColumn(item: MondayItem, fileColumnId: string): MondayLatestFileAsset | null {
    const column = item.column_values.find((c) => c.id === fileColumnId);
    if (!column?.value) {
      return null;
    }

    try {
      const parsed = JSON.parse(column.value) as { files?: Array<{ assetId?: number | string }> };
      const files = parsed.files ?? [];
      const last = files.length > 0 ? files[files.length - 1] : null;
      const assetId = last?.assetId ? String(last.assetId) : null;
      if (!assetId) {
        return null;
      }
      const asset = item.assets.find((a) => String(a.id) === assetId);
      if (!asset) {
        return null;
      }
      return {
        assetId,
        name: asset.name,
        url: asset.url,
        public_url: asset.public_url,
        file_extension: asset.file_extension
      };
    } catch {
      return null;
    }
  }

  async getAssetById(assetId: string): Promise<MondayAsset | null> {
    const data = await this.graphql<{ assets?: MondayAsset[] }>(GET_ASSETS_BY_IDS, { assetIds: [assetId] });
    return data.assets?.[0] ?? null;
  }

  async downloadAssetBytes(assetId: string): Promise<Buffer> {
    const asset = await this.getAssetById(assetId);
    if (!asset) {
      throw new Error(`Monday asset not found: ${assetId}`);
    }

    const url = asset.public_url || asset.url;
    // Monday file URLs may require Authorization in some cases; try with auth first.
    try {
      const resp = await axios.get<ArrayBuffer>(url, {
        responseType: "arraybuffer",
        timeout: 30_000,
        headers: {
          Authorization: this.token
        }
      });
      return Buffer.from(resp.data);
    } catch {
      const resp = await axios.get<ArrayBuffer>(url, {
        responseType: "arraybuffer",
        timeout: 30_000
      });
      return Buffer.from(resp.data);
    }
  }

  async updateStatus(boardId: string, itemId: string, columnId: string, label: string): Promise<void> {
    await this.graphql(UPDATE_STATUS, {
      boardId,
      itemId,
      columnId,
      value: JSON.stringify({ label })
    });
  }

  async hasStatusLabel(boardId: string, columnId: string, label: string): Promise<boolean> {
    const data = await this.graphql<{
      boards?: Array<{
        columns?: Array<{ settings_str?: string | null }>;
      }>;
    }>(GET_STATUS_COLUMN_SETTINGS, { boardId: [boardId], columnIds: [columnId] });

    const settingsStr = data.boards?.[0]?.columns?.[0]?.settings_str;
    if (!settingsStr) {
      return false;
    }

    try {
      const parsed = JSON.parse(settingsStr) as { labels?: Record<string, string> };
      const labels = Object.values(parsed.labels ?? {}).map((entry) => entry.trim().toLowerCase());
      return labels.includes(label.trim().toLowerCase());
    } catch {
      return false;
    }
  }

  async updateStatusIfLabelExists(boardId: string, itemId: string, columnId: string, label: string): Promise<boolean> {
    const exists = await this.hasStatusLabel(boardId, columnId, label);
    if (!exists) {
      return false;
    }
    await this.updateStatus(boardId, itemId, columnId, label);
    return true;
  }

  async updateText(boardId: string, itemId: string, columnId: string, text: string): Promise<void> {
    await this.graphql(UPDATE_TEXT, {
      boardId,
      itemId,
      columnId,
      value: text
    });
  }

  async updateLink(
    boardId: string,
    itemId: string,
    columnId: string,
    url: string,
    text: string
  ): Promise<void> {
    await this.graphql(UPDATE_LINK, {
      boardId,
      itemId,
      columnId,
      value: JSON.stringify({ url, text })
    });
  }

  async uploadFile(itemId: string, columnId: string, filePath: string, fileName: string): Promise<void> {
    const fileBuffer = await fs.readFile(filePath);

    const form = new FormData();
    form.append("query", ADD_FILE_TO_COLUMN);
    form.append(
      "map",
      JSON.stringify({
        0: ["variables.file"]
      })
    );
    form.append(
      "variables",
      JSON.stringify({
        itemId,
        columnId,
        file: null
      })
    );
    form.append("0", fileBuffer, { filename: fileName, contentType: "application/pdf" });

    const response = await axios.post(`${this.apiUrl}/file`, form, {
      headers: {
        Authorization: this.token,
        ...form.getHeaders()
      },
      maxBodyLength: Infinity,
      timeout: 30_000
    });

    if (response.data?.errors?.length) {
      throw new Error(`Monday file upload failed: ${JSON.stringify(response.data.errors)}`);
    }
  }

  private async graphql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await this.http.post("", {
      query,
      variables
    });

    if (response.data?.errors?.length) {
      throw new Error(`Monday GraphQL error: ${JSON.stringify(response.data.errors)}`);
    }

    return response.data.data as T;
  }
}
