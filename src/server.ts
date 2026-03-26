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
import { GmailService } from "./email/gmailService";
import { SigningFlow } from "./flows/signingFlow";
import { createMondayWebhookRouter } from "./webhooks/mondayWebhook";
import { IdempotencyService } from "./utils/idempotency";
import { createSigningRouter } from "./signing/signingController";
import { AuditService } from "./signing/auditService";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "2mb" }));
app.use(pinoHttp({ logger }));

const mondayClient = new MondayClient(env.MONDAY_API_TOKEN, env.MONDAY_API_URL);
const gcsService = new GcsService(env.GCS_BUCKET);
const templateService = new TemplateService();
const pdfService = new PdfService();

const documentFlow = new DocumentGenerationFlow(
  mondayClient,
  gcsService,
  templateService,
  pdfService,
  env.TEMPLATE_PREFIX
);

const signingService = new SigningService(env.SIGN_TOKEN_TTL_MINUTES * 60_000);
const auditService = new AuditService();
const gmailService = new GmailService({
  clientId: env.GMAIL_CLIENT_ID,
  clientSecret: env.GMAIL_CLIENT_SECRET,
  redirectUri: env.GMAIL_REDIRECT_URI,
  refreshToken: env.GMAIL_REFRESH_TOKEN,
  sender: env.GMAIL_SENDER
});

const signingFlow = new SigningFlow(mondayClient, signingService, gmailService, env.APP_BASE_URL);
const idempotency = new IdempotencyService(env.IDEMPOTENCY_TTL_MINUTES * 60_000);

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "monday-doc-automation" });
});

app.use("/webhooks", createMondayWebhookRouter({
  documentFlow,
  signingFlow,
  idempotency,
  webhookSecret: env.WEBHOOK_SECRET
}));

app.use("/sign", createSigningRouter({
  signingService,
  auditService,
  pdfService,
  signingFlow
}));

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "Server started");
});
