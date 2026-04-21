export type SigningEmailLanguage = "ro" | "en";

/**
 * Normalize for comparison: trim, NFC, strip combining marks (â → a), lowercase, collapse spaces.
 */
export function normalizeCountryForEmailLanguage(raw: string): string {
  const trimmed = raw.trim().normalize("NFC");
  if (!trimmed) {
    return "";
  }
  return trimmed
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** True when client country of origin is Romania (incl. România, common variants). */
export function isRomaniaClientCountry(raw: string): boolean {
  const n = normalizeCountryForEmailLanguage(raw);
  if (!n) {
    return false;
  }
  if (n === "romania") {
    return true;
  }
  if (n.length === 2 && n === "ro") {
    return true;
  }
  return false;
}

export function signingEmailLanguageFromClientCountry(raw: string): SigningEmailLanguage {
  return isRomaniaClientCountry(raw) ? "ro" : "en";
}

/** Preferred name for new call sites: maps a country label/code to signing email language. */
export function getEmailLanguage(country?: string): SigningEmailLanguage {
  return signingEmailLanguageFromClientCountry(country ?? "");
}
