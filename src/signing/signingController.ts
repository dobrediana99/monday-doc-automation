import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { SigningService } from "./signingService";
import { AuditService } from "./auditService";
import { PdfService } from "../documents/pdfService";
import { SigningFlow } from "../flows/signingFlow";

export const SignSubmitSchema = z.object({
  consent: z.literal(true),
  signaturePngBase64: z.string().min(50),
  signerFullName: z
    .string()
    .max(400)
    .transform((s) => s.normalize("NFC").trim())
    .refine((s) => s.length > 0, { message: "Invalid payload" })
});

const RefuseSchema = z.object({
  reason: z.string().max(500).optional()
});

function getClientIp(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  return req.ip || "unknown";
}

function getTokenParam(req: Request): string | null {
  const token = req.params.token;
  if (typeof token === "string" && token.length > 0) {
    return token;
  }
  if (Array.isArray(token) && token[0]) {
    return token[0];
  }
  return null;
}

export function createSigningRouter(params: {
  signingService: SigningService;
  auditService: AuditService;
  pdfService: PdfService;
  signingFlow: SigningFlow;
}): Router {
  const router = Router();

  router.get("/:token", async (req, res) => {
    const token = getTokenParam(req);
    if (!token) {
      return res.status(400).send("Missing token");
    }

    const session = params.signingService.getSessionByToken(token);
    if (!session || session.status !== "active") {
      return res.status(404).send("Link invalid or expired");
    }

    try {
      params.signingService.markViewed(token, {
        ip: getClientIp(req),
        userAgent: req.get("user-agent") || "unknown"
      });
      await params.signingFlow.markViewedAndUpdateMonday({ token });
    } catch {
      // Even if Monday update fails, we still allow viewing the page (stateless UX).
    }

    return res.type("html").send(renderSignPage(token));
  });

  router.get("/:token/document", async (req: Request, res: Response) => {
    const token = getTokenParam(req);
    if (!token) {
      return res.status(400).send("Missing token");
    }

    const session = params.signingService.getSessionByToken(token);
    if (!session || session.status !== "active") {
      return res.status(404).send("Link invalid or expired");
    }

    try {
      const bytes = await params.signingFlow.getSourcePdfBytes(token);
      if (!session.sourcePdfHashSha256) {
        const hash = params.pdfService.sha256Hex(bytes);
        params.signingService.setSourcePdfHash(token, hash);
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(bytes);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load document";
      const errMsg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      console.error(
        JSON.stringify({
          event: "signing_document_download_failed",
          operation: "GetAssetsByIds_or_download",
          itemId: session.itemId,
          boardId: session.boardId,
          sourceAssetId: session.sourceAssetId,
          sourceFileColumnId: session.sourceFileColumnId,
          error: errMsg,
          stack
        })
      );
      return res.status(500).send(message);
    }
  });

  router.post("/:token/submit", async (req: Request, res: Response) => {
    const token = getTokenParam(req);
    if (!token) {
      return res.status(400).json({ error: "Missing token" });
    }

    const session = params.signingService.getSessionByToken(token);
    if (!session || session.status !== "active") {
      return res.status(404).json({ error: "Link invalid or expired" });
    }

    const parsed = SignSubmitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    try {
      params.signingService.markConsented(token);

      // Ensure we have a source hash bound into the audit trail before generating the signed PDF.
      if (!session.sourcePdfHashSha256) {
        const sourceBytes = await params.signingFlow.getSourcePdfBytes(token);
        params.signingService.setSourcePdfHash(token, params.pdfService.sha256Hex(sourceBytes));
      }

      const ip = getClientIp(req);
      const userAgent = req.get("user-agent") || "unknown";
      const signedAt = new Date().toISOString();
      const trailForPdf = {
        ...params.signingService.getAuditTrail(token),
        signedAt,
        ipAtSign: ip,
        userAgentAtSign: userAgent,
        signerFullName: parsed.data.signerFullName
      };

      const sourceBytes = await params.signingFlow.getSourcePdfBytes(token);
      const signedPdfPath = await params.pdfService.generateSignedPdfFromBytes(
        sourceBytes,
        parsed.data.signaturePngBase64,
        trailForPdf
      );

      const finalFileName = `${session.sourcePdfName.replace(/\.pdf$/i, "")}_signed.pdf`;
      params.signingService.markSigned(token, {
        ip,
        userAgent,
        finalSignedFileName: finalFileName,
        signedAt,
        signerFullName: parsed.data.signerFullName
      });

      try {
        await params.signingFlow.sendSignedContractRecipientEmailIfNeeded({
          token,
          signedPdfPath
        });
      } catch (emailError) {
        const errMsg = emailError instanceof Error ? emailError.message : String(emailError);
        console.error(
          JSON.stringify({
            event: "signing_signed_contract_email_failed",
            token,
            itemId: session.itemId,
            error: errMsg
          })
        );
      }

      await params.signingFlow.finalizeSignedDocument({
        token,
        signedPdfPath
      });
      await params.signingFlow.markSignedAndUpdateMonday({ token });

      return res.json({ ok: true, status: "signed" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sign document";
      params.signingService.markError(token, message);
      return res.status(500).json({ error: message });
    }
  });

  router.post("/:token/refuse", async (req: Request, res: Response) => {
    const token = getTokenParam(req);
    if (!token) {
      return res.status(400).json({ error: "Missing token" });
    }

    const session = params.signingService.getSessionByToken(token);
    if (!session || session.status !== "active") {
      return res.status(404).json({ error: "Link invalid or expired" });
    }

    const parsed = RefuseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    try {
      params.signingService.markRefused(token, {
        reason: parsed.data.reason,
        ip: getClientIp(req),
        userAgent: req.get("user-agent") || "unknown"
      });
      await params.signingFlow.markRefusedAndUpdateMonday({ token });
      return res.json({ ok: true, status: "refused" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to refuse";
      params.signingService.markError(token, message);
      return res.status(500).json({ error: message });
    }
  });

  return router;
}

/** HTML for the signing UI (exported for tests). */
export function renderSignPage(token: string): string {
  const encodedToken = encodeURIComponent(token);
  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>CLS - Semnare document / Document signing</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; color: #111; background: #f6f7f9; }
      header { background: #0b1f3a; color: #fff; padding: 14px 18px; }
      header strong { letter-spacing: 0.5px; }
      main { max-width: 980px; margin: 18px auto; padding: 0 18px; }
      .card { background: #fff; border: 1px solid #e6e8ee; border-radius: 10px; padding: 16px; margin-bottom: 14px; }
      .grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
      @media (min-width: 900px) { .grid { grid-template-columns: 1.2fr 0.8fr; } }
      iframe { width: 100%; height: 70vh; border: 1px solid #e6e8ee; border-radius: 8px; background: #fff; }
      canvas { width: 100%; height: 220px; border: 1px solid #cfd6e4; border-radius: 8px; touch-action: none; background: #fff; }
      .row { margin-bottom: 10px; }
      button { padding: 10px 14px; border-radius: 8px; border: 1px solid #cfd6e4; background: #fff; cursor: pointer; }
      button.primary { background: #0b5fff; color: #fff; border-color: #0b5fff; }
      button.danger { background: #b00020; color: #fff; border-color: #b00020; }
      button:disabled { opacity: 0.6; cursor: not-allowed; }
      .muted { color: #556; font-size: 13px; }
      .status { margin-top: 10px; font-weight: 600; white-space: pre-line; }
    </style>
  </head>
  <body>
    <header><strong>CLS</strong> &nbsp;|&nbsp; Semnare document / Document signing</header>
    <main class="grid">
      <section class="card">
        <h3 style="margin: 0 0 4px 0;">Document</h3>
        <p class="muted" style="margin: 0 0 10px 0;">Document (previzualizare) / Document preview</p>
        <p class="muted" style="margin: 0 0 10px 0;">
          Deschideti si verificati documentul inainte de semnare.<br />
          Please review the document before signing.
        </p>
        <iframe src="/sign/${encodedToken}/document" title="Previzualizare document / Document preview"></iframe>
        <p class="muted" style="margin: 10px 0 0 0;">
          Dacă previzualizarea nu se încarcă, deschide în tab nou:<br />
          If the preview does not load, open it in a new tab:
          <a href="/sign/${encodedToken}/document" target="_blank" rel="noopener">Deschide documentul / Open document</a>
        </p>
      </section>

      <section class="card">
        <h3 style="margin: 0 0 10px 0;">Semnatura / Signature</h3>
        <div class="row">
          <label>
            <input id="consent" type="checkbox" />
            Confirm ca am citit si am inteles acest document si sunt de acord sa il semnez electronic.
          </label>
          <div class="muted" style="margin-top: 6px;">
            EN: I confirm I have read and understood this document and I agree to sign it electronically.
          </div>
        </div>
        <div class="row">
          <label for="signerFullName" style="display:block;margin-bottom:6px;font-weight:600;">Nume complet / Full name</label>
          <input id="signerFullName" type="text" maxlength="400" autocomplete="name"
            style="width:100%;max-width:100%;box-sizing:border-box;padding:8px;border:1px solid #cfd6e4;border-radius:8px;" />
          <div class="muted" style="margin-top:6px;">
            Obligatoriu înainte de trimiterea semnăturii. / Required before submitting your signature.
          </div>
        </div>
        <div class="row">
          <canvas id="sig"></canvas>
        </div>
        <div class="row" style="display:flex; gap: 10px; flex-wrap: wrap;">
          <button id="clear" type="button">Sterge semnatura / Clear</button>
          <button id="submit" class="primary" type="button" disabled>Trimite semnatura / Submit signature</button>
          <button id="refuse" class="danger" type="button">Refuz / Refuse</button>
        </div>
        <div id="status" class="status"></div>
      </section>
    </main>

    <script>
      function bilingualStatus(el, ro, en) {
        el.textContent = ro + '\\n' + en;
      }

      const canvas = document.getElementById('sig');
      const ctx = canvas.getContext('2d');
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111';

      let drawing = false;
      let hasInk = false;

      function resizeCanvasPreserve() {
        const rect = canvas.getBoundingClientRect();
        const cssWidth = Math.max(1, Math.floor(rect.width));
        const cssHeight = 220;
        const dpr = window.devicePixelRatio || 1;

        const prev = hasInk ? canvas.toDataURL('image/png') : null;

        canvas.style.width = cssWidth + 'px';
        canvas.style.height = cssHeight + 'px';
        canvas.width = Math.floor(cssWidth * dpr);
        canvas.height = Math.floor(cssHeight * dpr);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineWidth = 2;

        if (prev) {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0, cssWidth, cssHeight);
          };
          img.src = prev;
        }
      }

      function clientToCanvasPoint(evt) {
        const rect = canvas.getBoundingClientRect();
        const xCss = evt.clientX - rect.left;
        const yCss = evt.clientY - rect.top;
        // Convert CSS pixels -> canvas CSS-space coordinates (we use ctx transform for DPR)
        return { x: xCss, y: yCss };
      }

      function start(evt) {
        if (evt.pointerType === 'mouse' && evt.button !== 0) return;
        drawing = true;
        canvas.setPointerCapture(evt.pointerId);
        const p = clientToCanvasPoint(evt);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        evt.preventDefault();
      }

      function draw(evt) {
        if (!drawing) return;
        const p = clientToCanvasPoint(evt);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        hasInk = true;
        updateSubmitState();
        evt.preventDefault();
      }

      function stop(evt) {
        if (!drawing) return;
        drawing = false;
        try { canvas.releasePointerCapture(evt.pointerId); } catch {}
      }

      // Pointer events cover mouse + touch + pen.
      canvas.addEventListener('pointerdown', start);
      canvas.addEventListener('pointermove', draw);
      canvas.addEventListener('pointerup', stop);
      canvas.addEventListener('pointercancel', stop);
      canvas.addEventListener('pointerleave', stop);

      // Prevent touch scrolling while signing.
      canvas.style.touchAction = 'none';

      // Initial sizing + responsive resize.
      resizeCanvasPreserve();
      window.addEventListener('resize', () => {
        resizeCanvasPreserve();
      });

      function fullNameTrimmed() {
        return (document.getElementById('signerFullName').value || '').trim();
      }

      function updateSubmitState() {
        const consent = document.getElementById('consent').checked;
        const nameOk = fullNameTrimmed().length > 0;
        document.getElementById('submit').disabled = !(consent && hasInk && nameOk);
      }

      document.getElementById('consent').addEventListener('change', updateSubmitState);
      document.getElementById('signerFullName').addEventListener('input', updateSubmitState);

      document.getElementById('clear').onclick = () => {
        const rect = canvas.getBoundingClientRect();
        ctx.clearRect(0, 0, rect.width, rect.height);
        hasInk = false;
        updateSubmitState();
      };

      document.getElementById('submit').onclick = async () => {
        const consent = document.getElementById('consent').checked;
        if (!consent) {
          alert('Trebuie sa bifati confirmarea inainte de trimitere.\\n\\nEN: Consent is required before submitting.');
          return;
        }

        const fullName = fullNameTrimmed();
        if (!fullName) {
          const status = document.getElementById('status');
          bilingualStatus(status,
            'Te rugăm să completezi numele complet.',
            'Please enter the full name.');
          return;
        }

        const signaturePngBase64 = canvas.toDataURL('image/png');
        const status = document.getElementById('status');
        bilingualStatus(status, 'Se trimite semnatura...', 'Submitting signature...');

        const resp = await fetch('/sign/${encodedToken}/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ consent: true, signaturePngBase64, signerFullName: fullName })
        });

        const data = await resp.json();
        if (!resp.ok) {
          const detail = (data && data.error) ? String(data.error) : 'Please try again or contact support.';
          bilingualStatus(status, 'A aparut o problema la procesare.', detail);
          return;
        }

        bilingualStatus(status, 'Documentul a fost semnat cu succes.', 'The document was signed successfully.');
        document.getElementById('submit').disabled = true;
        document.getElementById('refuse').disabled = true;
        document.getElementById('clear').disabled = true;
        document.getElementById('signerFullName').disabled = true;
      };

      document.getElementById('refuse').onclick = async () => {
        if (!confirm('Sigur doriti sa refuzati semnarea?\\n\\nEN: Are you sure you want to refuse signing?')) return;
        const status = document.getElementById('status');
        bilingualStatus(status, 'Se trimite refuzul...', 'Submitting refusal...');
        const reason = prompt('Motiv optional (EN: optional reason for refusal):');
        const resp = await fetch('/sign/${encodedToken}/refuse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reason || undefined })
        });
        const data = await resp.json();
        if (!resp.ok) {
          const detail = (data && data.error) ? String(data.error) : 'Please try again or contact support.';
          bilingualStatus(status, 'A aparut o problema la inregistrarea refuzului.', detail);
          return;
        }
        bilingualStatus(status, 'Refuzul a fost inregistrat.', 'Your refusal has been recorded.');
        document.getElementById('submit').disabled = true;
        document.getElementById('refuse').disabled = true;
        document.getElementById('clear').disabled = true;
        document.getElementById('signerFullName').disabled = true;
      };
    </script>
  </body>
</html>`;
}
