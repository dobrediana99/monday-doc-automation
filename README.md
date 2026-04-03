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
- `Trans. EOOD` (explicitly rejected with clear error until templates/mapping are implemented)

Process:
1. Receive webhook
2. Fetch full item data from Monday GraphQL API
3. Run strict pre-generation validation (centralized, variant-aware)
4. Map item column values to template model
5. Download DOCX template from GCS (`gs://<GCS_BUCKET>/<filename>` — objects live at bucket root, filename from template mapping)
6. Fill placeholders with `docxtemplater`
7. Convert DOCX to PDF using LibreOffice (`soffice --headless --convert-to pdf`)
8. Upload PDF to Monday file column:
   - Client -> `file_mksefxnc`
   - Supplier -> `file_mksh4n9q`
9. Update status to `PDF Generated` (column `color_mkse8v90`)
10. On error: update error text column `text_mky32wv3`

Notes:
- No email is sent in this flow
- No signing links are created in this flow
- If validation fails, no document is generated/uploaded, `text_mky32wv3` is updated with a Romanian grouped message, and the trigger status is set to `Eroare` if that label exists.

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

### Build + deploy with Cloud Build trigger (`cloudbuild.yaml`)

The repository includes a production-ready root `cloudbuild.yaml` that:
- builds Docker image from the root `Dockerfile`
- pushes image as `gcr.io/$PROJECT_ID/monday-doc-automation:$SHORT_SHA`
- deploys Cloud Run service with configurable substitutions
- updates service image and deploy settings only (runtime env vars/secrets are managed in Cloud Run UI)

#### Required trigger substitutions

Set these in the Cloud Build trigger (or via API):
- `_SERVICE_NAME` (default `monday-doc-automation`)
- `_REGION` (example `europe-west1`)
- `_ALLOW_UNAUTHENTICATED` (`true` for Monday webhooks unless behind authenticated gateway)

Optional runtime/deploy tuning substitutions:
- `_CPU` (default `1`)
- `_MEMORY` (default `512Mi`)
- `_TIMEOUT` (default `300s`)
- `_MAX_INSTANCES` (default `10`)
- `_MIN_INSTANCES` (default `0`)
- `_PLATFORM` (default `managed`)

#### Example trigger configuration

```bash
gcloud builds triggers create github \
  --name="deploy-monday-doc-automation" \
  --repo-name="<REPO_NAME>" \
  --repo-owner="<GITHUB_OWNER>" \
  --branch-pattern="^main$" \
  --build-config="cloudbuild.yaml" \
  --substitutions=_SERVICE_NAME=monday-doc-automation,_REGION=europe-west1,_ALLOW_UNAUTHENTICATED=true
```

Low-cost tips:
- Keep min instances at 0
- Use request-based CPU
- Use short timeouts and small memory unless template payloads require more

Manual run example:

```bash
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_SERVICE_NAME=monday-doc-automation,_REGION=europe-west1,_ALLOW_UNAUTHENTICATED=true
```

All runtime environment variables and secrets (including `MONDAY_API_TOKEN`, `GMAIL_*`, `APP_BASE_URL`, etc.) are intentionally not managed by `cloudbuild.yaml` to avoid secret-vs-literal type conflicts between revisions. Configure them manually in Cloud Run (recommended with Secret Manager where appropriate).

### Validation behavior before generation

Generation validation is implemented centrally in `src/validation/generationValidation.ts`.

- Runs immediately after item fetch and before template selection/docx/pdf/upload.
- Uses normalized parsing for Monday values (status, dropdown, relation, lookup, numeric, email).
- Placeholder values are treated as invalid for required fields:
  - empty / null / undefined
  - `Alege!`, `Alege`
  - `Apasa Aici!`, `Apasa Aici`
- On failure:
  - generation stops immediately
  - no file upload is performed
  - `text_mky32wv3` receives deterministic Romanian grouped error text
  - trigger status (`color_mky3xvmr` or `color_mksh6s1y`) is set to `Eroare` if label exists

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

