import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { SigningService } from "./signingService";
import { AuditService } from "./auditService";
import { PdfService } from "../documents/pdfService";
import { SigningFlow } from "../flows/signingFlow";

const SignSubmitSchema = z.object({
  consent: z.literal(true),
  signaturePngBase64: z.string().min(50)
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

      const trail = params.signingService.getAuditTrail(token);
      const auditLines = params.auditService.buildAuditLines(trail);

      const sourceBytes = await params.signingFlow.getSourcePdfBytes(token);
      const signedPdfPath = await params.pdfService.generateSignedPdfFromBytes(
        sourceBytes,
        parsed.data.signaturePngBase64,
        auditLines
      );

      const finalFileName = `${session.sourcePdfName.replace(/\.pdf$/i, "")}_signed.pdf`;
      params.signingService.markSigned(token, {
        ip: getClientIp(req),
        userAgent: req.get("user-agent") || "unknown",
        finalSignedFileName: finalFileName
      });

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

function renderSignPage(token: string): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>CLS - Semnare document</title>
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
      .status { margin-top: 10px; font-weight: 600; }
    </style>
  </head>
  <body>
    <header><strong>CLS</strong> &nbsp;|&nbsp; Semnare document</header>
    <main class="grid">
      <section class="card">
        <h3 style="margin: 0 0 10px 0;">Document</h3>
        <p class="muted" style="margin: 0 0 10px 0;">
          Deschide si verifica documentul inainte de semnare. / Please review the document before signing.
        </p>
        <iframe src="/sign/${token}/document" title="Document preview"></iframe>
        <p class="muted" style="margin: 10px 0 0 0;">
          Daca previzualizarea nu se incarca, deschide in tab nou:
          <a href="/sign/${token}/document" target="_blank" rel="noopener">Open document</a>
        </p>
      </section>

      <section class="card">
        <h3 style="margin: 0 0 10px 0;">Semnatura</h3>
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
          <canvas id="sig" width="900" height="220"></canvas>
        </div>
        <div class="row" style="display:flex; gap: 10px; flex-wrap: wrap;">
          <button id="clear" type="button">Clear</button>
          <button id="submit" class="primary" type="button" disabled>Submit signature</button>
          <button id="refuse" class="danger" type="button">Refuse</button>
        </div>
        <div id="status" class="status"></div>
        <div class="muted" style="margin-top: 10px;">
          This is a custom electronic signature workflow (not QES).
        </div>
      </section>
    </main>

    <script>
      const canvas = document.getElementById('sig');
      const ctx = canvas.getContext('2d');
      ctx.lineWidth = 2;
      let drawing = false;
      let hasInk = false;

      function pos(evt) {
        const rect = canvas.getBoundingClientRect();
        const point = evt.touches ? evt.touches[0] : evt;
        return { x: point.clientX - rect.left, y: point.clientY - rect.top };
      }

      function start(evt) {
        drawing = true;
        const p = pos(evt);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        evt.preventDefault();
      }

      function draw(evt) {
        if (!drawing) return;
        const p = pos(evt);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        hasInk = true;
        updateSubmitState();
        evt.preventDefault();
      }

      function stop() { drawing = false; }

      canvas.addEventListener('mousedown', start);
      canvas.addEventListener('mousemove', draw);
      canvas.addEventListener('mouseup', stop);
      canvas.addEventListener('mouseleave', stop);
      canvas.addEventListener('touchstart', start, { passive: false });
      canvas.addEventListener('touchmove', draw, { passive: false });
      canvas.addEventListener('touchend', stop);

      function updateSubmitState() {
        const consent = document.getElementById('consent').checked;
        document.getElementById('submit').disabled = !(consent && hasInk);
      }

      document.getElementById('consent').addEventListener('change', updateSubmitState);

      document.getElementById('clear').onclick = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        hasInk = false;
        updateSubmitState();
      };

      document.getElementById('submit').onclick = async () => {
        const consent = document.getElementById('consent').checked;
        if (!consent) {
          alert('Consent is required.');
          return;
        }

        const signaturePngBase64 = canvas.toDataURL('image/png');
        const status = document.getElementById('status');
        status.innerText = 'Submitting...';

        const resp = await fetch('/sign/${token}/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ consent: true, signaturePngBase64 })
        });

        const data = await resp.json();
        if (!resp.ok) {
          status.innerText = data.error || 'Failed';
          return;
        }

        status.innerText = 'Document signed successfully.';
        document.getElementById('submit').disabled = true;
        document.getElementById('refuse').disabled = true;
        document.getElementById('clear').disabled = true;
      };

      document.getElementById('refuse').onclick = async () => {
        if (!confirm('Are you sure you want to refuse signing?')) return;
        const status = document.getElementById('status');
        status.innerText = 'Submitting refusal...';
        const reason = prompt('Optional: reason for refusal');
        const resp = await fetch('/sign/${token}/refuse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reason || undefined })
        });
        const data = await resp.json();
        if (!resp.ok) {
          status.innerText = data.error || 'Failed';
          return;
        }
        status.innerText = 'Refusal recorded.';
        document.getElementById('submit').disabled = true;
        document.getElementById('refuse').disabled = true;
        document.getElementById('clear').disabled = true;
      };
    </script>
  </body>
</html>`;
}
