import { describe, expect, it } from "vitest";
import {
  GET_ASSETS_BY_IDS,
  GET_ITEM_BY_ID,
  GET_STATUS_COLUMN_SETTINGS
} from "./queries";

describe("Monday GraphQL query variable types (non-null list inputs)", () => {
  it("GET_ASSETS_BY_IDS declares $assetIds as [ID!]!", () => {
    expect(GET_ASSETS_BY_IDS).toContain("query GetAssetsByIds($assetIds: [ID!]!)");
    expect(GET_ASSETS_BY_IDS).not.toContain("$assetIds: [ID!])");
  });

  it("GET_ITEM_BY_ID declares $itemId as [ID!]!", () => {
    expect(GET_ITEM_BY_ID).toContain("query GetItemById($itemId: [ID!]!)");
    expect(GET_ITEM_BY_ID).not.toContain("$itemId: [ID!])");
  });

  it("GET_STATUS_COLUMN_SETTINGS declares list vars as non-null", () => {
    expect(GET_STATUS_COLUMN_SETTINGS).toContain("$boardId: [ID!]!");
    expect(GET_STATUS_COLUMN_SETTINGS).toContain("$columnIds: [String!]!");
  });
});
