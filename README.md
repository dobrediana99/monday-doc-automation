# monday-doc-automation

Production-ready Node.js + TypeScript backend for Monday.com document generation and signing workflows.

- Stateless design for Google Cloud Run
- No database required
- In-memory idempotency and signing token/session storage
- No AI/LLM usage

## Implemented Endpoints

- `POST /webhooks/monday`
- `GET /sign/:token`
- `POST /sign/:token`
- `GET /health`

---

## Workflow 1: Document Generation (separate flow)

Triggered by Monday webhook column changes:
- `color_mky3xvmr` (Genereaza Cmd. Client/Furnizor)
- `color_mksh6s1y` (Genereaza Cmd.)

Supported values:
- `Client SRL`
- `Client GmbH`
- `Trans. SRL`
- `Trans. GmbH`

Process:
1. Receive webhook
2. Fetch full item data from Monday GraphQL API
3. Map item column values to template model
4. Download DOCX template from GCS
5. Fill placeholders with `docxtemplater`
6. Convert DOCX to PDF using LibreOffice (`soffice --headless --convert-to pdf`)
7. Upload PDF to Monday file column:
   - Client -> `file_mksefxnc`
   - Supplier -> `file_mksh4n9q`
8. Update status to `PDF Generated` (column `color_mkse8v90`)
9. On error: update error text column `text_mky32wv3`

Notes:
- No email is sent in this flow
- No signing links are created in this flow

---

## Workflow 2: Signing + Email (separate flow)

Triggered by Monday webhook column change:
- `color_mkshk7ap` (Trimite)

Supported values:
- `Trimite Client SRL`
- `Trimite Client GmbH`
- `Trimite Furnizor SRL`
- `Trimite Funizor GmbH`

Process:
1. Validate source PDF exists in Monday source file column
2. Generate secure expiring token (`uuid + random bytes`)
3. Create signing link `/sign/:token`
4. Save signing link to Monday link column:
   - Client -> `link_mksvc32a`
   - Supplier -> `link_mkx8cgp8`
5. Send email with signing link using Gmail API

When link is opened:
- Logs `VIEW` event (timestamp, IP, user-agent)

When signature is submitted:
- Enforces consent checkbox
- Captures drawn signature (canvas PNG)
- Logs `SIGN` event

After successful sign:
1. Creates final signed PDF
2. Embeds signature + audit trail lines
3. Uploads signed PDF to Monday:
   - Client -> `file_mkser695`
   - Supplier -> `file_mksespqb`
4. Updates Monday signed status:
   - Client -> `color_mkse8v90`
   - Supplier -> `color_mksn3kgw`

---

## Project Structure

```text
src/
  server.ts
  config/
    env.ts
  webhooks/
    mondayWebhook.ts
  monday/
    mondayClient.ts
    queries.ts
  flows/
    documentGeneration.ts
    signingFlow.ts
  documents/
    templateService.ts
    pdfService.ts
  signing/
    signingController.ts
    signingService.ts
    auditService.ts
  email/
    gmailService.ts
  storage/
    gcsService.ts
  utils/
    idempotency.ts
    mapping.ts
```

---

## Template Mapping

Configured in `src/utils/mapping.ts`:

```json
{
  "Client SRL": "cmd_client_RO.docx",
  "Client GmbH": "cmd_client_CH.docx",
  "Trans. SRL": "cmd_furnizor_RO.docx",
  "Trans. GmbH": "cmd_furnizor_CH.docx"
}
```

---

## Environment Variables

Create `.env` (or set through Cloud Run):

```bash
NODE_ENV=production
PORT=8080
APP_BASE_URL=https://your-cloud-run-service-url

MONDAY_API_TOKEN=your_monday_token
MONDAY_API_URL=https://api.monday.com/v2
WEBHOOK_SECRET=optional-shared-secret

GCS_BUCKET=your-template-bucket
TEMPLATE_PREFIX=templates
GOOGLE_CLOUD_PROJECT=your-gcp-project

GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REDIRECT_URI=...
GMAIL_REFRESH_TOKEN=...
GMAIL_SENDER=sender@example.com

SIGN_TOKEN_TTL_MINUTES=1440
IDEMPOTENCY_TTL_MINUTES=60
```

### Required Monday item data assumptions

For sending email recipients, the flow expects these mapped fields from Monday column IDs:
- `client_email`
- `supplier_email`

If your board uses different column IDs, adjust `extractEmailByVariant()` in `src/utils/mapping.ts`.

---

## Local Development

```bash
npm install
npm run dev
```

Typecheck + build:

```bash
npm run typecheck
npm run build
```

---

## Docker / Cloud Run

### Build image

```bash
docker build -t gcr.io/<PROJECT_ID>/monday-doc-automation:latest .
```

### Push image

```bash
docker push gcr.io/<PROJECT_ID>/monday-doc-automation:latest
```

### Deploy to Cloud Run

```bash
gcloud run deploy monday-doc-automation \
  --image gcr.io/<PROJECT_ID>/monday-doc-automation:latest \
  --platform managed \
  --region <REGION> \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --set-env-vars NODE_ENV=production,PORT=8080,APP_BASE_URL=https://<SERVICE_URL>,MONDAY_API_TOKEN=<TOKEN>,MONDAY_API_URL=https://api.monday.com/v2,GCS_BUCKET=<BUCKET>,TEMPLATE_PREFIX=templates,GMAIL_CLIENT_ID=<ID>,GMAIL_CLIENT_SECRET=<SECRET>,GMAIL_REDIRECT_URI=<URI>,GMAIL_REFRESH_TOKEN=<REFRESH>,GMAIL_SENDER=<SENDER>
```

Low-cost tips:
- Keep min instances at 0
- Use request-based CPU
- Use short timeouts and small memory unless template payloads require more

---

## Monday Webhook Setup

Create a board webhook targeting:
- `POST https://<SERVICE_URL>/webhooks/monday`

Subscribe to column value changes for:
- `color_mky3xvmr`
- `color_mksh6s1y`
- `color_mkshk7ap`

For Monday webhook challenge verification, endpoint returns:

```json
{ "challenge": "..." }
```

If `WEBHOOK_SECRET` is set, pass it as header:
- `x-webhook-secret: <WEBHOOK_SECRET>`

---

## Operational Notes

- Uses `/tmp` only for intermediate docx/pdf files
- Cleans temporary files after processing
- No persistent PDF storage in GCS
- In-memory maps are runtime-local (suitable for stateless operation)
- Idempotency key: `itemId + columnId + newStatus`

