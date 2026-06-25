import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import {
  CRM_LYC_SIGNED_STATUS_LABEL,
  CRM_LYC_TRANSPORT_STATUS_CRM_KEY,
  type CrmLycClient
} from "../crmLyc/crmLycClient";
import type { CrmLycDocumentGenerationFlow } from "../flows/crmLycDocumentGeneration";
import type { CrmLycSigningFlow } from "../flows/crmLycSigningFlow";
import { IdempotencyService } from "../utils/idempotency";

interface CrmLycWebhookPayload {
  automation?: {
    boardId?: string;
    itemId?: string;
  };
  vars?: {
    template?: string;
    /** "send_for_signing" triggers the CRM signing flow. Absent → document generation flow. */
    action?: string;
    recipientEmail?: string;
  };
  event?: {
    columnId?: string;
    record?: {
      value?: unknown;
    };
  };
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function timingSafeStringEqual(received: string | null, expected: string): boolean {
  if (!received) {
    return false;
  }

  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length) {
    crypto.timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }
  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function createCrmLycWebhookRouter(params: {
  crmLycClient: CrmLycClient;
  documentFlow: CrmLycDocumentGenerationFlow;
  signingFlow: CrmLycSigningFlow;
  idempotency: IdempotencyService;
  webhookSecret: string;
}): Router {
  const router = Router();

  router.post("/crm-lyc", async (req: Request, res: Response) => {
    const bearer = extractBearerToken(req.get("authorization"));
    if (!timingSafeStringEqual(bearer, params.webhookSecret)) {
      return res.status(401).json({ error: "Unauthorized webhook request" });
    }

    const payload = req.body as CrmLycWebhookPayload;
    const boardId = payload.automation?.boardId;
    const itemId = payload.automation?.itemId;
    const template = payload.vars?.template;
    const action = payload.vars?.action;

    if (!boardId || !itemId) {
      return res.status(400).json({ error: "Invalid crm-lyc webhook payload: boardId and itemId required" });
    }

    // ── Signing flow ────────────────────────────────────────────────────────
    if (action === "send_for_signing") {
      if (!template) {
        return res.status(400).json({ error: "vars.template required for send_for_signing action" });
      }
      try {
        await params.signingFlow.startSigning({
          itemId,
          boardId,
          template,
          recipientEmail: payload.vars?.recipientEmail
        });
        return res.status(200).json({ ok: true, workflow: "crm_lyc_signing" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "crm-lyc signing failed";
        console.error(
          JSON.stringify({
            event: "crm_lyc_signing_error",
            boardId,
            itemId,
            template,
            message,
            stack: error instanceof Error ? error.stack : undefined
          })
        );
        return res.status(500).json({ error: message });
      }
    }

    // ── Document generation flow (original) ────────────────────────────────
    const columnId = payload.event?.columnId;
    const value = payload.event?.record?.value;

    if (!columnId) {
      return res.status(400).json({ error: "Invalid crm-lyc webhook payload: event.columnId required" });
    }

    let isSignedTransportStatus = false;
    try {
      isSignedTransportStatus = await params.crmLycClient.isStatusValueForCrmKey({
        boardId,
        columnId,
        crmKey: CRM_LYC_TRANSPORT_STATUS_CRM_KEY,
        value,
        label: CRM_LYC_SIGNED_STATUS_LABEL
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        JSON.stringify({
          event: "crm_lyc_trigger_verification_failed",
          boardId,
          itemId,
          columnId,
          message
        })
      );
      return res.status(500).json({ error: message });
    }

    if (!isSignedTransportStatus) {
      return res.status(200).json({ ok: true, skipped: "irrelevant_crm_lyc_trigger" });
    }

    const dedupeKey = params.idempotency.makeKey(itemId, columnId, CRM_LYC_SIGNED_STATUS_LABEL);
    if (params.idempotency.isDuplicate(dedupeKey)) {
      console.info(
        JSON.stringify({
          event: "crm_lyc_generation_duplicate_webhook_skipped",
          boardId,
          itemId,
          columnId
        })
      );
      return res.status(200).json({ ok: true, skipped: "duplicate" });
    }
    params.idempotency.remember(dedupeKey);

    try {
      await params.documentFlow.process({ boardId, itemId, template });
      params.idempotency.forget(dedupeKey);
      return res.status(200).json({ ok: true, workflow: "crm_lyc_document_generation" });
    } catch (error) {
      params.idempotency.forget(dedupeKey);
      const message = error instanceof Error ? error.message : "crm-lyc webhook processing failed";
      console.error(
        JSON.stringify({
          event: "crm_lyc_webhook_processing_error",
          boardId,
          itemId,
          columnId,
          message,
          stack: error instanceof Error ? error.stack : undefined
        })
      );
      return res.status(500).json({ error: message });
    }
  });

  return router;
}
