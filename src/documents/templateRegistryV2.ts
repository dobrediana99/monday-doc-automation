/**
 * Ce fișier DOCX corespunde unui `templateCode`.
 *
 * DE CE E O SIMPLĂ HARTĂ, NU O MATRICE. În v1, fișierul se deducea din
 * `tip × formă juridică` (`crmLycGenerationTrigger`), deci fiecare axă nouă
 * înmulțea numărul de fișiere: 2 tipuri × 3 forme = 6, iar a patra formă ar fi
 * făcut 8. Aici `templateCode` vine gata decis din CRM, unde stau regulile, iar
 * serviciul doar caută fișierul. Câte variante există și cum se aleg nu mai e
 * treaba serviciului.
 *
 * IDEEA E SĂ RĂMÂNĂ MICĂ. Variațiile care țin de conținut (o clauză pentru un
 * client anume, o secțiune la ADR) se fac cu `flags` și blocuri condiționale
 * `{#flag}…{/flag}` în ACELAȘI fișier. Un cod nou se adaugă doar când chiar se
 * schimbă aranjarea paginii — alt antet, altă ordine a secțiunilor, altă limbă.
 * Dacă harta asta începe să crească multiplicativ, înseamnă că se folosesc
 * fișiere acolo unde trebuiau flag-uri.
 */
export const TEMPLATE_REGISTRY_V2: Record<string, string> = {
  // Comanda de client, entitatea emitentă decide antetul și datele firmei.
  cmd_client_ro: "v2/cmd_client_RO.docx",
  cmd_client_ch: "v2/cmd_client_CH.docx",
  cmd_client_eood: "v2/cmd_client_EOOD.docx",
  // Prima transformare reală, făcută cu scripts/build-v2-template.mjs pornind de
  // la șablonul de furnizor aflat în uz. Serveşte ca probă a mecanismului:
  // aceleaşi trei limbi ies din acest singur fişier.
  cmd_furnizor_ro: "v2/cmd_furnizor_RO.docx",
  // LOAD YOUR CARGO BV. Deocamdată pornește de la aceeași bază ca celelalte —
  // numele emitentului vine din model, deci se schimbă fără fișier nou; antetul
  // tipărit și logo-ul rămân ale lui Crystal până se face un șablon propriu.
  cmd_client_lyc: "v2/cmd_client_LYC.docx"
};

export type TemplateResolution =
  | { ok: true; templateFile: string }
  | { ok: false; error: string };

export function resolveTemplateFileV2(templateCode: string): TemplateResolution {
  const templateFile = TEMPLATE_REGISTRY_V2[templateCode];
  if (!templateFile) {
    const known = Object.keys(TEMPLATE_REGISTRY_V2).join(", ") || "(niciunul)";
    return {
      ok: false,
      error: `templateCode necunoscut: "${templateCode}". Coduri disponibile: ${known}`
    };
  }
  return { ok: true, templateFile };
}

/** Codurile pe care le cunoaște serviciul — CRM-ul le poate cere ca să-și
 *  valideze regulile înainte să trimită ceva ce n-ar putea fi randat. */
export function knownTemplateCodesV2(): string[] {
  return Object.keys(TEMPLATE_REGISTRY_V2);
}
