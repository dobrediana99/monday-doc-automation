import express from "express";
import http from "node:http";
import { describe, expect, it, vi } from "vitest";
import type { CrmLycClient } from "../crmLyc/crmLycClient";
import type { CrmLycDocumentGenerationFlow } from "../flows/crmLycDocumentGeneration";
import type { CrmLycSigningFlow } from "../flows/crmLycSigningFlow";
import { IdempotencyService } from "../utils/idempotency";
import { createCrmLycWebhookRouter } from "./crmLycWebhook";

function makePayload() {
  return {
    automation: {
      boardId: "89f5664d-43d0-4cff-964f-46d5279b7f68",
      itemId: "7f8c389e-4e4a-4f7a-bf7f-bbbd6824b9ed"
    },
    vars: {},
    event: {
      operation: "UPDATE",
      table: "item_values",
      boardId: "89f5664d-43d0-4cff-964f-46d5279b7f68",
      itemId: "7f8c389e-4e4a-4f7a-bf7f-bbbd6824b9ed",
      columnId: "transport-status-column",
      record: {
        item_id: "7f8c389e-4e4a-4f7a-bf7f-bbbd6824b9ed",
        column_id: "transport-status-column",
        value: { id: "0" },
        board_id: "89f5664d-43d0-4cff-964f-46d5279b7f68"
      },
      oldRecord: {
        value: { id: "5" }
      }
    }
  };
}

function makeApp(params: {
  crmLycClient: Pick<CrmLycClient, "isStatusValueForCrmKey">;
  documentFlow: Pick<CrmLycDocumentGenerationFlow, "process">;
  signingFlow?: Pick<CrmLycSigningFlow, "startSigning">;
  webhookSecret?: string;
}) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/webhooks",
    createCrmLycWebhookRouter({
      crmLycClient: params.crmLycClient as CrmLycClient,
      documentFlow: params.documentFlow as CrmLycDocumentGenerationFlow,
      signingFlow: (params.signingFlow ?? { startSigning: vi.fn() }) as CrmLycSigningFlow,
      idempotency: new IdempotencyService(60_000),
      webhookSecret: params.webhookSecret ?? "secret"
    })
  );
  return app;
}

async function postCrmLyc(
  app: express.Express,
  body: unknown,
  token = "secret"
): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", async () => {
      try {
        const addr = server.address();
        if (!addr || typeof addr === "string") {
          throw new Error("no listen address");
        }
        const res = await fetch(`http://127.0.0.1:${addr.port}/webhooks/crm-lyc`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(body)
        });
        const json = (await res.json()) as unknown;
        server.close();
        resolve({ status: res.status, json });
      } catch (e) {
        server.close();
        reject(e);
      }
    });
  });
}

describe("createCrmLycWebhookRouter", () => {
  it("rejects requests with an invalid bearer token", async () => {
    const app = makeApp({
      crmLycClient: { isStatusValueForCrmKey: vi.fn().mockResolvedValue(true) },
      documentFlow: { process: vi.fn().mockResolvedValue(undefined) }
    });

    const result = await postCrmLyc(app, makePayload(), "wrong");

    expect(result.status).toBe(401);
  });

  it("skips payloads that are not the signed transport status trigger", async () => {
    const process = vi.fn().mockResolvedValue(undefined);
    const app = makeApp({
      crmLycClient: { isStatusValueForCrmKey: vi.fn().mockResolvedValue(false) },
      documentFlow: { process }
    });

    const result = await postCrmLyc(app, makePayload());

    expect(result.status).toBe(200);
    expect((result.json as { skipped?: string }).skipped).toBe("irrelevant_crm_lyc_trigger");
    expect(process).not.toHaveBeenCalled();
  });

  it("runs crm-lyc document generation for signed transport status", async () => {
    const process = vi.fn().mockResolvedValue(undefined);
    const app = makeApp({
      crmLycClient: { isStatusValueForCrmKey: vi.fn().mockResolvedValue(true) },
      documentFlow: { process }
    });

    const result = await postCrmLyc(app, makePayload());

    expect(result.status).toBe(200);
    expect((result.json as { workflow?: string }).workflow).toBe("crm_lyc_document_generation");
    expect(process).toHaveBeenCalledWith({
      boardId: "89f5664d-43d0-4cff-964f-46d5279b7f68",
      itemId: "7f8c389e-4e4a-4f7a-bf7f-bbbd6824b9ed",
      template: undefined
    });
  });

  it("passes vars.template to document generation (legal form comes from board column)", async () => {
    const process = vi.fn().mockResolvedValue(undefined);
    const app = makeApp({
      crmLycClient: { isStatusValueForCrmKey: vi.fn().mockResolvedValue(true) },
      documentFlow: { process }
    });

    const payload = {
      ...makePayload(),
      vars: { template: "client", legalForm: "GmbH" }
    };
    const result = await postCrmLyc(app, payload);

    expect(result.status).toBe(200);
    expect(process).toHaveBeenCalledWith({
      boardId: "89f5664d-43d0-4cff-964f-46d5279b7f68",
      itemId: "7f8c389e-4e4a-4f7a-bf7f-bbbd6824b9ed",
      template: "client"
    });
  });

  it("passes template to signing flow for send_for_signing (legal form from board column)", async () => {
    const startSigning = vi.fn().mockResolvedValue(undefined);
    const app = makeApp({
      crmLycClient: { isStatusValueForCrmKey: vi.fn() },
      documentFlow: { process: vi.fn() },
      signingFlow: { startSigning }
    });

    const payload = {
      automation: {
        boardId: "89f5664d-43d0-4cff-964f-46d5279b7f68",
        itemId: "7f8c389e-4e4a-4f7a-bf7f-bbbd6824b9ed"
      },
      vars: {
        action: "send_for_signing",
        template: "furnizor",
        legalForm: "GmbH"
      }
    };

    const result = await postCrmLyc(app, payload);

    expect(result.status).toBe(200);
    expect((result.json as { workflow?: string }).workflow).toBe("crm_lyc_signing");
    expect(startSigning).toHaveBeenCalledWith({
      boardId: "89f5664d-43d0-4cff-964f-46d5279b7f68",
      itemId: "7f8c389e-4e4a-4f7a-bf7f-bbbd6824b9ed",
      template: "furnizor",
      recipientEmail: undefined
    });
  });
});
