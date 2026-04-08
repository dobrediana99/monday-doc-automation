import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { MondayItem } from "../monday/mondayClient";
import {
  buildGeneratedDocumentBaseName,
  formatOrderDateDdMmYyyy,
  ORDER_DATE_COLUMN_ID,
  sanitizeOrderIdentifierFromItemName
} from "./generatedDocumentName";

function itemFixture(params: { name: string; loadingDateText?: string }): MondayItem {
  const column_values =
    params.loadingDateText !== undefined
      ? [
          {
            id: ORDER_DATE_COLUMN_ID,
            text: params.loadingDateText,
            value: null,
            type: "text"
          }
        ]
      : [];
  return {
    id: "123",
    name: params.name,
    board: { id: "board1" },
    column_values,
    assets: []
  };
}

describe("sanitizeOrderIdentifierFromItemName", () => {
  it("keeps alphanumeric order codes", () => {
    expect(sanitizeOrderIdentifierFromItemName("CLS8766")).toBe("CLS8766");
  });
});

describe("formatOrderDateDdMmYyyy", () => {
  it("parses dotted EU dates", () => {
    const item = itemFixture({ name: "x", loadingDateText: "19.12.2025" });
    expect(formatOrderDateDdMmYyyy(item)).toBe("19-12-2025");
  });
});

describe("buildGeneratedDocumentBaseName", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds client RO name with order id and loading date", () => {
    const item = itemFixture({ name: "CLS8766", loadingDateText: "19.12.2025" });
    expect(buildGeneratedDocumentBaseName({ selectedValue: "Client SRL", item })).toBe(
      "ctr_client_RO_CLS8766_19-12-2025"
    );
  });

  it("builds client EOOD name", () => {
    const item = itemFixture({ name: "CLS8766", loadingDateText: "19-12-2025" });
    expect(buildGeneratedDocumentBaseName({ selectedValue: "Client EOOD", item })).toBe(
      "ctr_client_EOOD_CLS8766_19-12-2025"
    );
  });

  it("builds furnizor CH name for Trans. GmbH", () => {
    const item = itemFixture({ name: "CLS8766", loadingDateText: "19-12-2025" });
    expect(buildGeneratedDocumentBaseName({ selectedValue: "Trans. GmbH", item })).toBe(
      "ctr_furnizor_CH_CLS8766_19-12-2025"
    );
  });

  it("builds furnizor EOOD name for Trans. EOOD", () => {
    const item = itemFixture({ name: "CLS8766", loadingDateText: "19-12-2025" });
    expect(buildGeneratedDocumentBaseName({ selectedValue: "Trans. EOOD", item })).toBe(
      "ctr_furnizor_EOOD_CLS8766_19-12-2025"
    );
  });
});
