import { describe, expect, it } from "vitest";
import {
  SUPPLIER_EMAIL_FALLBACK_COLUMN_ID,
  SUPPLIER_SIGNING_EMAIL_COLUMN_ID,
  resolveRecipientEmail
} from "./mapping";

describe("resolveRecipientEmail transportator supplier email priority", () => {
  it("uses Email Semnare Furnizor when present (only signing email)", () => {
    const resolved = resolveRecipientEmail({
      flowType: "transportator",
      itemColumnTextById: {
        [SUPPLIER_SIGNING_EMAIL_COLUMN_ID]: "semnare@furnizor.ro"
      }
    });
    expect(resolved?.email).toBe("semnare@furnizor.ro");
    expect(resolved?.usedColumnId).toBe(SUPPLIER_SIGNING_EMAIL_COLUMN_ID);
  });

  it("uses Email Semnare Furnizor when both are present", () => {
    const resolved = resolveRecipientEmail({
      flowType: "transportator",
      itemColumnTextById: {
        [SUPPLIER_SIGNING_EMAIL_COLUMN_ID]: "semnare@furnizor.ro",
        [SUPPLIER_EMAIL_FALLBACK_COLUMN_ID]: "fallback@furnizor.ro"
      }
    });
    expect(resolved?.email).toBe("semnare@furnizor.ro");
    expect(resolved?.usedColumnId).toBe(SUPPLIER_SIGNING_EMAIL_COLUMN_ID);
  });

  it("falls back to Email Furnizor when Email Semnare Furnizor empty/invalid", () => {
    const resolved = resolveRecipientEmail({
      flowType: "transportator",
      itemColumnTextById: {
        [SUPPLIER_SIGNING_EMAIL_COLUMN_ID]: "not-an-email",
        [SUPPLIER_EMAIL_FALLBACK_COLUMN_ID]: "fallback@furnizor.ro"
      }
    });
    expect(resolved?.email).toBe("fallback@furnizor.ro");
    expect(resolved?.usedColumnId).toBe(SUPPLIER_EMAIL_FALLBACK_COLUMN_ID);
  });

  it("returns null when both missing/invalid", () => {
    const resolved = resolveRecipientEmail({
      flowType: "transportator",
      itemColumnTextById: {
        [SUPPLIER_SIGNING_EMAIL_COLUMN_ID]: "",
        [SUPPLIER_EMAIL_FALLBACK_COLUMN_ID]: "bad"
      }
    });
    expect(resolved).toBeNull();
  });
});

