/**
 * Centralized mapping of Monday.com board IDs, Connect Boards relations,
 * and mirror (lookup) column definitions across all CRM boards.
 *
 * Boards covered:
 *   - Companii       (1853156756)
 *   - Contacte       (1853156713)
 *   - Leads          (1853156722)
 *   - Solicitari     (1905911565)
 *   - Comenzi/Curse  (2030349838)
 *
 * Mirror column pattern in Monday:
 *   board_relation column (Connect Boards) → lookup column (Mirror)
 *   The mirror column displays data from the LINKED board's column.
 *   Each mirror can pull from multiple source boards (via the same relation).
 */

// ─── Board IDs ────────────────────────────────────────────────────────────────

export const BOARD_ID = {
  COMPANII:   "1853156756",
  CONTACTE:   "1853156713",
  LEADS:      "1853156722",
  SOLICITARI: "1905911565",
  COMENZI:    "2030349838",
} as const;

export type BoardKey = keyof typeof BOARD_ID;

// ─── Mirror Column Definition ─────────────────────────────────────────────────

export interface MirrorColumnDef {
  /** ID of the mirror (lookup) column on this board */
  id: string;
  /** Human-readable name */
  title: string;
  /** ID of the Connect Boards column that drives this mirror */
  relationColumnId: string;
  /**
   * Which column is mirrored from each source board.
   * Key = source board ID, Value = source column ID on that board.
   */
  sources: Partial<Record<string, string>>;
}

// ─── Connect Boards (board_relation) Columns ──────────────────────────────────

/**
 * Connect Boards column IDs on the COMPANII board (1853156756).
 * These are the "parent" relations that the mirror columns below are based on.
 */
export const COMPANII_RELATIONS = {
  /** Primary relation → Contacte (1853156713) and Solicitari (1905911565) */
  contacte:      "board_relation_mkpdn5kt",
  solicitari:    "board_relation_mkxbk29q",
  leads:         "board_relation_mkxbjtz1",
  comenziCurse1: "board_relation_mkty6876",
  comenziCurse2: "board_relation_mm3r1ctz",
  juridic:       "board_relation_mkv6v10v",
} as const;

/**
 * Connect Boards column IDs on the CONTACTE board (1853156713).
 */
export const CONTACTE_RELATIONS = {
  /** Primary relation → Companii (1853156756); also links Solicitari (1905911565) */
  companie:    "board_relation_mkpd8qmf",
  solicitari1: "board_relation_mkq9jvf9",
  solicitari2: "board_relation_mm09dapg",
  solicitari3: "board_relation_mm0943hg",
  comenzi:     "board_relation_mktz64qj",
} as const;

/**
 * Connect Boards column IDs on the LEADS board (1853156722).
 */
export const LEADS_RELATIONS = {
  /** Links Contacte (1853156713) and Companii (1853156756) */
  contacteCompanii: "board_relation_mkxbyt1s",
  /** Links Solicitari (1905911565) and Comenzi (2030349838) */
  solicitariCurse:  "board_relation_mkxbdjwp",
  activitati:       "board_relation_mks98d7s",
} as const;

/**
 * Connect Boards column IDs on the SOLICITARI board (1905911565).
 */
export const SOLICITARI_RELATIONS = {
  /** Relation to Companii (client) */
  companie:    "board_relation_mkpw4bcs",
  /** Relation to Contacte (primary) and Companii */
  contacte:    "board_relation_mkq9am7f",
  comenzi:     "board_relation_mm21ka9j",
  altaSolicit: "board_relation_mkx75yv7",
} as const;

/**
 * Connect Boards column IDs on the COMENZI/CURSE board (2030349838).
 * These drive the mirror columns used in document generation.
 */
export const COMENZI_RELATIONS = {
  /** Relation to Companii — used for CLIENT data mirrors */
  companieClient:   "board_relation_mkpw4bcs",
  /** Relation to Companii — used for SUPPLIER data mirrors */
  companieFurnizor: "board_relation_mkse9rp2",
  /** Relation to Contacte (Persoana Client) */
  contacteClient:   "board_relation_mkshmkgt",
} as const;

// ─── Mirror Columns on COMPANII (from Contacte via board_relation_mkpdn5kt) ───

/**
 * Mirror columns on the Companii board.
 * All driven by the "Contacte" relation (board_relation_mkpdn5kt),
 * which connects to Contacte (1853156713) and Solicitari (1905911565).
 */
