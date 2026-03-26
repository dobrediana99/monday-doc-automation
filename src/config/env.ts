import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8080),
  APP_BASE_URL: z.string().url(),

  MONDAY_API_TOKEN: z.string().min(1),
  MONDAY_API_URL: z.string().url().default("https://api.monday.com/v2"),

  GCS_BUCKET: z.string().min(1),
  TEMPLATE_PREFIX: z.string().default("templates"),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),

  GMAIL_CLIENT_ID: z.string().min(1),
  GMAIL_CLIENT_SECRET: z.string().min(1),
  GMAIL_REDIRECT_URI: z.string().url(),
  GMAIL_REFRESH_TOKEN: z.string().min(1),
  GMAIL_SENDER: z.string().email(),

  SIGN_TOKEN_TTL_MINUTES: z.coerce.number().default(60 * 24),
  IDEMPOTENCY_TTL_MINUTES: z.coerce.number().default(60),

  WEBHOOK_SECRET: z.string().optional()
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const errors = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration: ${errors}`);
}

export const env = parsed.data;
