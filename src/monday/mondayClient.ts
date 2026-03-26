import axios, { AxiosInstance } from "axios";
import FormData from "form-data";
import { promises as fs } from "node:fs";
import {
  ADD_FILE_TO_COLUMN,
  GET_ITEM_BY_ID,
  UPDATE_LINK,
  UPDATE_STATUS,
  UPDATE_TEXT
} from "./queries";

export interface MondayColumnValue {
  id: string;
  text: string | null;
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

  async updateStatus(boardId: string, itemId: string, columnId: string, label: string): Promise<void> {
    await this.graphql(UPDATE_STATUS, {
      boardId,
      itemId,
      columnId,
      value: JSON.stringify({ label })
    });
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
