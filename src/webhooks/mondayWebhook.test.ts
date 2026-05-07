import express from "express";
import http from "node:http";
import { describe, expect, it, vi } from "vitest";
import type { DocumentGenerationFlow } from "../flows/documentGeneration";
import { GenerationValidationError } from "../flows/generationErrors";
import type { SigningFlow } from "../flows/signingFlow";
import { GENERATION_TRIGGER_COLUMNS, SIGN_TRIGGER_COLUMN } from "../utils/mapping";
import { IdempotencyService } from "../utils/idempotency";
import { createMondayWebhookRouter } from "./mondayWebhook";

const GEN_COLUMN_ID = [...GENERATION_TRIGGER_COLUMNS][0];

function makeApp(params: {
  documentFlow: Pick<DocumentGenerationFlow, "process">;
  signingFlow: Pick<SigningFlow, "startSigning">;
  idempotency: IdempotencyService;
}) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/webhooks",
    createMondayWebhookRouter({
      documentFlow: params.documentFlow as DocumentGenerationFlow,
      signingFlow: params.signingFlow as SigningFlow,
      idempotency: params.idempotency,
      webhookSecret: undefined
    })
  );
  return app;
}

async function postMonday(app: express.Express, body: unknown): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", async () => {
      try {
        const addr = server.address();
        if (!addr || typeof addr === "string") {
          throw new Error("no listen address");
        }
        const port = addr.port;
        const res = await fetch(`http://127.0.0.1:${port}/webhooks/monday`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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

async function postMondayToPort(port: number, body: unknown): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`http://127.0.0.1:${port}/webhooks/monday`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = (await res.json()) as unknown;
  return { status: res.status, json };
}

function generationPayload(itemId: number, boardId?: number) {
  return {
    event: {
      ...(boardId !== undefined ? { boardId } : {}),
      pulseId: itemId,
      columnId: GEN_COLUMN_ID,
      value: { label: { text: "Client SRL" } }
    }
  };
}

function signingPayload(itemId: number, value: string, boardId?: number) {
  return {
    event: {
      ...(boardId !== undefined ? { boardId } : {}),
      pulseId: itemId,
      columnId: SIGN_TRIGGER_COLUMN,
      value: { label: { text: value } }
    }
  };
}

describe("createMondayWebhookRouter document generation idempotency", () => {
  it("runs generation again when the same trigger status is sent after a successful run", async () => {
    const idempotency = new IdempotencyService(60_000);
    const process = vi.fn().mockResolvedValue(undefined);
    const app = makeApp({
      documentFlow: { process },
      signingFlow: { startSigning: vi.fn() },
      idempotency
    });

    const body = generationPayload(1001);
    const r1 = await postMonday(app, body);
    const r2 = await postMonday(app, body);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect((r1.json as { workflow?: string }).workflow).toBe("document_generation");
    expect((r2.json as { workflow?: string }).workflow).toBe("document_generation");
    expect(process).toHaveBeenCalledTimes(2);
  });

  it("still ignores duplicate webhook deliveries while the first is in-flight (same dedupe key)", () => {
    const idempotency = new IdempotencyService(60_000);
    const key = idempotency.makeKey("2002", GEN_COLUMN_ID, "Client SRL");
    expect(idempotency.isDuplicate(key)).toBe(false);
    idempotency.remember(key);
    expect(idempotency.isDuplicate(key)).toBe(true);
  });

  it("returns duplicate for a concurrent second delivery while generation is still running", async () => {
    const idempotency = new IdempotencyService(60_000);
    let firstRememberKey: string | null = null;
    let remembered!: () => void;
    const rememberedGate = new Promise<void>((resolve) => {
      remembered = resolve;
    });
    const origRemember = idempotency.remember.bind(idempotency);
    vi.spyOn(idempotency, "remember").mockImplementation((key: string) => {
      if (!firstRememberKey) firstRememberKey = key;
      origRemember(key);
      remembered();
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const process = vi.fn().mockImplementation(() => gate);
    const app = makeApp({
      documentFlow: { process },
      signingFlow: { startSigning: vi.fn() },
      idempotency
    });

    const body = generationPayload(2003, 2030349838);
    const server = http.createServer(app);
    const [a, b] = await new Promise<[Awaited<ReturnType<typeof postMondayToPort>>, Awaited<ReturnType<typeof postMondayToPort>>]>(
      (resolve, reject) => {
        server.listen(0, "127.0.0.1", async () => {
          try {
            const addr = server.address();
            if (!addr || typeof addr === "string") {
              throw new Error("no listen address");
            }
            const port = addr.port;
            const first = postMondayToPort(port, body);
            await rememberedGate; // Ensure first request remembered the key before starting the second
            expect(firstRememberKey).toBe(idempotency.makeKey("2003", GEN_COLUMN_ID, "Client SRL"));
            expect(idempotency.isDuplicate(firstRememberKey!)).toBe(true);
            const second = postMondayToPort(port, body);
            const secondResult = await second;
            release();
            const firstResult = await first;
            const out = [firstResult, secondResult];
            server.close();
            resolve(out as [any, any]);
          } catch (e) {
            server.close();
            reject(e);
          }
        });
      }
    );

    const skippedDup = [a, b].find((r) => (r.json as { skipped?: string }).skipped === "duplicate");
    const okGen = [a, b].find((r) => (r.json as { workflow?: string }).workflow === "document_generation");
    expect(skippedDup).toBeDefined();
    expect(okGen).toBeDefined();
    expect(process).toHaveBeenCalledTimes(1);
  });

  it("allows a new generation attempt after validation failure (same payload)", async () => {
    const idempotency = new IdempotencyService(60_000);
    const process = vi
      .fn()
      .mockRejectedValueOnce(new GenerationValidationError("missing"))
      .mockResolvedValueOnce(undefined);
    const app = makeApp({
      documentFlow: { process },
      signingFlow: { startSigning: vi.fn() },
      idempotency
    });

    const body = generationPayload(1003);
    const r1 = await postMonday(app, body);
    const r2 = await postMonday(app, body);

    expect((r1.json as { outcome?: string }).outcome).toBe("validation_failed");
    expect((r2.json as { workflow?: string }).workflow).toBe("document_generation");
    expect(process).toHaveBeenCalledTimes(2);
  });

  it("releases idempotency key on generation error so the webhook can be retried", async () => {
    const idempotency = new IdempotencyService(60_000);
    const process = vi.fn().mockRejectedValueOnce(new Error("LibreOffice failed")).mockResolvedValueOnce(undefined);
    const app = makeApp({
      documentFlow: { process },
      signingFlow: { startSigning: vi.fn() },
      idempotency
    });

    const body = generationPayload(1004);
    const r1 = await postMonday(app, body);
    const r2 = await postMonday(app, body);

    expect(r1.status).toBe(500);
    expect(r2.status).toBe(200);
    expect(process).toHaveBeenCalledTimes(2);
  });

  it("does not leave idempotency locked when generation value is unsupported", async () => {
    const idempotency = new IdempotencyService(60_000);
    const process = vi.fn();
    const app = makeApp({
      documentFlow: { process },
      signingFlow: { startSigning: vi.fn() },
      idempotency
    });

    const bad = {
      event: {
        pulseId: 1005,
        columnId: GEN_COLUMN_ID,
        value: { label: { text: "NotARealTemplate" } }
      }
    };
    const good = generationPayload(1005);

    const r1 = await postMonday(app, bad);
    const r2 = await postMonday(app, good);

    expect((r1.json as { skipped?: string }).skipped).toBe("unsupported_generation_value");
    expect((r2.json as { workflow?: string }).workflow).toBe("document_generation");
    expect(process).toHaveBeenCalledTimes(1);
  });
});

describe("createMondayWebhookRouter signing idempotency", () => {
  it("releases idempotency key after successful signing start so the same trigger can be retried later", async () => {
    const idempotency = new IdempotencyService(60_000);
    const startSigning = vi.fn().mockResolvedValue(undefined);
    const app = makeApp({
      documentFlow: { process: vi.fn() },
      signingFlow: { startSigning },
      idempotency
    });

    const body = signingPayload(3001, "Trimite Client");
    const r1 = await postMonday(app, body);
    const r2 = await postMonday(app, body);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect((r1.json as { workflow?: string }).workflow).toBe("signing_email");
    expect((r2.json as { workflow?: string }).workflow).toBe("signing_email");
    expect(startSigning).toHaveBeenCalledTimes(2);
  });

  it("still returns duplicate for a concurrent second delivery while signing start is in-flight", async () => {
    const idempotency = new IdempotencyService(60_000);
    let firstRememberKey: string | null = null;
    let remembered!: () => void;
    const rememberedGate = new Promise<void>((resolve) => {
      remembered = resolve;
    });
    const origRemember = idempotency.remember.bind(idempotency);
    vi.spyOn(idempotency, "remember").mockImplementation((key: string) => {
      if (!firstRememberKey) firstRememberKey = key;
      origRemember(key);
      remembered();
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const startSigning = vi.fn().mockImplementation(() => gate);
    const app = makeApp({
      documentFlow: { process: vi.fn() },
      signingFlow: { startSigning },
      idempotency
    });

    const body = signingPayload(3002, "Trimite Transportator", 2030349838);
    const server = http.createServer(app);
    const [a, b] = await new Promise<[Awaited<ReturnType<typeof postMondayToPort>>, Awaited<ReturnType<typeof postMondayToPort>>]>(
      (resolve, reject) => {
        server.listen(0, "127.0.0.1", async () => {
          try {
            const addr = server.address();
            if (!addr || typeof addr === "string") {
              throw new Error("no listen address");
            }
            const port = addr.port;
            const first = postMondayToPort(port, body);
            await rememberedGate; // Ensure first request remembered the key before starting the second
            expect(firstRememberKey).toBe(idempotency.makeKey("3002", SIGN_TRIGGER_COLUMN, "Trimite Transportator"));
            expect(idempotency.isDuplicate(firstRememberKey!)).toBe(true);
            const second = postMondayToPort(port, body);
            const secondResult = await second;
            release();
            const firstResult = await first;
            const out = [firstResult, secondResult];
            server.close();
            resolve(out as [any, any]);
          } catch (e) {
            server.close();
            reject(e);
          }
        });
      }
    );

    const skippedDup = [a, b].find((r) => (r.json as { skipped?: string }).skipped === "duplicate");
    const okSign = [a, b].find((r) => (r.json as { workflow?: string }).workflow === "signing_email");
    expect(skippedDup).toBeDefined();
    expect(okSign).toBeDefined();
    expect(startSigning).toHaveBeenCalledTimes(1);
  });
});
