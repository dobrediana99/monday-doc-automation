import express from "express";
import pino from "pino";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { MondayClient } from "./monday/mondayClient";
import { GcsService } from "./storage/gcsService";
import { TemplateService } from "./documents/templateService";
import { PdfService } from "./documents/pdfService";
import { DocumentGenerationFlow } from "./flows/documentGeneration";
import { SigningService } from "./signing/signingService";
import { InMemorySigningSessionStore } from "./signing/signingSessionStore";
import { RedisSigningSessionStore } from "./signing/redisSigningSessionStore";
import { GmailService } from "./email/gmailService";
import { SigningFlow } from "./flows/signingFlow";
import { createMondayWebhookRouter } from "./webhooks/mondayWebhook";
import { IdempotencyService } from "./utils/idempotency";
import { createSigningRouter } from "./signing/signingController";
import { AuditService } from "./signing/auditService";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

function safeRedisDiagnostics(url: string): { protocol?: string; host?: string } {
  try {
    const u = new URL(url);
    return { protocol: u.protocol.replace(":", ""), host: u.host };
  } catch {
    return {};
  }
}

async function bootstrap(): Promise<void> {
  logger.info(
    {
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      signingTtlMinutes: env.SIGN_TOKEN_TTL_MINUTES,
      signingRedisEnabled: Boolean(env.SIGNING_REDIS_URL),
      ...(env.SIGNING_REDIS_URL ? { signingRedis: safeRedisDiagnostics(env.SIGNING_REDIS_URL) } : {})
    },
    "Startup config summary"
  );

  const app = express();
  app.set("trust proxy", true);
  app.use(express.json({ limit: "2mb" }));
  app.use(pinoHttp({ logger }));

  const mondayClient = new MondayClient(env.MONDAY_API_TOKEN, env.MONDAY_API_URL);
  const gcsService = new GcsService(env.GCS_BUCKET);
  const templateService = new TemplateService();
  const pdfService = new PdfService();

  const documentFlow = new DocumentGenerationFlow(mondayClient, gcsService, templateService, pdfService);

  const signingStore = env.SIGNING_REDIS_URL
    ? new RedisSigningSessionStore({
        redisUrl: env.SIGNING_REDIS_URL,
        prefix: env.SIGNING_REDIS_PREFIX,
        connectTimeoutMs: env.SIGNING_REDIS_CONNECT_TIMEOUT_MS
      })
    : new InMemorySigningSessionStore();

  if (env.SIGNING_REDIS_URL) {
    try {
      await (signingStore as RedisSigningSessionStore).connect();
      logger.info("Redis signing session store connected");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ message: msg.slice(0, 300) }, "Failed to connect to Redis for signing sessions");
      throw err;
    }
  } else {
    logger.warn(
      { note: "SIGNING_REDIS_URL not set" },
      "Signing sessions are in-memory only (links will break on restart / multi-instance)."
    );
  }

  const signingService = new SigningService(env.SIGN_TOKEN_TTL_MINUTES * 60_000, signingStore);
  const auditService = new AuditService();
  const gmailService = new GmailService({
    clientId: env.GMAIL_CLIENT_ID,
    clientSecret: env.GMAIL_CLIENT_SECRET,
    redirectUri: env.GMAIL_REDIRECT_URI ?? "https://developers.google.com/oauthplayground",
    refreshToken: env.GMAIL_REFRESH_TOKEN,
    sender: env.GMAIL_SENDER
  });

  const signingFlow = new SigningFlow(mondayClient, signingService, gmailService, env.APP_BASE_URL);
  const idempotency = new IdempotencyService(env.IDEMPOTENCY_TTL_MINUTES * 60_000);

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, service: "monday-doc-automation" });
  });

  app.use(
    "/webhooks",
    createMondayWebhookRouter({
      documentFlow,
      signingFlow,
      idempotency,
      webhookSecret: env.WEBHOOK_SECRET
    })
  );

  app.use(
    "/sign",
    createSigningRouter({
      signingService,
      auditService,
      pdfService,
      signingFlow
    })
  );

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, "Unhandled error");
    res.status(500).json({ error: "Internal server error" });
  });

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "Server started");
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down");
    server.close(() => undefined);
    if (env.SIGNING_REDIS_URL) {
      try {
        await (signingStore as RedisSigningSessionStore).close();
      } catch {}
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  logger.error({ message: msg.slice(0, 300) }, "Startup failed");
  process.exit(1);
});
