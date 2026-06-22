import type { SigningEmailLanguage } from "./signingEmailLocale";
import { isRomaniaClientCountry } from "./signingEmailLocale";
import type { GenerationLegalForm } from "../utils/mapping";

export const SENDER_RO = "acc@crystal-logistics-services.com";
export const SENDER_NON_RO = "acc.ch@crystal-logistics-services.com";

export type CrmLycSigningLegalForm = Extract<GenerationLegalForm, "SRL" | "GmbH">;

export function isRomanianCountry(value?: string): boolean {
  return isRomaniaClientCountry(value ?? "");
}

export function getSenderEmail(country?: string): string {
  return isRomanianCountry(country) ? SENDER_RO : SENDER_NON_RO;
}

export function getFromHeader(country?: string): string {
  const sender = getSenderEmail(country);
  if (sender === SENDER_RO) {
    return `"Crystal Logistics" <${sender}>`;
  }
  return `"Crystal Logistics CH" <${sender}>`;
}

/** CRM-Lyc: SRL → RO mailbox; GmbH → CH mailbox. */
export function getFromHeaderForLegalForm(legalForm: CrmLycSigningLegalForm): string {
  return legalForm === "SRL" ? getFromHeader("Romania") : getFromHeader("CH");
}

export function signingEmailLanguageFromLegalForm(legalForm: CrmLycSigningLegalForm): SigningEmailLanguage {
  return legalForm === "SRL" ? "ro" : "en";
}