export const COMPANII_MIRROR_COLUMNS: Record<string, MirrorColumnDef> = {
  solicitari: {
    id:               "lookup_mkrcqnn5",
    title:            "Solicitari",
    relationColumnId: COMPANII_RELATIONS.contacte,
    sources: {
      [BOARD_ID.CONTACTE]:   "board_relation_mkq9jvf9", // Solicitari (relation on Contacte)
      [BOARD_ID.SOLICITARI]: "board_relation_mkpw4bcs", // Companie (relation on Solicitari)
    },
  },
  lastUpdated: {
    id:               "lookup_mks2nzs8",
    title:            "Last Updated",
    relationColumnId: COMPANII_RELATIONS.contacte,
    sources: {
      [BOARD_ID.CONTACTE]:   "pulse_updated_mks2bw12",
      [BOARD_ID.SOLICITARI]: "pulse_updated_mks28vty",
    },
  },
  status: {
    id:               "lookup_mkq8mawy",
    title:            "Status (Ultima Discutie / Sursa Client)",
    relationColumnId: COMPANII_RELATIONS.contacte,
    sources: {
      [BOARD_ID.CONTACTE]:   "color_mkpmtptv", // Ultima Discutie pe Contacte
      [BOARD_ID.SOLICITARI]: "color_mkpv6sj4", // Sursa Client pe Solicitari
    },
  },
  fbClient: {
    id:               "lookup_mkq8jmxw",
    title:            "FB Client",
    relationColumnId: COMPANII_RELATIONS.contacte,
    sources: {
      [BOARD_ID.CONTACTE]:   "color_mkpmq49f", // FB Client pe Contacte
      [BOARD_ID.SOLICITARI]: "color_mkpv6sj4", // Sursa Client pe Solicitari
    },
  },
  telefon: {
    id:               "lookup_mkq968y3",
    title:            "Telefon",
    relationColumnId: COMPANII_RELATIONS.contacte,
    sources: {
      [BOARD_ID.CONTACTE]:   "contact_phone",
      [BOARD_ID.SOLICITARI]: "phone_mkx8mcn7",
    },
  },
  emailContact: {
    id:               "lookup_mkq964cq",
    title:            "Email Contact",
    relationColumnId: COMPANII_RELATIONS.contacte,
    sources: {
      [BOARD_ID.CONTACTE]:   "contact_email",
      [BOARD_ID.SOLICITARI]: "email_mkvmar5w",
    },
  },
  dataAdaugare: {
    id:               "lookup_mkqapc88",
    title:            "Data Adaugare",
    relationColumnId: COMPANII_RELATIONS.contacte,
    sources: {
      [BOARD_ID.CONTACTE]:   "date_mkq2380r",
      [BOARD_ID.SOLICITARI]: "deal_creation_date",
    },
  },
  owner: {
    id:               "lookup_mkr81xes",
    title:            "Mirror Owner",
    relationColumnId: COMPANII_RELATIONS.contacte,
    sources: {
      [BOARD_ID.CONTACTE]:   "multiple_person_mknr9sz8",
      [BOARD_ID.SOLICITARI]: "deal_owner",
    },
  },
};

// ─── Mirror Columns on CONTACTE (from Companii via board_relation_mkpd8qmf) ───

/**
 * Mirror columns on the Contacte board.
 * All driven by the "Companie" relation (board_relation_mkpd8qmf),
 * which connects to Companii (1853156756) and Solicitari (1905911565).
 */
