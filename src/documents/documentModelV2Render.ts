import { buildLabels, languageFlags, resolveLanguages } from "./documentLabels";
import type { Accessorial, DocumentModelV2, Party, Stop } from "./documentModelV2";

/**
 * Traduce modelul v2 în obiectul pe care îl consumă docxtemplater.
 *
 * DE CE E UN PAS SEPARAT. Modelul v2 e contractul cu CRM-ul — imbricat, tipat,
 * gândit pentru citit. Șabloanele DOCX vor altceva: chei plate pentru
 * `{client_name}` și liste pentru `{#stops}…{/stops}`. Ținându-le separate,
 * șablonul se poate schimba fără să atingi contractul, și invers.
 *
 * REGULA DE PRECEDENȚĂ: întâi se calculează comutatoarele derivate din date
 * (`has_insurance` e adevărat pentru că EXISTĂ o asigurare), apoi se aplică
 * peste ele `flags` venite din CRM. Regulile din CRM au ultimul cuvânt — ele
 * pot stinge o secțiune chiar dacă datele există (un client care nu vrea
 * accesorialele detaliate pe comandă) sau aprinde una fără date (o clauză care
 * ține doar de firmă). Invers n-ar avea sens: serviciul n-are cum să știe
 * regulile comerciale.
 */

const STOP_LABEL: Record<Stop["type"], string> = {
  pickup: "Încărcare",
  delivery: "Descărcare"
};

/** Sumă cu monedă, ca text. Gol când lipsește, ca șablonul să nu scrie „undefined”. */
function money(amount: number | undefined, currency: string | undefined): string {
  if (amount == null || !currency) {
    return "";
  }
  return `${amount.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

/** Prefixează cheile unei părți: `client` + `name` → `client_name`. */
function partyFields(prefix: string, party: Party | undefined): Record<string, string> {
  const p = party ?? ({} as Party);
  return {
    [`${prefix}_name`]: p.name ?? "",
    [`${prefix}_legal_form`]: p.legalForm ?? "",
    [`${prefix}_vat`]: p.vat ?? "",
    [`${prefix}_reg_com`]: p.regCom ?? "",
    [`${prefix}_address`]: p.address ?? "",
    [`${prefix}_country`]: p.country ?? "",
    [`${prefix}_email`]: p.email ?? "",
    [`${prefix}_phone`]: p.phone ?? "",
    [`${prefix}_contact`]: p.contactName ?? "",
    [`${prefix}_iban`]: p.iban ?? "",
    [`${prefix}_bank`]: p.bank ?? ""
  };
}

function stopFields(stop: Stop, index: number): Record<string, unknown> {
  return {
    index: index + 1,
    type: stop.type,
    type_label: STOP_LABEL[stop.type],
    country: stop.country,
    city: stop.city,
    address: stop.address,
    address_extra: stop.addressExtra ?? "",
    /** Adresa completă pe un rând — ce vrea majoritatea șabloanelor. */
    full: [stop.city, stop.address, stop.addressExtra].filter(Boolean).join(", "),
    date: stop.date ?? "",
    schedule: stop.schedule ?? ""
  };
}

function accessorialFields(acc: Accessorial): Record<string, unknown> {
  return {
    category: acc.category,
    label: acc.label,
    amount: acc.amount ?? "",
    amount_text: money(acc.amount, acc.currency)
  };
}

export function buildDocxModel(model: DocumentModelV2): Record<string, unknown> {
  const pickups = model.route.stops.filter((s) => s.type === "pickup");
  const deliveries = model.route.stops.filter((s) => s.type === "delivery");
  const accessorials = model.accessorials ?? [];
  const extraClauses = model.terms?.extraClauses ?? [];

  /** Comutatoare deduse din date. `flags` din CRM le suprascrie mai jos. */
  const derived: Record<string, boolean> = {
    has_insurance: model.insurance != null,
    has_accessorials: accessorials.length > 0,
    has_extra_clauses: extraClauses.length > 0,
    has_client: model.parties.client != null,
    has_supplier: model.parties.supplier != null,
    // Opririle peste minimul de două schimbă structura tabelului din document,
    // deci șablonul trebuie să poată întreba explicit.
    has_extra_stops: model.route.stops.length > 2,
    has_adr: Boolean(model.cargo?.adrClass),
    has_temperature: model.cargo?.temperatureMin != null || model.cargo?.temperatureMax != null
  };

  // Limba e un parametru, nu o proprietate a fișierului: etichetele se compun
  // aici, iar șablonul conține doar `{L.cheie}`. Așa aceeași bază dă varianta
  // bilingvă de azi, una doar în engleză, sau una doar în română.
  const languages = resolveLanguages(model.meta.languages);

  const docx: Record<string, unknown> = {
    ...derived,
    ...languageFlags(languages),
    ...model.flags,
    /** Etichetele compuse, folosite ca `{L.loading_country}`. */
    L: buildLabels(languages),
    languages: languages.join(","),

    ...partyFields("issuer", model.parties.issuer),
    ...partyFields("client", model.parties.client),
    ...partyFields("supplier", model.parties.supplier),

    order_number: model.order.number,
    order_date: model.order.date ?? "",
    order_department: model.order.department ?? "",
    order_assigned: model.order.assigned ?? "",
    order_source: model.order.source ?? "",
    client_price: money(model.order.clientPrice?.amount, model.order.clientPrice?.currency),
    supplier_price: money(model.order.supplierPrice?.amount, model.order.supplierPrice?.currency),

    transport_mode: model.route.transportMode ?? "",
    transport_type: model.route.transportType ?? "",
    distance_km: model.route.distanceKm ?? "",

    stops: model.route.stops.map(stopFields),
    pickups: pickups.map(stopFields),
    deliveries: deliveries.map(stopFields),
    // Șabloanele simple, cu o singură încărcare și o singură descărcare, iau
    // direct prima și ultima — fără să știe că modelul suportă mai multe.
    ...(pickups[0]
      ? Object.fromEntries(
          Object.entries(stopFields(pickups[0], 0)).map(([k, v]) => [`pickup_${k}`, v])
        )
      : {}),
    ...(deliveries.length > 0
      ? Object.fromEntries(
          Object.entries(stopFields(deliveries[deliveries.length - 1]!, 0)).map(([k, v]) => [
            `delivery_${k}`,
            v
          ])
        )
      : {}),

    cargo_description: model.cargo?.description ?? "",
    cargo_type: model.cargo?.type ?? "",
    truck_load: model.cargo?.truckLoad ?? "",
    truck_type: model.cargo?.truckType ?? "",
    cargo_weight: model.cargo?.weightKg ?? "",
    cargo_ldm: model.cargo?.ldm ?? "",
    cargo_pallets: model.cargo?.pallets ?? "",
    adr_class: model.cargo?.adrClass ?? "",
    temperature_min: model.cargo?.temperatureMin ?? "",
    temperature_max: model.cargo?.temperatureMax ?? "",

    accessorials: accessorials.map(accessorialFields),

    insurance_value: money(model.insurance?.cargoValue, model.insurance?.currency),
    insurance_premium: money(model.insurance?.premium, model.insurance?.currency),

    client_payment_days: model.terms?.client?.days ?? "",
    client_payment_terms: model.terms?.client?.terms ?? "",
    supplier_payment_days: model.terms?.supplier?.days ?? "",
    supplier_payment_terms: model.terms?.supplier?.terms ?? "",
    extra_clauses: extraClauses.map((text) => ({ text }))
  };

  return docx;
}
