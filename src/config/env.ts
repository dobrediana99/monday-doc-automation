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

  WEBHOOK_SECRET: z.string().optional(),

  /** Optional crm-lyc adapter configuration. If any value is set, all values are required. */
  CRM_LYC_WEBHOOK_SECRET: z.string().min(1).optional(),
  DOC_AUTOMATION_API_KEY: z.string().min(1).optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  CRM_LYC_BASE_URL: z.string().url().optional()
});

const EnvSchema = BaseEnvSchema.superRefine((data, ctx) => {
  if (data.NODE_ENV === "production" && !data.SIGNING_REDIS_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SIGNING_REDIS_URL"],
      message: "Required in production for persistent signing links"
    });
  }

  const crmLycKeys = [
    "CRM_LYC_WEBHOOK_SECRET",
    "DOC_AUTOMATION_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "CRM_LYC_BASE_URL"
  ] as const;
  const hasAnyCrmLycValue = crmLycKeys.some((key) => Boolean(data[key]));
  if (hasAnyCrmLycValue) {
    for (const key of crmLycKeys) {
      if (!data[key]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: "Required when crm-lyc adapter is configured"
        });
      }
    }
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
