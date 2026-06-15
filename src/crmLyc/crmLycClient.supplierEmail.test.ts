import { describe, expect, it, vi } from "vitest";
import { CrmLycClient } from "./crmLycClient";

function makeClient(): CrmLycClient {
  return new CrmLycClient({
    supabaseUrl: "https://example.supabase.co",
    supabaseServiceRoleKey: "test-key",
    crmLycBaseUrl: "https://crm.example.com",
    docAutomationApiKey: "doc-key"
  });
}

describe("CrmLycClient.resolveSupplierRecipientEmail", () => {
  it("prefers Email Semnare Furnizor when present", async () => {
    const client = makeClient();
    const resolved = await client.resolveSupplierRecipientEmail({
      itemId: "item-1",
      boardId: "board-1",
      textValues: {
        supplier_sign_email: "semnare@furnizor.ro",
        mirror_supplier_email: "general@furnizor.ro"
      }
    });
    expect(resolved).toEqual({ email: "semnare@furnizor.ro", source: "supplier_sign_email" });
  });

  it("falls back to mirror_supplier_email when signing email is empty", async () => {
    const client = makeClient();
    const resolved = await client.resolveSupplierRecipientEmail({
      itemId: "item-1",
      boardId: "board-1",
      textValues: {
        supplier_sign_email: "",
        mirror_supplier_email: "general@furnizor.ro"
      }
    });
    expect(resolved).toEqual({ email: "general@furnizor.ro", source: "mirror_supplier_email" });
  });

  it("falls back to linked supplier company email when columns are empty", async () => {
    const client = makeClient();
    vi.spyOn(client, "getRawValueByCrmKey").mockResolvedValue({ company_ids: ["company-1"] });
    vi.spyOn(client as unknown as { fetchCompany: (id: string | null) => Promise<unknown> }, "fetchCompany").mockResolvedValue({
      email: "company@furnizor.ro"
    });

    const resolved = await client.resolveSupplierRecipientEmail({
      itemId: "item-1",
      boardId: "board-1",
      textValues: {
        supplier_sign_email: "",
        mirror_supplier_email: ""
      }
    });
    expect(resolved).toEqual({ email: "company@furnizor.ro", source: "mirror_supplier_email" });
  });

  it("returns null when no valid email is available", async () => {
    const client = makeClient();
    vi.spyOn(client, "getRawValueByCrmKey").mockResolvedValue(null);

    const resolved = await client.resolveSupplierRecipientEmail({
      itemId: "item-1",
      boardId: "board-1",
      textValues: {
        supplier_sign_email: "not-an-email",
        mirror_supplier_email: ""
      }
    });
    expect(resolved).toBeNull();
  });
});
