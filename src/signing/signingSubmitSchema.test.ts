import { describe, expect, it } from "vitest";
import {
  bilingualMessagesForSignSubmitZodError,
  SignSubmitSchema,
  SIGN_VALIDATION_CONSENT_EN,
  SIGN_VALIDATION_CONSENT_RO,
  SIGN_VALIDATION_FULL_NAME_EN,
  SIGN_VALIDATION_FULL_NAME_RO
} from "./signingController";

describe("SignSubmitSchema", () => {
  it("accepts valid payload with trimmed full name", () => {
    const r = SignSubmitSchema.safeParse({
      consent: true,
      signaturePngBase64: "data:image/png;base64," + "x".repeat(60),
      signerFullName: "  Ion Popescu  "
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.signerFullName).toBe("Ion Popescu");
    }
  });

  it("rejects missing signerFullName", () => {
    const r = SignSubmitSchema.safeParse({
      consent: true,
      signaturePngBase64: "data:image/png;base64," + "y".repeat(60)
    });
    expect(r.success).toBe(false);
  });

  it("rejects whitespace-only full name after trim", () => {
    const r = SignSubmitSchema.safeParse({
      consent: true,
      signaturePngBase64: "data:image/png;base64," + "z".repeat(60),
      signerFullName: "   \n\t  "
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty string full name", () => {
    const r = SignSubmitSchema.safeParse({
      consent: true,
      signaturePngBase64: "data:image/png;base64," + "a".repeat(60),
      signerFullName: ""
    });
    expect(r.success).toBe(false);
  });

  it("maps Zod errors to bilingual consent message when consent is not true", () => {
    const r = SignSubmitSchema.safeParse({
      consent: false,
      signaturePngBase64: "data:image/png;base64," + "b".repeat(60),
      signerFullName: "Jane Doe"
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = bilingualMessagesForSignSubmitZodError(r.error);
      expect(msg.ro).toBe(SIGN_VALIDATION_CONSENT_RO);
      expect(msg.en).toBe(SIGN_VALIDATION_CONSENT_EN);
    }
  });

  it("maps Zod errors to bilingual full name message when name is empty after trim", () => {
    const r = SignSubmitSchema.safeParse({
      consent: true,
      signaturePngBase64: "data:image/png;base64," + "c".repeat(60),
      signerFullName: "   "
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = bilingualMessagesForSignSubmitZodError(r.error);
      expect(msg.ro).toBe(SIGN_VALIDATION_FULL_NAME_RO);
      expect(msg.en).toBe(SIGN_VALIDATION_FULL_NAME_EN);
    }
  });
});
