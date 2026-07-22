import { CrmLycClient } from "../crmLyc/crmLycClient";
import { GcsService } from "../storage/gcsService";
import { TemplateService } from "../documents/templateService";
import { PdfService } from "../documents/pdfService";
import { buildNormalizedItemModel } from "../utils/mondayValues";
import { buildGeneratedPdfFileName } from "../utils/generatedDocumentName";
import type { GenerationLegalForm } from "../utils/mapping";
import {
  TEMPLATE_MAPPING,
  crmLycGenerationTrigger,
  resolveCrmLycLegalFormFromPeColumn
} from "../utils/mapping";
import { applyPaymentTermsToModel } from "../utils/paymentTermDisplay";

const UPLOAD_COLUMN_BY_TEMPLATE: Record<string, string> = {
  client: "unsigned_client_order",
  furnizor: "unsigned_supplier_order",
  intermediar: "comanda_intermediara"
};

function toModel(
  item: Awaited<ReturnType<CrmLycClient["getItemById"]>>,
  params: { template: string; legalForm: GenerationLegalForm }
): Record<string, unknown> {
  const model = buildNormalizedItemModel(item);
  model.item_name = item.name;
  model.item_id = item.id;
  model.client_name = (model.board_relation_mkpw4bcs as string) || item.name;
  model.price = model.deal_value || "";
  model.loading_address = model.long_text_mkpx6q4a || "";

  // Furnizor templates use Plata la (Client) + Conditii de Plata Client placeholders.
  applyPaymentTermsToModel({ model, legalForm: params.legalForm, party: "client" });

  return model;
}

export class CrmLycDocumentGenerationFlow {
  constructor(
    private readonly crmLycClient: CrmLycClient,
    private readonly gcsService: GcsService,
    private readonly templateService: TemplateService,
    private readonly pdfService: PdfService
  ) {}

  async process(params: {
    boardId: string;
    itemId: string;
    template?: string;
  }): Promise<void> {
    const [item, textValues] = await Promise.all([
      this.crmLycClient.getItemById(params.itemId, params.boardId),
      this.crmLycClient.getItemTextValuesByCrmKey(params.itemId, params.boardId)
    ]);

    const templates = params.template ? [params.template] : Object.keys(UPLOAD_COLUMN_BY_TEMPLATE);

    for (const template of templates) {
      // Comandă intermediară: casa de expediție e mereu Crystal SRL, nu depinde
      // de nicio coloană "Furnizor pe"/"Client pe" pe item.
      const legalForm: GenerationLegalForm =
        template === "intermediar" ? "SRL" : resolveCrmLycLegalFormFromPeColumn({ template, textValues });
      const selectedValue = crmLycGenerationTrigger(template, legalForm);
      if (!selectedValue) {
        throw new Error(`crm-lyc document generation: template necunoscut "${template}"`);
      }

      const model = toModel(item, { template, legalForm });

      const templateFile = TEMPLATE_MAPPING[selectedValue];
      if (!templateFile) {
        throw new Error(
          `crm-lyc document generation: fișier template lipsă pentru "${selectedValue}"`
        );
      }

      const uploadColumnCrmKey = UPLOAD_COLUMN_BY_TEMPLATE[template];
      const uploadColumnId = await this.crmLycClient.getColumnIdByCrmKey(
        params.boardId,
        uploadColumnCrmKey
      );
      if (!uploadColumnId) {
        throw new Error(
          `crm-lyc document generation: coloana cu crmKey "${uploadColumnCrmKey}" nu există pe board ${params.boardId}`
        );
      }

      const tmpFiles: string[] = [];
      try {
        const templatePath = await this.gcsService.downloadTemplateToTmp(templateFile);
        tmpFiles.push(templatePath);

        const generatedDocx = await this.templateService.fillTemplate(templatePath, model);
        tmpFiles.push(generatedDocx);

        const generatedPdf = await this.pdfService.convertDocxToPdf(generatedDocx);
        tmpFiles.push(generatedPdf);

        const uploadName = buildGeneratedPdfFileName(selectedValue, item);
        await this.crmLycClient.uploadFile(item.id, uploadColumnId, generatedPdf, uploadName);

        console.info(
          JSON.stringify({
            event: "crm_lyc_document_generated",
            boardId: params.boardId,
            itemId: params.itemId,
            selectedValue,
            templateFile,
            uploadColumnId,
            fileName: uploadName
          })
        );
      } finally {
        await this.gcsService.cleanupTmp(tmpFiles);
      }
    }
  }
}
