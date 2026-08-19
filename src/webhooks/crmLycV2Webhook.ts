import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { parseDocumentModelV2 } from "../documents/documentModelV2";
import { knownTemplateCodesV2 } from "../documents/templateRegistryV2";
import type { CrmLycDocumentGenerationV2Flow } from "../flows/crmLycDocumentGenerationV2";

/**
 * `POST /webhooks/crm-lyc/v2` — generare pe modelul nou.
 *
 * SEPARAT DE `/webhooks/crm-lyc` INTENȚIONAT. Ruta veche rămâne exact cum e:
 * alt handler, altă clasă de flux, alt registru de șabloane. Un apel pe v2 nu
 * poate ajunge niciodată în fluxul vechi, și invers. Așa se poate testa pe
 * comenzi reale fără să atingi documentele care se generează azi.
 *
 * SINCRON, NU „fire and forget”. Ruta veche răspunde și lucrează în fundal.
 * Aici se așteaptă rezultatul, fiindcă asta e ruta de test: cine apasă butonul
 * trebuie să vadă imediat DE CE n-a mers, nu să caute prin loguri. Când v2
 * intră în uz normal, se poate face asincron ca cealaltă.
 */

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
    // Se compară oricum, ca durata răspunsului să nu spună dacă lungimea era bună.
    crypto.timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }
  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function createCrmLycV2WebhookRouter(params: {
  documentFlow: CrmLycDocumentGenerationV2Flow;
  webhookSecret: string;
}): Router {
  const router = Router();

  /** Codurile de șablon cunoscute — CRM-ul își poate valida regulile înainte
   *  să trimită ceva ce n-ar putea fi randat. */
  router.get("/crm-lyc/v2/templates", (req: Request, res: Response) => {
    if (!timingSafeStringEqual(extractBearerToken(req.header("authorization")), params.webhookSecret)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.status(200).json({ ok: true, templateCodes: knownTemplateCodesV2() });
  });

  router.post("/crm-lyc/v2", (req: Request, res: Response) => {
    void (async () => {
      if (
        !timingSafeStringEqual(extractBearerToken(req.header("authorization")), params.webhookSecret)
      ) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const parsed = parseDocumentModelV2(req.body);
      if (!parsed.ok) {
        // 422, nu 500: payload-ul e greșit, nu serviciul stricat. CRM-ul arată
        // lista asta omului, cu numele câmpului care lipsește.
        res.status(422).json({ ok: false, errors: parsed.errors });
        return;
      }

      try {
        const result = await params.documentFlow.process(parsed.model);
        res.status(200).json({ ok: true, ...result });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          JSON.stringify({
            event: "crm_lyc_v2_generation_failed",
            itemId: parsed.model.meta.itemId,
            templateCode: parsed.model.meta.templateCode,
            message: message.slice(0, 300)
          })
        );
        res.status(500).json({ ok: false, error: message.slice(0, 300) });
      }
    })();
  });

  return router;
}