export const CONTACTE_MIRROR_COLUMNS: Record<string, MirrorColumnDef> = {
  ca: {
    id:               "lookup_mks6z67j",
    title:            "CA (Cifra Afaceri)",
    relationColumnId: CONTACTE_RELATIONS.companie,
    sources: {
      [BOARD_ID.COMPANII]:   "numeric_mknr73g8", // Cifra Afaceri pe Companii
      [BOARD_ID.SOLICITARI]: "numeric_mkr4e4qc", // Buget Client pe Solicitari
    },
  },
  website: {
    id:               "lookup_mks6q6x",
    title:            "Website",
    relationColumnId: CONTACTE_RELATIONS.companie,
    sources: {
      [BOARD_ID.COMPANII]:   "company_domain",
      [BOARD_ID.SOLICITARI]: "link_mkyejaej",
    },
  },
  ownerCompanie: {
    id:               "lookup_mkwskdks",
    title:            "Owner Companie",
    relationColumnId: CONTACTE_RELATIONS.companie,
    sources: {
      [BOARD_ID.COMPANII]:   "multiple_person_mkpm480j",
      [BOARD_ID.SOLICITARI]: "deal_owner",
    },
  },
  caen: {
    id:               "lookup_mkxb9798",
    title:            "CAEN",
    relationColumnId: CONTACTE_RELATIONS.companie,
    sources: {
      [BOARD_ID.COMPANII]:   "text_mkwyekba",
      [BOARD_ID.SOLICITARI]: "text_mkypcczr", // Localitate Incarcare pe Solicitari
    },
  },
  industrie: {
    id:               "lookup_mkxbhnck",
    title:            "Industrie",
    relationColumnId: CONTACTE_RELATIONS.companie,
    sources: {
      [BOARD_ID.COMPANII]:   "dropdown_mkxb5h50",
      [BOARD_ID.SOLICITARI]: "dropdown_mkxb4z21",
    },
  },
  tara: {
    id:               "lookup_mkyxe4qx",
    title:            "Tara",
    relationColumnId: CONTACTE_RELATIONS.companie,
    sources: {
      [BOARD_ID.COMPANII]:   "dropdown_mkxk4ypw",
      [BOARD_ID.SOLICITARI]: "dropdown_mkxb807r", // Channel pe Solicitari
    },
  },
};

// ─── Mirror Columns on COMENZI/CURSE (document generation source) ─────────────

/**
 * Mirror columns on the Comenzi/Curse board used for document generation.
 *
 * CLIENT mirrors are driven by board_relation_mkpw4bcs (→ Companii).
 * SUPPLIER mirrors are driven by board_relation_mkse9rp2 (→ Companii).
 *
 * These column IDs are already used in generationValidation.ts and mapping.ts.
 * Listed here for cross-reference and consistency with the other boards.
 */
export const COMENZI_CLIENT_MIRROR_COLUMNS: Record<string, MirrorColumnDef> = {
  vat: {
    id:               "lookup_mksha4n0",
    title:            "VAT Client",
    relationColumnId: COMENZI_RELATIONS.companieClient,
    sources: { [BOARD_ID.COMPANII]: "text_mknrvv8q" }, // VAT (cu prefix fara spatii)
  },
  adresaSediu: {
    id:               "lookup_mksh4wrs",
    title:            "Adresa Sediu Client",
    relationColumnId: COMENZI_RELATIONS.companieClient,
    sources: { [BOARD_ID.COMPANII]: "headquarters_loc" },
  },
  judet: {
    id:               "lookup_mkxwwsax",
    title:            "Judet Client",
    relationColumnId: COMENZI_RELATIONS.companieClient,
    sources: { [BOARD_ID.COMPANII]: "text_mkxt1j9a" },
  },
  localitate: {
    id:               "lookup_mkxtmxv3",
    title:            "Localitate Client",
    relationColumnId: COMENZI_RELATIONS.companieClient,
    sources: { [BOARD_ID.COMPANII]: "text_mkxw4fy0" },
  },
  tara: {
    id:               "lookup_mkxttcky",
    title:            "Tara Client",
    relationColumnId: COMENZI_RELATIONS.companieClient,
    sources: { [BOARD_ID.COMPANII]: "dropdown_mkxk4ypw" },
  },
  emailCompanie: {
    id:               "lookup_mkyqf8ke",
    title:            "Email Companie Client",
    relationColumnId: COMENZI_RELATIONS.companieClient,
    sources: { [BOARD_ID.COMPANII]: "email_mkq9wa9b" },
  },
};

