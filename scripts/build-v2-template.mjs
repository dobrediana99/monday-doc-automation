/**
 * Transformă un șablon existent (marcaje cu id-uri de coloană Monday, etichete
 * bilingve fixe) în varianta v2: nume semantice, etichete parametrizate pe
 * limbă și secțiuni de clauze care se pot aprinde separat.
 *
 * DE CE UN SCRIPT, NU O EDITARE MANUALĂ ÎN WORD. Șablonul se va schimba —
 * clauze noi, alt antet, altă firmă. Dacă transformarea e făcută de mână, la
 * fiecare versiune se reface tot, iar diferențele nu se pot verifica. Așa,
 * pornești mereu de la fișierul pe care juriștii l-au aprobat și rulezi asta.
 *
 * PROBLEMA CU WORD: textul unui paragraf e spart în mai multe `<w:r>`, după cum
 * a tastat omul și unde a trecut corectorul ortografic. „Tara Incarcare /
 * Loading Country:" e stocat în trei bucăți, deci o simplă căutare-înlocuire pe
 * XML nu găsește nimic. Scriptul reconstruiește paragrafele pe care le atinge,
 * păstrând formatarea primului `run` — suficient, fiindcă etichetele și
 * marcaturile sunt formatate uniform.
 *
 *   node scripts/build-v2-template.mjs <sursa.docx> <destinatie.docx>
 */
import { promises as fs } from "node:fs";
import PizZip from "pizzip";

/** Id de coloană Monday → numele semantic produs de `buildDocxModel`.
 *  Sursa: COMMON/SUPPLIER_PLACEHOLDER_MAPPING din crmLyc/crmLycClient.ts. */
const PLACEHOLDERS = {
  pulse_id_mks1dcwz: "order_number",
  dropdown_mktsr9n2: "pickup_country",
  dropdown_mktswwk3: "delivery_country",
  long_text_mkpx6q4a: "pickup_address",
  long_text_mkrbe20k: "delivery_address",
  text_mksv7ywf: "pickup_date",
  text_mkx0cnkt: "pickup_schedule",
  text_mksv7kwg: "delivery_date",
  text_mkx0wy9h: "delivery_schedule",
  text_mksh45e7: "customs_export",
  text_mkshv4ya: "customs_import",
  dropdown_mkx1naw3: "transport_type",
  color_mkse1tmc: "cargo_type",
  color_mkrb3hhk: "truck_load",
  text_mksn2w06: "cargo_weight",
  long_text_mkpwe0df: "cargo_description",
  long_text_mksep8bf: "extra_clauses_text",
  text_mksgp58v: "truck_plate",
  text_mksgs3gd: "driver_name",
  board_relation_mkse9rp2: "supplier_name",
  lookup_mksh7sx6: "supplier_vat",
  lookup_mkshzp7g: "supplier_address",
  lookup_mkshweae: "supplier_email",
  numeric_mksev08g: "supplier_payment_days",
  color_mksed6qr: "supplier_payment_terms",
};

/** Perechile preț+monedă se contopesc: în v2 suma vine deja formatată cu moneda. */
const MERGED = [
  ["{numeric_mkpknkjp} {color_mkse3amh}", "{supplier_price}"],
  ["{numeric_mkpknkjp}{color_mkse3amh}", "{supplier_price}"],
];

/** Eticheta bilingvă fixă → `{L.cheie}`, rezolvată de serviciu pe limbile cerute. */
const LABELS = [
  ["Casa de expeditie / Freight forwarder:", "{L.freight_forwarder}:"],
  ["Furnizor / Supplier:", "{L.supplier}:"],
  ["Contabilitate / Accounting:", "{L.accounting}:"],
  ["Adresa Coresp. / Post Address:", "{L.post_address}:"],
  ["COMANDA DE TRANSPORT NR. / ORDER FOR SHIPMENT NO.", "{L.order_no}"],
  ["Tara Incarcare / Loading Country:", "{L.loading_country}:"],
  ["Tara Descarcare / Delivery Country:", "{L.delivery_country}:"],
  ["Adresa Incarcare / Loading Address:", "{L.loading_address}:"],
  ["Adresa Descarcare / Delivery Address:", "{L.delivery_address}:"],
  ["Data Ora Incarcare / Date and time of Loading:", "{L.loading_datetime}:"],
  ["Data Ora Descarcare / Date and time of Unloading:", "{L.unloading_datetime}:"],
  ["Comisionar Vamal Export/ Customs for Export:", "{L.customs_export}:"],
  ["Comisionar Vamal Import/ Customs for Import:", "{L.customs_import}:"],
  ["Tip Transport / Type of Shipment:", "{L.shipment_type}:"],
  ["Tip Marfa / Type of Cargo:", "{L.cargo_type}:"],
  ["Grad Ocupare / Shipping Mode:", "{L.shipping_mode}:"],
  ["Masa / Weight:", "{L.weight}:"],
  ["Descriere Marfa / Description of Cargo:", "{L.cargo_description}:"],
  ["Clauze Suplimentare / Extra Clauses:", "{L.extra_clauses}:"],
  ["Numar Camion / Truck Plates:", "{L.truck_plates}:"],
  ["Nume Sofer / Driver Name:", "{L.driver_name}:"],
  ["Pret (fara TVA) / Price (excl. VAT):", "{L.price_excl_vat}:"],
  ["Conditii de plata / Payment Term:", "{L.payment_term}:"],
];

