import { Router, type Request, type Response } from "express";
import type { DocumentGenerationFlow } from "../flows/documentGeneration";
import type { SigningFlow } from "../flows/signingFlow";
import { IdempotencyService } from "../utils/idempotency";
import {
  GENERATION_ALLOWED_VALUES,
  GENERATION_TRIGGER_COLUMNS,
  SIGN_ALLOWED_VALUES,
  SIGN_TRIGGER_COLUMN
} from "../utils/mapping";

interface MondayWebhookPayload {
  challenge?: string;
  event?: {
    pulseId?: number;
    columnId?: string;
    value?: { label?: { text?: string } };
  };
}

export function createMondayWebhookRouter(params: {
  documentFlow: DocumentGenerationFlow;
  signingFlow: SigningFlow;
  idempotency: IdempotencyService;
  webhookSecret?: string;
}): Router {
  const router = Router();

  router.post("/monday", async (req: Request, res: Response) => {
    const payload = req.body as MondayWebhookPayload;

    if (payload.challenge) {
      return res.json({ challenge: payload.challenge });
    }

    if (params.webhookSecret) {
      const received = req.get("x-webhook-secret");
      if (received !== params.webhookSecret) {
        return res.status(401).json({ error: "Unauthorized webhook request" });
      }
    }

    const event = payload.event;
    if (!event?.pulseId || !event.columnId) {
      return res.status(400).json({ error: "Invalid webhook payload" });
    }

    const itemId = String(event.pulseId);
    const newStatus = event.value?.label?.text || "";
    const dedupeKey = params.idempotency.makeKey(itemId, event.columnId, newStatus);

    if (params.idempotency.isDuplicateAndRemember(dedupeKey)) {
      return res.status(200).json({ ok: true, skipped: "duplicate" });
    }

    try {
      if (GENERATION_TRIGGER_COLUMNS.has(event.columnId)) {
        if (!GENERATION_ALLOWED_VALUES.has(newStatus)) {
          return res.status(200).json({ ok: true, skipped: "unsupported_generation_value" });
        }

        await params.documentFlow.process(itemId, newStatus);
        return res.status(200).json({ ok: true, workflow: "document_generation" });
      }

      if (event.columnId === SIGN_TRIGGER_COLUMN) {
        if (!SIGN_ALLOWED_VALUES.has(newStatus)) {
          return res.status(200).json({ ok: true, skipped: "unsupported_sign_value" });
        }

        await params.signingFlow.startSigning(itemId, newStatus);
        return res.status(200).json({ ok: true, workflow: "signing_email" });
      }

      return res.status(200).json({ ok: true, skipped: "irrelevant_column" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook processing failed";
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