export const COMENZI_SUPPLIER_MIRROR_COLUMNS: Record<string, MirrorColumnDef> = {
  vat: {
    id:               "lookup_mksh7sx6",
    title:            "VAT Furnizor",
    relationColumnId: COMENZI_RELATIONS.companieFurnizor,
    sources: { [BOARD_ID.COMPANII]: "text_mknrvv8q" },
  },
  adresaSediu: {
    id:               "lookup_mkshzp7g",
    title:            "Adresa Sediu Furnizor",
    relationColumnId: COMENZI_RELATIONS.companieFurnizor,
    sources: { [BOARD_ID.COMPANII]: "headquarters_loc" },
  },
  email: {
    id:               "lookup_mkshweae",
    title:            "Email Furnizor",
    relationColumnId: COMENZI_RELATIONS.companieFurnizor,
    sources: { [BOARD_ID.COMPANII]: "email_mkq9wa9b" },
  },
  taraHQ: {
    id:               "lookup_mm2mndk2",
    title:            "Tara Sediu Furnizor",
    relationColumnId: COMENZI_RELATIONS.companieFurnizor,
    sources: { [BOARD_ID.COMPANII]: "dropdown_mkxk4ypw" },
  },
};

// ─── Recommended Mirror Columns for SOLICITARI ────────────────────────────────

/**
 * Mirror columns that SHOULD exist on the Solicitari board for consistency
 * with the Companii / Contacte pattern.
 *
 * These are driven by board_relation_mkpw4bcs (→ Companii).
 * If not yet added in Monday.com, create them via:
 *   Board → Add Column → Mirror → select relation "Companie" → select source column.
 *
 * Once added, the column IDs assigned by Monday must be updated here.
 */
export const SOLICITARI_RECOMMENDED_MIRRORS: Array<{
  title: string;
  relationColumnId: string;
  sourceBoard: string;
  sourceColumn: string;
  sourceColumnTitle: string;
}> = [
  {
    title:             "VAT Client",
    relationColumnId:  SOLICITARI_RELATIONS.companie,
    sourceBoard:       BOARD_ID.COMPANII,
    sourceColumn:      "text_mknrvv8q",
    sourceColumnTitle: "VAT (cu prefix fara spatii)",
  },
  {
    title:             "Adresa Sediu Client",
    relationColumnId:  SOLICITARI_RELATIONS.companie,
    sourceBoard:       BOARD_ID.COMPANII,
    sourceColumn:      "headquarters_loc",
    sourceColumnTitle: "Adresa Sediu",
  },
  {
    title:             "Localitate Client",
    relationColumnId:  SOLICITARI_RELATIONS.companie,
    sourceBoard:       BOARD_ID.COMPANII,
    sourceColumn:      "text_mkxw4fy0",
    sourceColumnTitle: "Localitate",
  },
  {
    title:             "Judet Client",
    relationColumnId:  SOLICITARI_RELATIONS.companie,
    sourceBoard:       BOARD_ID.COMPANII,
    sourceColumn:      "text_mkxt1j9a",
    sourceColumnTitle: "Judet",
  },
  {
    title:             "Tara Client",
    relationColumnId:  SOLICITARI_RELATIONS.companie,
    sourceBoard:       BOARD_ID.COMPANII,
    sourceColumn:      "dropdown_mkxk4ypw",
    sourceColumnTitle: "Tara",
  },
  {
    title:             "Email Companie Client",
    relationColumnId:  SOLICITARI_RELATIONS.companie,
    sourceBoard:       BOARD_ID.COMPANII,
    sourceColumn:      "email_mkq9wa9b",
    sourceColumnTitle: "Email Companie",
  },
  {
    title:             "Platitor TVA",
    relationColumnId:  SOLICITARI_RELATIONS.companie,
    sourceBoard:       BOARD_ID.COMPANII,
    sourceColumn:      "color_mky4kdz7",
    sourceColumnTitle: "Platitor TVA",
  },
  {
    title:             "Telefon Contact",
    relationColumnId:  SOLICITARI_RELATIONS.contacte,
    sourceBoard:       BOARD_ID.CONTACTE,
    sourceColumn:      "contact_phone",
    sourceColumnTitle: "Telefon",
  },
  {
    title:             "Email Contact",
    relationColumnId:  SOLICITARI_RELATIONS.contacte,
    sourceBoard:       BOARD_ID.CONTACTE,
    sourceColumn:      "contact_email",
    sourceColumnTitle: "Email",
  },
];

// ─── Recommended Mirror Columns for LEADS ─────────────────────────────────────

/**
 * Mirror columns that SHOULD exist on the Leads board for consistency.
 * Driven by board_relation_mkxbyt1s (→ Contacte & Companii).
 *
 * Once added in Monday.com, update column IDs here.
 */