/** Începutul celor două secțiuni de clauze, după care se decupează. */
const TERMS_RO_START = "Conditii si clauze contractuale";
const TERMS_EN_START = "Terms and conditions";

const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
const encode = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Textul vizibil al unui paragraf. */
function paraText(xml) {
  return decode([...xml.matchAll(/<w:t[^>]*>(.*?)<\/w:t>/gs)].map((m) => m[1]).join(""));
}

/**
 * Rescrie un paragraf cu un singur `run`, păstrând proprietățile paragrafului
 * (`w:pPr`) și pe cele ale primului `run` (`w:rPr`) — adică fontul și mărimea.
 */
function rewritePara(xml, newText) {
  const pPr = xml.match(/<w:pPr>.*?<\/w:pPr>/s)?.[0] ?? "";
  const rPr = xml.match(/<w:rPr>.*?<\/w:rPr>/s)?.[0] ?? "";
  const open = xml.match(/^<w:p[^>]*>/)?.[0] ?? "<w:p>";
  return `${open}${pPr}<w:r>${rPr}<w:t xml:space="preserve">${encode(newText)}</w:t></w:r></w:p>`;
}

/** Paragraf care conține doar un marcaj de bloc (`{#lang_ro}`). */
function markerPara(marker) {
  return `<w:p><w:r><w:t xml:space="preserve">${encode(marker)}</w:t></w:r></w:p>`;
}

async function main() {
  const [src, dest] = process.argv.slice(2);
  if (!src || !dest) {
    console.error("Utilizare: node scripts/build-v2-template.mjs <sursa.docx> <destinatie.docx>");
    process.exit(1);
  }

  const zip = new PizZip(await fs.readFile(src));
  const original = zip.file("word/document.xml").asText();

  const paras = [...original.matchAll(/<w:p[ >].*?<\/w:p>/gs)].map((m) => m[0]);
  console.log(`Paragrafe: ${paras.length}`);

  let changedPlaceholders = 0;
  let changedLabels = 0;

  const out = paras.map((p) => {
    const text = paraText(p);
    if (!text.trim()) return p;

    let next = text;

    for (const [from, to] of MERGED) {
      if (next.includes(from)) next = next.split(from).join(to);
    }
    for (const [id, name] of Object.entries(PLACEHOLDERS)) {
      if (next.includes(`{${id}}`)) {
        next = next.split(`{${id}}`).join(`{${name}}`);
        changedPlaceholders += 1;
      }
    }
    for (const [from, to] of LABELS) {
      if (next.includes(from)) {
        next = next.split(from).join(to);
        changedLabels += 1;
      }
    }

    return next === text ? p : rewritePara(p, next);
  });

  // Secțiunile de clauze, învelite ca să poată fi aprinse pe limbă.
  const idxRo = out.findIndex((p) => paraText(p).trim().startsWith(TERMS_RO_START));
  const idxEn = out.findIndex((p) => paraText(p).trim().startsWith(TERMS_EN_START));
  if (idxRo < 0 || idxEn < 0 || idxEn <= idxRo) {
    throw new Error(
      `Nu am găsit ambele secțiuni de clauze (ro=${idxRo}, en=${idxEn}). ` +
        "Șablonul s-a schimbat — verifică TERMS_RO_START / TERMS_EN_START."
    );
  }
  console.log(`Clauze: română la paragraful ${idxRo}, engleză la ${idxEn}`);

  const wrapped = [
    ...out.slice(0, idxRo),
    markerPara("{#lang_ro}"),
    ...out.slice(idxRo, idxEn),
    markerPara("{/lang_ro}"),
    markerPara("{#lang_en}"),
    ...out.slice(idxEn),
    markerPara("{/lang_en}"),
  ];

  // Se reconstruiește documentul înlocuind exact zona paragrafelor: tot ce e
  // înainte de primul și după ultimul (secțiune, margini) rămâne neatins.
  const first = original.indexOf(paras[0]);
  const last = original.lastIndexOf(paras[paras.length - 1]) + paras[paras.length - 1].length;
  const rebuilt = original.slice(0, first) + wrapped.join("") + original.slice(last);

  zip.file("word/document.xml", rebuilt);
  await fs.writeFile(dest, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));

  console.log(`Marcaje redenumite: ${changedPlaceholders}`);
  console.log(`Etichete parametrizate: ${changedLabels}`);
  console.log(`Scris: ${dest}`);

  const rest = [...paraText(rebuilt).matchAll(/\{([a-z_]+_mk[a-z0-9]+)\}/g)].map((m) => m[1]);
  if (rest.length > 0) {
    console.log(`\nATENȚIE — marcaje Monday rămase nemapate: ${[...new Set(rest)].join(", ")}`);
  }
}

main().catch((err) => {
  console.error("EROARE:", err.message);
  process.exit(1);
});
