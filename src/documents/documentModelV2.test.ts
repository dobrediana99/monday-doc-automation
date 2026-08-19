import { describe, expect, it } from "vitest";
import { parseDocumentModelV2, type DocumentModelV2 } from "./documentModelV2";
import { buildDocxModel } from "./documentModelV2Render";
import { resolveTemplateFileV2 } from "./templateRegistryV2";

/** Minimul valid: părțile, ruta și comanda. Restul e opțional prin construcție. */
function minimalPayload(): unknown {
  return {
    version: 2,
    meta: {
      boardId: "board-1",
      itemId: "item-1",
      templateCode: "cmd_client_ro",
      uploadColumnCrmKey: "comanda_client_v2"
    },
    parties: { issuer: { name: "Crystal Logistics SRL" } },
    order: { number: "CLS01609" },
    route: {
      stops: [
        { type: "pickup", country: "RO", city: "Timișoara", address: "Str. Gării 1" },
        { type: "delivery", country: "DE", city: "München", address: "Hauptstr. 4" }
      ]
    }
  };
}

describe("parseDocumentModelV2", () => {
  it("acceptă payload-ul minim, fără niciun câmp opțional", () => {
    const res = parseDocumentModelV2(minimalPayload());
    expect(res.ok).toBe(true);
  });

  it("respinge o cursă cu o singură oprire", () => {
    const payload = minimalPayload() as { route: { stops: unknown[] } };
    payload.route.stops = [payload.route.stops[0]];
    const res = parseDocumentModelV2(payload);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(" ")).toContain("route.stops");
  });

  it("întoarce erorile cu calea câmpului, ca CRM-ul să le poată arăta omului", () => {
    const payload = minimalPayload() as { meta: Record<string, unknown> };
    delete payload.meta.uploadColumnCrmKey;
    const res = parseDocumentModelV2(payload);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.some((e) => e.startsWith("meta.uploadColumnCrmKey"))).toBe(true);
  });

  it("refuză o versiune pe care n-o cunoaște", () => {
    // Un CRM mai nou nu trebuie randat tăcut greșit de un serviciu mai vechi.
    const res = parseDocumentModelV2({ ...(minimalPayload() as object), version: 3 });
    expect(res.ok).toBe(false);
  });

  it("acceptă opririle multiple, accesorialele și asigurarea", () => {
    const payload = minimalPayload() as Record<string, unknown>;
    (payload.route as { stops: unknown[] }).stops.push({
      type: "delivery",
      country: "FR",
      city: "Lyon",
      address: "Rue A 2"
    });
    payload.accessorials = [{ category: "pickup", label: "Lift", amount: 50, currency: "EUR" }];
    payload.insurance = { cargoValue: 120000, currency: "EUR" };
    const res = parseDocumentModelV2(payload);
    expect(res.ok).toBe(true);
  });
});

describe("buildDocxModel", () => {
  const model = () => {
    const res = parseDocumentModelV2(minimalPayload());
    if (!res.ok) throw new Error(res.errors.join("; "));
    return res.model;
  };

  it("nu scrie „undefined” pentru câmpurile opționale lipsă", () => {
    const docx = buildDocxModel(model());
    for (const [key, value] of Object.entries(docx)) {
      expect(String(value), `câmpul ${key}`).not.toContain("undefined");
    }
  });

  it("deduce comutatoarele din date", () => {
    const docx = buildDocxModel(model());
    expect(docx.has_insurance).toBe(false);
    expect(docx.has_accessorials).toBe(false);
    expect(docx.has_extra_stops).toBe(false);
  });

  it("regulile din CRM înving comutatoarele deduse", () => {
    // Un client poate cere ca accesorialele să NU apară detaliat pe comandă,
    // chiar dacă există. Serviciul n-are cum să știe asta — de aia flags câștigă.
    const m: DocumentModelV2 = {
      ...model(),
      accessorials: [{ category: "pickup", label: "Lift" }],
      flags: { has_accessorials: false }
    };
    const docx = buildDocxModel(m);
    expect(docx.has_accessorials).toBe(false);
    expect((docx.accessorials as unknown[]).length).toBe(1);
  });

  it("expune opririle și ca listă, și ca prima/ultima pentru șabloanele simple", () => {
    const docx = buildDocxModel(model());
    expect((docx.stops as unknown[]).length).toBe(2);
    expect(docx.pickup_city).toBe("Timișoara");
    expect(docx.delivery_city).toBe("München");
  });

  it("ia ULTIMA descărcare, nu prima, când sunt mai multe", () => {
    const m = model();
    m.route.stops.push({ type: "delivery", country: "FR", city: "Lyon", address: "Rue A 2" });
    const docx = buildDocxModel(m);
    expect(docx.delivery_city).toBe("Lyon");
    expect(docx.has_extra_stops).toBe(true);
  });

  it("formatează sumele cu monedă, și lasă gol când lipsesc", () => {
    const m = model();
    m.order.clientPrice = { amount: 1250.5, currency: "EUR" };
    const docx = buildDocxModel(m);
    expect(String(docx.client_price)).toContain("EUR");
    expect(docx.supplier_price).toBe("");
  });
});

describe("resolveTemplateFileV2", () => {
  it("găsește un cod cunoscut", () => {
    const res = resolveTemplateFileV2("cmd_client_ro");
    expect(res.ok).toBe(true);
  });

  it("spune ce coduri există când primește unul necunoscut", () => {
    const res = resolveTemplateFileV2("nu_exista");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("cmd_client_ro");
  });
});
