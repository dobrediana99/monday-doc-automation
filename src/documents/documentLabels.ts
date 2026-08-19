/**
 * Etichetele documentului, pe limbi.
 *
 * DE CE EXISTĂ. În șablonul de azi eticheta e scrisă în document, bilingv și
 * fix: „Tara Incarcare / Loading Country:". Nu se poate genera doar în engleză,
 * doar în română, sau într-o altă combinație, fără să faci un fișier separat
 * pentru fiecare variantă. Mutând etichetele aici, șablonul conține doar
 * `{L.loading_country}`, iar limba devine un parametru al generării.
 *
 * FORMA REZULTATULUI. Limbile cerute se compun în ordinea primită, despărțite
 * prin „ / " — exact cum arată documentul acum. `["ro","en"]` dă „Tara
 * Incarcare / Loading Country:", `["en"]` dă „Loading Country:". Deci varianta
 * bilingvă de azi rămâne bit cu bit aceeași, iar celelalte apar din același
 * fișier.
 *
 * CE NU REZOLVĂ. Aici sunt doar ETICHETELE. Textul clauzelor contractuale e în
 * corpul documentului, în două secțiuni întregi (română și engleză), care se
 * aprind cu `lang_ro` / `lang_en`. O limbă pentru care nu există secțiunea de
 * clauze nu poate fi generată complet, oricâte etichete am traduce — vezi
 * `resolveLanguages`.
 */

export type DocLanguage = "ro" | "en";

/** Limbile pentru care documentul are ȘI clauzele contractuale traduse. */
export const SUPPORTED_LANGUAGES: DocLanguage[] = ["ro", "en"];

export function isSupportedLanguage(value: unknown): value is DocLanguage {
  return value === "ro" || value === "en";
}

type LabelKey =
  | "freight_forwarder"
  | "supplier"
  | "client"
  | "accounting"
  | "post_address"
  | "order_no"
  | "loading_country"
  | "delivery_country"
  | "loading_address"
  | "delivery_address"
  | "loading_datetime"
  | "unloading_datetime"
  | "customs_export"
  | "customs_import"
  | "shipment_type"
  | "cargo_type"
  | "shipping_mode"
  | "weight"
  | "cargo_description"
  | "extra_clauses"
  | "truck_plates"
  | "driver_name"
  | "price_excl_vat"
  | "payment_term"
  | "days"
  | "stops"
  | "insurance"
  | "accessorials";

/** Textele preluate CUVÂNT CU CUVÂNT din șablonul aflat în uz, ca varianta
 *  bilingvă generată să fie identică cu documentul de azi. */
const LABELS: Record<LabelKey, Record<DocLanguage, string>> = {
  freight_forwarder: { ro: "Casa de expeditie", en: "Freight forwarder" },
  supplier: { ro: "Furnizor", en: "Supplier" },
  client: { ro: "Client", en: "Client" },
  accounting: { ro: "Contabilitate", en: "Accounting" },
  post_address: { ro: "Adresa Coresp.", en: "Post Address" },
  order_no: { ro: "COMANDA DE TRANSPORT NR.", en: "ORDER FOR SHIPMENT NO." },
  loading_country: { ro: "Tara Incarcare", en: "Loading Country" },
  delivery_country: { ro: "Tara Descarcare", en: "Delivery Country" },
  loading_address: { ro: "Adresa Incarcare", en: "Loading Address" },
  delivery_address: { ro: "Adresa Descarcare", en: "Delivery Address" },
  loading_datetime: { ro: "Data Ora Incarcare", en: "Date and time of Loading" },
  unloading_datetime: { ro: "Data Ora Descarcare", en: "Date and time of Unloading" },
  customs_export: { ro: "Comisionar Vamal Export", en: "Customs for Export" },
  customs_import: { ro: "Comisionar Vamal Import", en: "Customs for Import" },
  shipment_type: { ro: "Tip Transport", en: "Type of Shipment" },
  cargo_type: { ro: "Tip Marfa", en: "Type of Cargo" },
  shipping_mode: { ro: "Grad Ocupare", en: "Shipping Mode" },
  weight: { ro: "Masa", en: "Weight" },
  cargo_description: { ro: "Descriere Marfa", en: "Description of Cargo" },
  extra_clauses: { ro: "Clauze Suplimentare", en: "Extra Clauses" },
  truck_plates: { ro: "Numar Camion", en: "Truck Plates" },
  driver_name: { ro: "Nume Sofer", en: "Driver Name" },
  price_excl_vat: { ro: "Pret (fara TVA)", en: "Price (excl. VAT)" },
  payment_term: { ro: "Conditii de plata", en: "Payment Term" },
  days: { ro: "zile", en: "days" },
  // Etichete pentru secțiunile pe care v1 nu le putea reprezenta deloc.
  stops: { ro: "Opriri", en: "Stops" },
  insurance: { ro: "Asigurare marfa", en: "Cargo insurance" },
  accessorials: { ro: "Servicii accesorii", en: "Accessorial services" },
};

/**
 * Limbile efective, din ce s-a cerut.
 *
 * Se păstrează ordinea cerută (ea decide ce apare primul în „X / Y"), se scot
 * duplicatele și limbile fără clauze traduse. Dacă nu rămâne niciuna, se cade
 * pe bilingv — documentul trebuie să iasă oricum, iar varianta bilingvă e cea
 * de azi, deci cea mai puțin surprinzătoare.
 */
export function resolveLanguages(requested: readonly string[] | undefined): DocLanguage[] {
  const out: DocLanguage[] = [];
  for (const lang of requested ?? []) {
    const normalized = String(lang).toLowerCase().slice(0, 2);
    if (isSupportedLanguage(normalized) && !out.includes(normalized)) {
      out.push(normalized);
    }
  }
  return out.length > 0 ? out : ["ro", "en"];
}

/**
 * Dicționarul gata compus, pentru `{L.cheie}` din șablon.
 *
 * Cheile lipsă nu trebuie să randeze „undefined": docxtemplater ar scrie exact
 * asta în document. De aceea se întoarce un obiect complet, cu toate cheile.
 */
export function buildLabels(languages: readonly DocLanguage[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, byLang] of Object.entries(LABELS)) {
    out[key] = languages.map((l) => byLang[l]).join(" / ");
  }
  return out;
}

/** Comutatoarele secțiunilor de clauze: `{#lang_ro}…{/lang_ro}`. */
export function languageFlags(languages: readonly DocLanguage[]): Record<string, boolean> {
  return {
    lang_ro: languages.includes("ro"),
    lang_en: languages.includes("en"),
  };
}
