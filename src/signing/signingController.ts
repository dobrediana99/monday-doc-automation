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

  router.get("/:token", (req, res) => {
    const token = getTokenParam(req);
    if (!token) {
      return res.status(400).send("Missing token");
    }

    const session = params.signingService.getSession(token);
    if (!session || session.used) {
      return res.status(404).send("Link invalid or expired");
    }

    params.signingService.appendAudit(token, {
      type: "VIEW",
      ip: getClientIp(req),
      userAgent: req.get("user-agent") || "unknown"
    });

    return res.type("html").send(renderSignPage(token));
  });

  router.post("/:token", async (req: Request, res: Response) => {
    const token = getTokenParam(req);
    if (!token) {
      return res.status(400).json({ error: "Missing token" });
    }

    const session = params.signingService.getSession(token);
    if (!session || session.used) {
      return res.status(404).json({ error: "Link invalid or expired" });
    }

    const parsed = SignSubmitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    try {
      params.signingService.appendAudit(token, {
        type: "SIGN",
        ip: getClientIp(req),
        userAgent: req.get("user-agent") || "unknown"
      });

      const sourcePdfPath = await params.signingFlow.downloadSourcePdf(token);
      const auditLines = params.auditService.buildAuditLines(session.audit);
      let signedPdfPath = "";
      try {
        signedPdfPath = await params.pdfService.generateSignedPdf(
          sourcePdfPath,
          parsed.data.signaturePngBase64,
          auditLines
        );

        await params.signingFlow.finalizeSignedDocument({
          token,
          signedPdfPath
        });
      } finally {
        await import("node:fs/promises")
          .then((fs) => fs.unlink(sourcePdfPath))
          .catch(() => undefined);
      }

      params.signingService.markUsed(token);
      return res.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to sign document";
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
    <title>Document signing</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 2rem; }
      canvas { border: 1px solid #ccc; touch-action: none; }
      .row { margin-bottom: 1rem; }
      button { padding: 0.5rem 1rem; }
    </style>
  </head>
  <body>
    <h2>Sign document</h2>
    <div class="row">
      <label><input id="consent" type="checkbox" /> I consent to electronically sign this document.</label>
    </div>
    <div class="row">
      <canvas id="sig" width="600" height="220"></canvas>
    </div>
    <div class="row">
      <button id="clear">Clear</button>
      <button id="submit">Submit signature</button>
    </div>
    <div id="status"></div>

    <script>
      const canvas = document.getElementById('sig');
      const ctx = canvas.getContext('2d');
      ctx.lineWidth = 2;
      let drawing = false;

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

      document.getElementById('clear').onclick = () => ctx.clearRect(0, 0, canvas.width, canvas.height);

      document.getElementById('submit').onclick = async () => {
        const consent = document.getElementById('consent').checked;
        if (!consent) {
          alert('Consent is required.');
          return;
        }

        const signaturePngBase64 = canvas.toDataURL('image/png');
        const status = document.getElementById('status');
        status.innerText = 'Submitting...';

        const resp = await fetch('/sign/${token}', {
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
      };
    </script>
  </body>
</html>`;
}
