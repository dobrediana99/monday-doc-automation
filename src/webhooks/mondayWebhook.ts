import { Router, type Request, type Response } from "express";
import type { DocumentGenerationFlow } from "../flows/documentGeneration";
import { GenerationValidationError } from "../flows/generationErrors";
import type { SigningFlow } from "../flows/signingFlow";
import { IdempotencyService } from "../utils/idempotency";
import {
  GENERATION_ALLOWED_VALUES,
  GENERATION_TRIGGER_COLUMNS,
  SIGN_TRIGGER_ALLOWED_VALUES,
  SIGN_TRIGGER_COLUMN
} from "../utils/mapping";

interface MondayWebhookPayload {
  challenge?: string;
  event?: {
    pulseId?: number;
    boardId?: number | string;
    columnId?: string;
    value?: unknown;
  };
}

function webhookBoardId(event: NonNullable<MondayWebhookPayload["event"]>): string | undefined {
  const raw = event.boardId;
  if (raw === undefined || raw === null) {
    return undefined;
  }
  return String(raw);
}

function extractStatusLabel(value: unknown): string | null {
  const normalize = (v: unknown): string | null => {
    if (typeof v !== "string") {
      return null;
    }
    const s = v.trim();
    return s.length > 0 ? s : null;
  };

  if (!value) {
    return null;
  }

  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    const from1 = normalize(((v.label as Record<string, unknown> | undefined)?.text as unknown) ?? null);
    if (from1) return from1;
    const from2 = normalize(v.text);
    if (from2) return from2;
  }

  const asString = normalize(value);
  if (asString) {
    try {
      const parsed = JSON.parse(asString) as unknown;
      if (parsed && typeof parsed === "object") {
        const p = parsed as Record<string, unknown>;
        const from3a = normalize(((p.label as Record<string, unknown> | undefined)?.text as unknown) ?? null);
        if (from3a) return from3a;
        const from3b = normalize(p.text);
        if (from3b) return from3b;
        const from3c = normalize(p.label);
        if (from3c) return from3c;
      }
    } catch {
      // Not JSON, treat as plain string label.
    }
    return asString;
  }

  return null;
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
    const boardId = webhookBoardId(event);
    const newStatus = extractStatusLabel(event.value);
    if (!newStatus) {
      console.warn(
        JSON.stringify({
          event: "webhook_missing_status_value",
          itemId,
          ...(boardId !== undefined ? { boardId } : {}),
          columnId: event.columnId,
          valueType: typeof event.value
        })
      );
      return res.status(200).json({ ok: true, skipped: "missing_status_value" });
    }
    const dedupeKey = params.idempotency.makeKey(itemId, event.columnId, newStatus);

    if (params.idempotency.isDuplicate(dedupeKey)) {
      if (GENERATION_TRIGGER_COLUMNS.has(event.columnId)) {
        console.info(
          JSON.stringify({
            event: "generation_duplicate_webhook_skipped",
            itemId,
            ...(boardId !== undefined ? { boardId } : {}),
            triggerColumnId: event.columnId,
            selectedValue: newStatus
          })
        );
      }
      if (event.columnId === SIGN_TRIGGER_COLUMN) {
        console.info(
          JSON.stringify({
            event: "signing_start_duplicate_webhook_skipped",
            itemId,
            ...(boardId !== undefined ? { boardId } : {}),
            columnId: event.columnId,
            newStatus
          })
        );
      }
      return res.status(200).json({ ok: true, skipped: "duplicate" });
    }
    params.idempotency.remember(dedupeKey);

    try {
      if (GENERATION_TRIGGER_COLUMNS.has(event.columnId)) {
        if (!GENERATION_ALLOWED_VALUES.has(newStatus)) {
          params.idempotency.forget(dedupeKey);
          return res.status(200).json({ ok: true, skipped: "unsupported_generation_value" });
        }

        console.info(
          JSON.stringify({
            event: "generation_restart_after_manual_trigger",
            itemId,
            ...(boardId !== undefined ? { boardId } : {}),
            triggerColumnId: event.columnId,
            selectedValue: newStatus
          })
        );

        try {
          await params.documentFlow.process(itemId, newStatus, event.columnId);
        } catch (error) {
          if (error instanceof GenerationValidationError) {
            params.idempotency.forget(dedupeKey);
            return res.status(200).json({
              ok: true,
              workflow: "document_generation",
              outcome: "validation_failed"
            });
          }
          throw error;
        }
        params.idempotency.forget(dedupeKey);
        console.info(
          JSON.stringify({
            event: "generation_regeneration_allowed",
            itemId,
            ...(boardId !== undefined ? { boardId } : {}),
            triggerColumnId: event.columnId,
            selectedValue: newStatus,
            note: "idempotency_key_released_after_success"
          })
        );
        return res.status(200).json({ ok: true, workflow: "document_generation" });
      }

      if (event.columnId === SIGN_TRIGGER_COLUMN) {
        if (!SIGN_TRIGGER_ALLOWED_VALUES.has(newStatus)) {
          params.idempotency.forget(dedupeKey);
          return res.status(200).json({ ok: true, skipped: "unsupported_sign_value" });
        }

        await params.signingFlow.startSigning(itemId, newStatus);
        return res.status(200).json({ ok: true, workflow: "signing_email" });
      }

      params.idempotency.forget(dedupeKey);
      return res.status(200).json({ ok: true, skipped: "irrelevant_column" });
    } catch (error) {
      params.idempotency.forget(dedupeKey);
      const message = error instanceof Error ? error.message : "Webhook processing failed";
      if (error instanceof Error) {
        const workflow = GENERATION_TRIGGER_COLUMNS.has(event.columnId)
          ? "document_generation"
          : event.columnId === SIGN_TRIGGER_COLUMN
            ? "signing_email"
            : "unknown";
        console.error(
          JSON.stringify({
            event: "webhook_processing_error",
            workflow,
            itemId,
            ...(boardId !== undefined ? { boardId } : {}),
            columnId: event.columnId,
            extractedStatus: newStatus,
            message: error.message,
            stack: error.stack ?? null
          })
        );
      }
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