export const LEADS_RECOMMENDED_MIRRORS: Array<{
  title: string;
  relationColumnId: string;
  sourceBoard: string;
  sourceColumn: string;
  sourceColumnTitle: string;
}> = [
  {
    title:             "VAT Companie",
    relationColumnId:  LEADS_RELATIONS.contacteCompanii,
    sourceBoard:       BOARD_ID.COMPANII,
    sourceColumn:      "text_mknrvv8q",
    sourceColumnTitle: "VAT (cu prefix fara spatii)",
  },
  {
    title:             "Adresa Sediu",
    relationColumnId:  LEADS_RELATIONS.contacteCompanii,
    sourceBoard:       BOARD_ID.COMPANII,
    sourceColumn:      "headquarters_loc",
    sourceColumnTitle: "Adresa Sediu",
  },
  {
    title:             "Localitate",
    relationColumnId:  LEADS_RELATIONS.contacteCompanii,
    sourceBoard:       BOARD_ID.COMPANII,
    sourceColumn:      "text_mkxw4fy0",
    sourceColumnTitle: "Localitate",
  },
  {
    title:             "Judet",
    relationColumnId:  LEADS_RELATIONS.contacteCompanii,
    sourceBoard:       BOARD_ID.COMPANII,
    sourceColumn:      "text_mkxt1j9a",
    sourceColumnTitle: "Judet",
  },
  {
    title:             "Tara",
    relationColumnId:  LEADS_RELATIONS.contacteCompanii,
    sourceBoard:       BOARD_ID.COMPANII,
    sourceColumn:      "dropdown_mkxk4ypw",
    sourceColumnTitle: "Tara",
  },
  {
    title:             "Email Companie",
    relationColumnId:  LEADS_RELATIONS.contacteCompanii,
    sourceBoard:       BOARD_ID.COMPANII,
    sourceColumn:      "email_mkq9wa9b",
    sourceColumnTitle: "Email Companie",
  },
  {
    title:             "Telefon Contact",
    relationColumnId:  LEADS_RELATIONS.contacteCompanii,
    sourceBoard:       BOARD_ID.CONTACTE,
    sourceColumn:      "contact_phone",
    sourceColumnTitle: "Telefon",
  },
  {
    title:             "Email Contact",
    relationColumnId:  LEADS_RELATIONS.contacteCompanii,
    sourceBoard:       BOARD_ID.CONTACTE,
    sourceColumn:      "contact_email",
    sourceColumnTitle: "Email",
  },
  {
    title:             "Ultima Discutie",
    relationColumnId:  LEADS_RELATIONS.contacteCompanii,
    sourceBoard:       BOARD_ID.CONTACTE,
    sourceColumn:      "color_mkpmtptv",
    sourceColumnTitle: "Ultima Discutie",
  },
  {
    title:             "Owner Contact",
    relationColumnId:  LEADS_RELATIONS.contacteCompanii,
    sourceBoard:       BOARD_ID.CONTACTE,
    sourceColumn:      "multiple_person_mknr9sz8",
    sourceColumnTitle: "Owner",
  },
];

// ─── Lookup helper ────────────────────────────────────────────────────────────

/** Returns all defined mirror column IDs for a given board key. */
export function getMirrorColumnIds(boardKey: BoardKey): string[] {
  switch (boardKey) {
    case "COMPANII":
      return Object.values(COMPANII_MIRROR_COLUMNS).map((m) => m.id);
    case "CONTACTE":
      return Object.values(CONTACTE_MIRROR_COLUMNS).map((m) => m.id);
    case "COMENZI":
      return [
        ...Object.values(COMENZI_CLIENT_MIRROR_COLUMNS),
        ...Object.values(COMENZI_SUPPLIER_MIRROR_COLUMNS),
      ].map((m) => m.id);
    default:
      return [];
  }
}

/** Returns the MirrorColumnDef for a given column ID across all boards, or undefined. */
export function findMirrorDef(columnId: string): MirrorColumnDef | undefined {
  const allMaps = [
    COMPANII_MIRROR_COLUMNS,
    CONTACTE_MIRROR_COLUMNS,
    COMENZI_CLIENT_MIRROR_COLUMNS,
    COMENZI_SUPPLIER_MIRROR_COLUMNS,
  ];
  for (const map of allMaps) {
    const found = Object.values(map).find((def) => def.id === columnId);
    if (found) {
      return found;
    }
  }
  return undefined;
}
