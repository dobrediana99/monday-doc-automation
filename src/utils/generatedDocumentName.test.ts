import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { MondayItem } from "../monday/mondayClient";
import {
  buildGeneratedDocumentBaseName,
  buildGeneratedPdfFileName,
  formatOrderDateDdMmYyyy,
  ORDER_DATE_COLUMN_ID,
  resolveOrderSlugForFilename,
  sanitizeOrderIdentifierFromItemName
} from "./generatedDocumentName";
import { ORDER_NUMBER_COLUMN_ID } from "./mapping";

function itemFixture(params: { name: string; loadingDateText?: string; nrCursaText?: string }): MondayItem {
  const column_values: MondayItem["column_values"] = [];
  if (params.loadingDateText !== undefined) {
    column_values.push({
      id: ORDER_DATE_COLUMN_ID,
      text: params.loadingDateText,
      value: null,
      type: "text"
    });
  }
  if (params.nrCursaText !== undefined) {
    column_values.push({
      id: ORDER_NUMBER_COLUMN_ID,
      text: params.nrCursaText,
      value: null,
      type: "text"
    });
  }
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

describe("resolveOrderSlugForFilename", () => {
  it("prefers Nr. cursa column over pulse name", () => {
    const item = itemFixture({
      name: "TEST",
      loadingDateText: "10.04.2026",
      nrCursaText: "CLS01609"
    });
    expect(resolveOrderSlugForFilename(item)).toBe("CLS01609");
    expect(buildGeneratedDocumentBaseName({ selectedValue: "Client SRL", item })).toBe("ctr_client_RO_CLS01609_10-04-2026");
  });

  it("falls back to pulse name when Nr. cursa is empty and no CLS-only column", () => {
    const item = itemFixture({ name: "TEST", loadingDateText: "10.04.2026" });
    expect(resolveOrderSlugForFilename(item)).toBe("TEST");
  });

  it("uses any column whose full value is exactly CLS + digits", () => {
    const item: MondayItem = {
      id: "1",
      name: "Acme_Client",
      board: { id: "b" },
      column_values: [
        { id: ORDER_DATE_COLUMN_ID, text: "10.04.2026", value: null, type: "text" },
        { id: "text_other_column", text: "CLS8888", value: null, type: "text" }
      ],
      assets: []
    };
    expect(resolveOrderSlugForFilename(item)).toBe("CLS8888");
  });

  it("does not pick CLS embedded inside longer text", () => {
    const item: MondayItem = {
      id: "1",
      name: "MYORDER",
      board: { id: "b" },
      column_values: [
        { id: ORDER_DATE_COLUMN_ID, text: "10.04.2026", value: null, type: "text" },
        { id: "text_note", text: "prefix CLS9999 suffix", value: null, type: "text" }
      ],
      assets: []
    };
    expect(resolveOrderSlugForFilename(item)).toBe("MYORDER");
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

  it("builds basename without spaces when Nr. cursa is set", () => {
    const item = itemFixture({
      name: "Client_RO_TEST",
      loadingDateText: "10.04.2026",
      nrCursaText: "CLS01609"
    });
    const base = buildGeneratedDocumentBaseName({ selectedValue: "Client SRL", item });
    expect(base).not.toMatch(/\s/);
    expect(base).toBe("ctr_client_RO_CLS01609_10-04-2026");
  });
});

describe("buildGeneratedPdfFileName", () => {
  it("uses .pdf extension and matches signed filename derivation", () => {
    const item = itemFixture({
      name: "TEST",
      loadingDateText: "10.04.2026",
      nrCursaText: "CLS01609"
    });
    const pdf = buildGeneratedPdfFileName("Client SRL", item);
    expect(pdf).toBe("ctr_client_RO_CLS01609_10-04-2026.pdf");
    expect(pdf.replace(/\.pdf$/i, "") + "_signed.pdf").toBe("ctr_client_RO_CLS01609_10-04-2026_signed.pdf");
  });
});
