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

describe("CrmLycClient.resolveClientRecipientEmail", () => {
  it("prefers Email Semnare Client when present", async () => {
    const client = makeClient();
    const resolved = await client.resolveClientRecipientEmail({
      itemId: "item-1",
      boardId: "board-1",
      textValues: {
        client_sign_email: "semnare@client.ro",
        client_accounting_email: "conta@client.ro",
        mirror_client_email: "general@client.ro"
      }
    });
    expect(resolved).toEqual({
      email: "semnare@client.ro",
      source: "client_sign_email",
      emailSource: "primary"
    });
  });

  it("falls back to Email Contabilitate client when signing email is empty", async () => {
    const client = makeClient();
    const resolved = await client.resolveClientRecipientEmail({
      itemId: "item-1",
      boardId: "board-1",
      textValues: {
        client_sign_email: "",
        client_accounting_email: "conta@client.ro",
        mirror_client_email: "general@client.ro"
      }
    });
    expect(resolved).toEqual({
      email: "conta@client.ro",
      source: "client_accounting_email",
      emailSource: "primary"
    });
  });

  it("falls back to mirror_client_email when signing and accounting emails are empty", async () => {
    const client = makeClient();
    const resolved = await client.resolveClientRecipientEmail({
      itemId: "item-1",
      boardId: "board-1",
      textValues: {
        client_sign_email: "",
        client_accounting_email: "",
        mirror_client_email: "general@client.ro"
      }
    });
    expect(resolved).toEqual({
      email: "general@client.ro",
      source: "mirror_client_email",
      emailSource: "fallback"
    });
  });

  it("falls back to linked client company email when columns are empty", async () => {
    const client = makeClient();
    vi.spyOn(client, "getRawValueByCrmKey").mockResolvedValue({ company_ids: ["company-1"] });
    vi.spyOn(client as unknown as { fetchCompany: (id: string | null) => Promise<unknown> }, "fetchCompany").mockResolvedValue({
      email: "company@client.ro"
    });

    const resolved = await client.resolveClientRecipientEmail({
      itemId: "item-1",
      boardId: "board-1",
      textValues: {
        client_sign_email: "",
        client_accounting_email: "",
        mirror_client_email: ""
      }
    });
    expect(resolved).toEqual({
      email: "company@client.ro",
      source: "mirror_client_email",
      emailSource: "fallback"
    });
  });

  it("returns null when no valid email is available", async () => {
    const client = makeClient();
    vi.spyOn(client, "getRawValueByCrmKey").mockResolvedValue(null);

    const resolved = await client.resolveClientRecipientEmail({
      itemId: "item-1",
      boardId: "board-1",
      textValues: {
        client_sign_email: "not-an-email",
        client_accounting_email: "",
        mirror_client_email: ""
      }
    });
    expect(resolved).toBeNull();
  });
});
