import { CrmLycClient } from "../crmLyc/crmLycClient";
import { GcsService } from "../storage/gcsService";
import { TemplateService } from "../documents/templateService";
import { PdfService } from "../documents/pdfService";
import { buildNormalizedItemModel } from "../utils/mondayValues";
import { buildGeneratedPdfFileName } from "../utils/generatedDocumentName";

interface CrmLycDocumentDefinition {
  documentName: string;
  selectedValue: "Client SRL" | "Trans. SRL";
  templateFile: string;
  uploadColumnId: string;
}

const CRM_LYC_DOCUMENTS: CrmLycDocumentDefinition[] = [
  {
    documentName: "cmd_client_RO",
    selectedValue: "Client SRL",
    templateFile: "cmd_client_RO.docx",
    uploadColumnId: "67c7e584-05ba-4188-9e58-8c3f05e53c36"
  },
  {
    documentName: "cmd_furnizor_RO",
    selectedValue: "Trans. SRL",
    templateFile: "cmd_furnizor_RO.docx",
    uploadColumnId: "16782b95-dcd3-48f5-bc9b-e95475b04be3"
  }
];

function toModel(item: Awaited<ReturnType<CrmLycClient["getItemById"]>>): Record<string, unknown> {
  const model = buildNormalizedItemModel(item);
  model.item_name = item.name;
  model.item_id = item.id;
  model.client_name = (model.board_relation_mkpw4bcs as string) || item.name;
  model.price = model.deal_value || "";
  model.loading_address = model.long_text_mkpx6q4a || "";
  return model;
}

export class CrmLycDocumentGenerationFlow {
  constructor(
    private readonly crmLycClient: CrmLycClient,
    private readonly gcsService: GcsService,
    private readonly templateService: TemplateService,
    private readonly pdfService: PdfService
  ) {}

  async process(params: { boardId: string; itemId: string }): Promise<void> {
    const item = await this.crmLycClient.getItemById(params.itemId, params.boardId);
    const model = toModel(item);

    for (const document of CRM_LYC_DOCUMENTS) {
      const tmpFiles: string[] = [];
      try {
        const templatePath = await this.gcsService.downloadTemplateToTmp(document.templateFile);
        tmpFiles.push(templatePath);

        const generatedDocx = await this.templateService.fillTemplate(templatePath, model);
        tmpFiles.push(generatedDocx);

        const generatedPdf = await this.pdfService.convertDocxToPdf(generatedDocx);
        tmpFiles.push(generatedPdf);

        const uploadName = buildGeneratedPdfFileName(document.selectedValue, item);
        await this.crmLycClient.uploadFile(item.id, document.uploadColumnId, generatedPdf, uploadName);

        console.info(
          JSON.stringify({
            event: "crm_lyc_document_generated",
            boardId: params.boardId,
            itemId: params.itemId,
            documentName: document.documentName,
            uploadColumnId: document.uploadColumnId,
            fileName: uploadName
          })
        );
      } finally {
        await this.gcsService.cleanupTmp(tmpFiles);
      }
    }
  }
}
