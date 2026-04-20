import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

// Ensure tests that import env multiple times don't leak previous process.env values.
// (Vitest runs in a single process.)
const BaseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(8080),
  APP_BASE_URL: z.string().url(),

  MONDAY_API_TOKEN: z.string().min(1),
  MONDAY_API_URL: z.string().url().default("https://api.monday.com/v2"),

  GCS_BUCKET: z.string().min(1),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),

  GMAIL_CLIENT_ID: z.string().min(1),
  GMAIL_CLIENT_SECRET: z.string().min(1),
  GMAIL_REDIRECT_URI: z.string().url().optional(),
  GMAIL_REFRESH_TOKEN: z.string().min(1),
  GMAIL_SENDER: z.string().email(),

  SIGN_TOKEN_TTL_MINUTES: z.coerce.number().default(60 * 48),
  IDEMPOTENCY_TTL_MINUTES: z.coerce.number().default(60),

  /** Optional: Redis URL for persistent signing sessions across restarts / multi-instance. */
  SIGNING_REDIS_URL: z.string().min(1).optional(),
  /** Optional: Key prefix namespace for signing session data in Redis. */
  SIGNING_REDIS_PREFIX: z.string().min(1).default("signing"),
  /** Optional: Redis connect timeout (ms). Helps fail-fast on Cloud Run startup. */
  SIGNING_REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

  WEBHOOK_SECRET: z.string().optional()
});

const EnvSchema = BaseEnvSchema.superRefine((data, ctx) => {
  if (data.NODE_ENV === "production" && !data.SIGNING_REDIS_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SIGNING_REDIS_URL"],
      message: "Required in production for persistent signing links"
    });
  }
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const errors = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration: ${errors}`);
}

export const env = parsed.data;
