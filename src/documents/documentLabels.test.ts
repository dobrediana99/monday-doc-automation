import { describe, expect, it } from "vitest";
import { buildLabels, languageFlags, resolveLanguages } from "./documentLabels";

describe("resolveLanguages", () => {
  it("păstrează ordinea cerută — ea decide ce apare primul în „X / Y”", () => {
    expect(resolveLanguages(["en", "ro"])).toEqual(["en", "ro"]);
    expect(resolveLanguages(["ro", "en"])).toEqual(["ro", "en"]);
  });

  it("acceptă o singură limbă", () => {
    expect(resolveLanguages(["en"])).toEqual(["en"]);
  });

  it("scoate duplicatele și normalizează („RO”, „en-GB”)", () => {
    expect(resolveLanguages(["RO", "ro", "en-GB"])).toEqual(["ro", "en"]);
  });

  it("cade pe bilingv când nu rămâne nimic valid", () => {
    // Documentul trebuie să iasă oricum; bilingv e comportamentul de azi, deci
    // cel mai puțin surprinzător.
    expect(resolveLanguages(["de", "fr"])).toEqual(["ro", "en"]);
    expect(resolveLanguages([])).toEqual(["ro", "en"]);
    expect(resolveLanguages(undefined)).toEqual(["ro", "en"]);
  });
});

describe("buildLabels", () => {
  it("reproduce exact eticheta bilingvă din șablonul aflat în uz", () => {
    const L = buildLabels(["ro", "en"]);
    expect(L.loading_country).toBe("Tara Incarcare / Loading Country");
    expect(L.cargo_type).toBe("Tip Marfa / Type of Cargo");
    expect(L.price_excl_vat).toBe("Pret (fara TVA) / Price (excl. VAT)");
  });

  it("dă o singură limbă când se cere una singură", () => {
    expect(buildLabels(["en"]).loading_country).toBe("Loading Country");
    expect(buildLabels(["ro"]).loading_country).toBe("Tara Incarcare");
  });

  it("respectă ordinea inversă", () => {
    expect(buildLabels(["en", "ro"]).weight).toBe("Weight / Masa");
  });

  it("întoarce toate cheile, ca șablonul să nu scrie niciodată „undefined”", () => {
    const L = buildLabels(["ro"]);
    for (const [key, value] of Object.entries(L)) {
      expect(value, key).toBeTruthy();
      expect(value, key).not.toContain("undefined");
    }
  });
});

describe("languageFlags", () => {
  it("aprinde doar secțiunile de clauze ale limbilor cerute", () => {
    // Clauzele contractuale sunt două secțiuni întregi în document; fără
    // comutatoarele astea, o generare „doar engleză” ar păstra și textul român.
    expect(languageFlags(["en"])).toEqual({ lang_ro: false, lang_en: true });
    expect(languageFlags(["ro"])).toEqual({ lang_ro: true, lang_en: false });
    expect(languageFlags(["ro", "en"])).toEqual({ lang_ro: true, lang_en: true });
  });
});
