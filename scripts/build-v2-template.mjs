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

async function main() {
  const [src, dest] = process.argv.slice(2);
  if (!src || !dest) {
    console.error("Utilizare: node scripts/build-v2-template.mjs <sursa.docx> <destinatie.docx>");
    process.exit(1);
  }

  const zip = new PizZip(await fs.readFile(src));
  const original = zip.file("word/document.xml").asText();

  // Se lucrează PE LOC, pe șirul original. Prima versiune reconstruia documentul
  // lipind paragrafele găsite — ceea ce arunca tot ce era ÎNTRE ele: <w:tbl>,
  // <w:tr>, <w:tc>. Documentul e construit din tabele, deci ieșea un fișier pe
  // care Word refuza să-l deschidă. Aici fiecare paragraf schimbat înlocuiește
  // exact bucata lui, iar restul XML-ului rămâne bit cu bit neatins.
  const paraRe = /<w:p[ >].*?<\/w:p>/gs;
  const paras = [...original.matchAll(paraRe)].map((m) => ({ xml: m[0], start: m.index }));
  console.log(`Paragrafe: ${paras.length}`);

  let changedPlaceholders = 0;
  let changedLabels = 0;

  /** Textul nou al fiecărui paragraf, sau null dacă rămâne neschimbat. */
  const newText = paras.map(({ xml }) => {
    const text = paraText(xml);
    if (!text.trim()) return null;
    let next = text;
    for (const [from, to] of MERGED) if (next.includes(from)) next = next.split(from).join(to);
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
    return next === text ? null : next;
  });

  // Secțiunile de clauze: marcajele se LIPESC de textul paragrafelor de la
  // capete, nu se inserează paragrafe noi. Un <w:p> nou strecurat între
  // rândurile unui tabel ar strica structura; așa, XML-ul nu se schimbă deloc ca
  // formă. docxtemplater tratează la fel un bloc care începe într-un paragraf și
  // se termină în altul.
  const idxRo = paras.findIndex((p) => paraText(p.xml).trim().startsWith(TERMS_RO_START));
  const idxEn = paras.findIndex((p) => paraText(p.xml).trim().startsWith(TERMS_EN_START));
  if (idxRo < 0 || idxEn < 0 || idxEn <= idxRo) {
    throw new Error(
      `Nu am găsit ambele secțiuni de clauze (ro=${idxRo}, en=${idxEn}). ` +
        "Șablonul s-a schimbat — verifică TERMS_RO_START / TERMS_EN_START."
    );
  }
  // Capătul blocului trebuie să fie în ACELAȘI container ca începutul.
  // Clauzele stau într-un tabel (196 din cele 200 de paragrafe), iar documentul
  // se termină cu câteva paragrafe goale ÎN AFARA lui. Închizând acolo,
  // docxtemplater refuza șablonul: „the tags are misplaced, one of them is in a
  // table and the other one outside". Deci se caută ultimul paragraf cu text
  // aflat de aceeași parte a graniței.
  const tables = [...original.matchAll(/<w:tbl>.*?<\/w:tbl>/gs)].map((m) => [
    m.index,
    m.index + m[0].length,
  ]);
  const inTable = (i) => tables.some(([a, b]) => a <= paras[i].start && paras[i].start < b);

  /** Ultimul paragraf din [from..to] cu text și din același container ca `like`. */
  const closeAt = (from, to, like) => {
    for (let i = to; i >= from; i -= 1) {
      if (paraText(paras[i].xml).trim() && inTable(i) === inTable(like)) return i;
    }
    return to;
  };

  const lastRo = closeAt(idxRo, idxEn - 1, idxRo);
  const lastEn = closeAt(idxEn, paras.length - 1, idxEn);
  console.log(
    `Clauze: română ${idxRo}–${lastRo}, engleză ${idxEn}–${lastEn} (în tabel: ${inTable(idxRo)})`
  );

  const at = (i) => newText[i] ?? paraText(paras[i].xml);
  newText[idxRo] = "{#lang_ro}" + at(idxRo);
  newText[lastRo] = at(lastRo) + "{/lang_ro}";
  newText[idxEn] = "{#lang_en}" + at(idxEn);
  newText[lastEn] = at(lastEn) + "{/lang_en}";

  // Înlocuirea se face de la coadă spre cap, ca indicii celor dinainte să rămână valizi.
  let rebuilt = original;
  for (let i = paras.length - 1; i >= 0; i -= 1) {
    if (newText[i] == null) continue;
    const { xml, start } = paras[i];
    rebuilt = rebuilt.slice(0, start) + rewritePara(xml, newText[i]) + rebuilt.slice(start + xml.length);
  }

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
