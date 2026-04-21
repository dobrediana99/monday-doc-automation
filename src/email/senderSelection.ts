import { isRomaniaClientCountry } from "./signingEmailLocale";

export const SENDER_RO = "acc@crystal-logistics-services.com";
export const SENDER_NON_RO = "acc.ch@crystal-logistics-services.com";

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

