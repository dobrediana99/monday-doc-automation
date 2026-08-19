import { z } from "zod";

/**
 * Modelul de document v2 — contractul dintre CRM și serviciul ăsta.
 *
 * CE SCHIMBĂ FAȚĂ DE v1. Astăzi CRM-ul trimite doar `{ template, legalForm }`,
 * iar serviciul își trage singur datele din Supabase și le aplatizează într-un
 * obiect cu chei de coloană Monday (`board_relation_mkpw4bcs`, `deal_value`).
 * Din asta ies două limite:
 *
 *   • varianta e o matrice fixă tip × formă juridică, deci fiecare combinație
 *     nouă cere un fișier DOCX nou — numărul lor crește multiplicativ;
 *   • modelul e PLAT, deci o cursă cu trei opriri și cinci accesoriale nu
 *     încape în el.
 *
 * v2 inversează sensul: CRM-ul CONSTRUIEȘTE modelul și îl trimite, iar
 * serviciul doar randează. CRM-ul e locul unde stau regulile, companiile și
 * datele cursei, deci tot acolo se decide ce intră în document. Serviciul
 * rămâne un randator care nu știe reguli de business.
 *
 * DE CE ATÂTEA CÂMPURI OPȚIONALE. O comandă de client fără asigurare, fără
 * accesoriale și cu o singură oprire e la fel de validă ca una cu toate. Ce
 * lipsește nu e o eroare — pur și simplu nu se randează secțiunea. Obligatoriu
 * e doar minimul fără de care documentul n-are sens juridic: părțile, ruta și
 * prețul. Restul e opțional prin construcție, iar validarea „ce trebuie
 * completat” se face în CRM, unde omul poate fi trimis să completeze celula.
 *
 * `flags` e mecanismul prin care se schimbă DESIGNUL, nu doar valorile: în DOCX
 * blocurile se scriu `{#adr}…{/adr}`, iar docxtemplater le include doar când
 * flag-ul e adevărat. Așa o clauză nouă pentru un client anume înseamnă o regulă
 * în CRM plus un bloc în șablonul existent, nu un fișier nou.
 */

/** Adresă de oprire. `addressExtra` e ce nu găsești pe hartă („hala 3, poarta B”). */
export const StopSchema = z.object({
  type: z.enum(["pickup", "delivery"]),
  country: z.string().min(1),
  city: z.string().min(1),
  address: z.string().min(1),
  addressExtra: z.string().optional(),
  /** Text, nu dată: pe comandă apare exact cum l-a scris agentul („12-14.08”). */
  date: z.string().optional(),
  schedule: z.string().optional()
});

export const PartySchema = z.object({
  name: z.string().min(1),
  legalForm: z.string().optional(),
  vat: z.string().optional(),
  regCom: z.string().optional(),
  address: z.string().optional(),
  country: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  contactName: z.string().optional(),
  iban: z.string().optional(),
  bank: z.string().optional()
});

export const AccessorialSchema = z.object({
  category: z.string().min(1),
  label: z.string().min(1),
  amount: z.number().optional(),
  currency: z.string().optional()
});

export const MoneySchema = z.object({
  amount: z.number(),
  currency: z.string().min(1)
});

export const PaymentTermsSchema = z.object({
  days: z.number().optional(),
  terms: z.string().optional()
});

export const DocumentModelV2Schema = z.object({
  /** Versiunea contractului. Serviciul refuză ce nu cunoaște, ca un CRM mai nou
   *  să nu fie randat tăcut greșit de un serviciu mai vechi. */
  version: z.literal(2),

  meta: z.object({
    boardId: z.string().min(1),
    itemId: z.string().min(1),
    /** Ce șablon se folosește. Numele e stabilit de regulile din CRM, nu dedus
     *  aici dintr-o matrice — ăsta e tot rostul lui v2. */
    templateCode: z.string().min(1),
    /** Coloana de fișier în care se urcă rezultatul, pe crmKey. Vine din payload
     *  ca butonul de test să scrie în coloana lui, niciodată peste documentul
     *  real, care poate fi deja semnat. */
    uploadColumnCrmKey: z.string().min(1),
    /** Numele fișierului generat, fără extensie. Lipsă → se compune din
     *  templateCode + numărul comenzii. */
    fileName: z.string().optional(),
    /**
     * Limbile documentului, în ordinea în care apar în etichetele compuse
     * („Tara Incarcare / Loading Country"). Lipsă → bilingv, adică exact
     * comportamentul de azi. Ce nu e suportat se ignoră; vezi `resolveLanguages`.
     */
    languages: z.array(z.string()).optional()
  }),

  /** Comutatoarele de secțiuni din DOCX. Decise de reguli în CRM. */
  flags: z.record(z.string(), z.boolean()).default({}),

  parties: z.object({
    /** Entitatea care emite documentul (Crystal SRL / GmbH / EOOD). */
    issuer: PartySchema,
    client: PartySchema.optional(),
    supplier: PartySchema.optional()
  }),

  order: z.object({
    number: z.string().min(1),
    date: z.string().optional(),
    clientPrice: MoneySchema.optional(),
    supplierPrice: MoneySchema.optional(),
    department: z.string().optional(),
    assigned: z.string().optional(),
    source: z.string().optional()
  }),

  /** Ruta ca listă, nu ca pereche de câmpuri: asta permite opriri multiple.
   *  Minimum două opriri — altfel nu e transport. */
  route: z.object({
    stops: z.array(StopSchema).min(2),
    transportMode: z.string().optional(),
    transportType: z.string().optional(),
    distanceKm: z.number().optional(),
    customsExport: z.string().optional(),
    customsImport: z.string().optional()
  }),

  cargo: z
    .object({
      description: z.string().optional(),
      type: z.string().optional(),
      truckLoad: z.string().optional(),
      truckType: z.string().optional(),
      weightKg: z.number().optional(),
      ldm: z.number().optional(),
      pallets: z.number().optional(),
      adrClass: z.string().optional(),
      truckPlate: z.string().optional(),
      driverName: z.string().optional(),
      temperatureMin: z.number().optional(),
      temperatureMax: z.number().optional()
    })
    .optional(),

  accessorials: z.array(AccessorialSchema).optional(),

  insurance: z
    .object({
      cargoValue: z.number(),
      currency: z.string().min(1),
      premium: z.number().optional()
    })
    .optional(),

  terms: z
    .object({
      client: PaymentTermsSchema.optional(),
      supplier: PaymentTermsSchema.optional(),
      /** Clauze libere, câte una pe rând în document. */
      extraClauses: z.array(z.string()).optional()
    })
    .optional()
});

export type DocumentModelV2 = z.infer<typeof DocumentModelV2Schema>;
export type Stop = z.infer<typeof StopSchema>;
export type Party = z.infer<typeof PartySchema>;
export type Accessorial = z.infer<typeof AccessorialSchema>;

export type ParseResult =
  | { ok: true; model: DocumentModelV2 }
  | { ok: false; errors: string[] };

/**
 * Validează payload-ul primit. Erorile se întorc ca listă de mesaje cu calea
 * câmpului, ca CRM-ul să le poată arăta omului fără să ghicească ce a picat.
 */
export function parseDocumentModelV2(input: unknown): ParseResult {
  const parsed = DocumentModelV2Schema.safeParse(input);
  if (parsed.success) {
    return { ok: true, model: parsed.data };
  }
  const errors = parsed.error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return { ok: false, errors };
}
