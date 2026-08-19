import type { CrmLycClient } from "../crmLyc/crmLycClient";
import type { PdfService } from "../documents/pdfService";
import type { TemplateService } from "../documents/templateService";
import type { GcsService } from "../storage/gcsService";
import type { DocumentModelV2 } from "../documents/documentModelV2";
import { buildDocxModel } from "../documents/documentModelV2Render";
import { resolveTemplateFileV2 } from "../documents/templateRegistryV2";

/**
 * Generarea pe modelul v2: CRM-ul trimite documentul gata gândit, serviciul îl
 * randează.
 *
 * DIFERENȚA FAȚĂ DE `CrmLycDocumentGenerationFlow`: fluxul vechi primește niște
 * id-uri, își trage singur datele din Supabase și deduce varianta dintr-o
 * matrice. Aici nu se citește nimic din CRM — modelul e complet în payload.
 * Singurul apel înapoi e ca să afle în ce coloană urcă fișierul, și chiar și
 * coloana e cerută prin `crmKey` din payload.
 *
 * CELE DOUĂ FLUXURI NU SE ATING. Clase separate, endpoint separat, registru de
 * șabloane separat, fișiere DOCX în alt folder din bucket (`v2/`). Nimic din ce
 * e aici nu poate schimba comportamentul comenzilor care se generează azi.
 */
export class CrmLycDocumentGenerationV2Flow {
  constructor(
    private readonly crmLycClient: CrmLycClient,
    private readonly gcsService: GcsService,
    private readonly templateService: TemplateService,
    private readonly pdfService: PdfService
  ) {}

  async process(model: DocumentModelV2): Promise<{ fileName: string; uploadColumnId: string }> {
    const resolved = resolveTemplateFileV2(model.meta.templateCode);
    if (!resolved.ok) {
      throw new Error(`crm-lyc v2: ${resolved.error}`);
    }

    const uploadColumnId = await this.crmLycClient.getColumnIdByCrmKey(
      model.meta.boardId,
      model.meta.uploadColumnCrmKey
    );
    if (!uploadColumnId) {
      throw new Error(
        `crm-lyc v2: coloana cu crmKey "${model.meta.uploadColumnCrmKey}" nu există pe board ${model.meta.boardId}`
      );
    }

    const docxModel = buildDocxModel(model);
    const fileName = `${model.meta.fileName ?? `${model.meta.templateCode}_${model.order.number}`}.pdf`;

    const tmpFiles: string[] = [];
    try {
      const templatePath = await this.gcsService.downloadTemplateToTmp(resolved.templateFile);
      tmpFiles.push(templatePath);

      const generatedDocx = await this.templateService.fillTemplate(templatePath, docxModel);
      tmpFiles.push(generatedDocx);

      const generatedPdf = await this.pdfService.convertDocxToPdf(generatedDocx);
      tmpFiles.push(generatedPdf);

      await this.crmLycClient.uploadFile(model.meta.itemId, uploadColumnId, generatedPdf, fileName);

      console.info(
        JSON.stringify({
          event: "crm_lyc_document_generated_v2",
          boardId: model.meta.boardId,
          itemId: model.meta.itemId,
          templateCode: model.meta.templateCode,
          templateFile: resolved.templateFile,
          uploadColumnId,
          fileName,
          // Ce secțiuni au fost pornite — fără asta, un document care iese
          // greșit nu se poate explica fără să reconstitui tot payload-ul.
          flags: Object.entries(model.flags)
            .filter(([, on]) => on)
            .map(([name]) => name),
          stops: model.route.stops.length
        })
      );

      return { fileName, uploadColumnId };
    } finally {
      await this.gcsService.cleanupTmp(tmpFiles);
    }
  }
}
