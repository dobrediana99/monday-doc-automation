import { describe, expect, it } from "vitest";
import type { MondayColumnValue } from "../monday/mondayClient";
import {
  extractEmailFromMondayDisplayString,
  getMondayEmailForValidation,
  getMondayStatusLabelForValidation,
  MONDAY_EMAIL_PATTERN
} from "./mondayValues";

function emailCol(value: string | null, text: string, display?: string | null): MondayColumnValue {
  return {
    id: "email_mkse8jyb",
    text,
    value,
    display_value: display ?? null,
    type: "email"
  };
}

describe("extractEmailFromMondayDisplayString", () => {
  it("extracts first email from duplicated display", () => {
    expect(extractEmailFromMondayDisplayString("deea_dobinca@yahoo.com  - deea_dobinca@yahoo.com")).toBe(
      "deea_dobinca@yahoo.com"
    );
  });

  it("extracts email after label separator", () => {
    expect(extractEmailFromMondayDisplayString("Contabilitate - acct@example.com")).toBe("acct@example.com");
  });

  it("returns null for invalid input", () => {
    expect(extractEmailFromMondayDisplayString("not an email")).toBeNull();
  });
});

describe("getMondayEmailForValidation", () => {
  it("prefers structured email from JSON over decorative text", () => {
    const col = emailCol(
      JSON.stringify({ email: "real@example.com", text: "real@example.com - real@example.com" }),
      "real@example.com - real@example.com",
      "real@example.com - real@example.com"
    );
    expect(getMondayEmailForValidation(col)).toBe("real@example.com");
    expect(MONDAY_EMAIL_PATTERN.test(getMondayEmailForValidation(col))).toBe(true);
  });

  it("parses duplicated display when structured email is absent", () => {
    const col = emailCol(
      JSON.stringify({ text: "a@b.com - a@b.com" }),
      "a@b.com - a@b.com",
      "a@b.com - a@b.com"
    );
    expect(getMondayEmailForValidation(col)).toBe("a@b.com");
  });

  it("returns empty string for truly invalid content", () => {
    const col = emailCol(JSON.stringify({ text: "nope" }), "nope", "nope");
    expect(getMondayEmailForValidation(col)).toBe("");
  });
});

describe("getMondayStatusLabelForValidation", () => {
  function statusCol(params: { text?: string; value: string | null; type?: string }): MondayColumnValue {
    return {
      id: "color_mkx1kx5j",
      text: params.text ?? "",
      value: params.value,
      display_value: null,
      type: params.type ?? "status"
    };
  }

  it("reads label from JSON when column.text is empty (Mod Transport Principal shape)", () => {
    const col = statusCol({
      text: "",
      value: JSON.stringify({ label: { index: 2, text: "Rutier" } })
    });
    expect(getMondayStatusLabelForValidation(col)).toBe("Rutier");
  });

  it("accepts Monday color-typed status columns", () => {
    const col = statusCol({
      text: "",
      type: "color",
      value: JSON.stringify({ label: { index: 1, text: "Aerian" } })
    });
    expect(getMondayStatusLabelForValidation(col)).toBe("Aerian");
  });

  it("still surfaces placeholder values", () => {
    const col = statusCol({
      text: "Alege!",
      value: JSON.stringify({ label: { text: "Alege!" } })
    });
    expect(getMondayStatusLabelForValidation(col)).toBe("Alege!");
  });

  it("returns empty when no label is present", () => {
    const col = statusCol({ text: "", value: JSON.stringify({}) });
    expect(getMondayStatusLabelForValidation(col)).toBe("");
  });
});
