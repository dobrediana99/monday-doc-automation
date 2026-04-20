import { describe, expect, it, vi, afterEach } from "vitest";
import axios from "axios";
import type { MondayItem } from "./mondayClient";
import { MondayClient } from "./mondayClient";
import { EMAIL_SUBJECT_ORDER_ID_COLUMN_ID } from "../utils/mapping";

describe("MondayClient.getAssetById", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls GraphQL with GetAssetsByIds and non-null list variable shape", async () => {
    const post = vi.fn().mockResolvedValue({
      data: {
        data: {
          assets: [
            {
              id: "123456789",
              name: "doc.pdf",
              url: "https://example.com/file",
              public_url: "https://example.com/public",
              file_extension: "pdf"
            }
          ]
        }
      }
    });

    vi.spyOn(axios, "create").mockReturnValue({ post } as ReturnType<typeof axios.create>);

    const client = new MondayClient("test-token", "https://api.monday.com/v2");
    const asset = await client.getAssetById("123456789");

    expect(asset).not.toBeNull();
    expect(asset?.id).toBe("123456789");
    expect(post).toHaveBeenCalledTimes(1);
    const body = post.mock.calls[0][1] as { query: string; variables: { assetIds: string[] } };
    expect(body.variables).toEqual({ assetIds: ["123456789"] });
    expect(body.query).toContain("query GetAssetsByIds($assetIds: [ID!]!)");
    expect(body.query).toContain("assets(ids: $assetIds)");
  });
});

describe("MondayClient.getColumnTextById", () => {
  it("uses robust extraction (value JSON) when text is empty (pulse_id_mks1dcwz)", () => {
    const client = new MondayClient("test-token", "https://api.monday.com/v2");
    const item: MondayItem = {
      id: "1",
      name: "TEST_diana",
      board: { id: "b1" },
      assets: [],
      column_values: [
        {
          id: EMAIL_SUBJECT_ORDER_ID_COLUMN_ID,
          type: "text",
          text: "",
          display_value: "",
          value: JSON.stringify({ text: "CLS-01609" })
        }
      ]
    };

    const columnText = client.getColumnTextById(item);
    expect(columnText[EMAIL_SUBJECT_ORDER_ID_COLUMN_ID]).toBe("CLS-01609");
  });
});
