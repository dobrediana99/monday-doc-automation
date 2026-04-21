import { describe, expect, it } from "vitest";
import {
  isRomaniaClientCountry,
  normalizeCountryForEmailLanguage,
  signingEmailLanguageFromClientCountry,
  getEmailLanguage
} from "./signingEmailLocale";

describe("normalizeCountryForEmailLanguage", () => {
  it("strips diacritics so România matches romania", () => {
    expect(normalizeCountryForEmailLanguage("România")).toBe("romania");
    expect(normalizeCountryForEmailLanguage("  România  ")).toBe("romania");
  });

  it("normalizes Romania", () => {
    expect(normalizeCountryForEmailLanguage("Romania")).toBe("romania");
  });
});

describe("isRomaniaClientCountry", () => {
  it("returns true for Romania and România variants", () => {
    expect(isRomaniaClientCountry("Romania")).toBe(true);
    expect(isRomaniaClientCountry("România")).toBe(true);
    expect(isRomaniaClientCountry("ROMANIA")).toBe(true);
  });

  it("returns true for ISO RO code", () => {
    expect(isRomaniaClientCountry("RO")).toBe(true);
    expect(isRomaniaClientCountry("ro")).toBe(true);
  });

  it("returns false for other countries", () => {
    expect(isRomaniaClientCountry("Germany")).toBe(false);
    expect(isRomaniaClientCountry("Deutschland")).toBe(false);
  });

  it("returns false for empty", () => {
    expect(isRomaniaClientCountry("")).toBe(false);
    expect(isRomaniaClientCountry("   ")).toBe(false);
  });
});

describe("signingEmailLanguageFromClientCountry", () => {
  it("Romania -> ro", () => {
    expect(signingEmailLanguageFromClientCountry("România")).toBe("ro");
  });

  it("non-Romania -> en", () => {
    expect(signingEmailLanguageFromClientCountry("Austria")).toBe("en");
  });
});

describe("getEmailLanguage", () => {
  it("defaults to English when country is missing", () => {
    expect(getEmailLanguage()).toBe("en");
    expect(getEmailLanguage("")).toBe("en");
  });
});
