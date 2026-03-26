import path from "node:path";
import { MondayClient, type MondayItem } from "../monday/mondayClient";
import { GcsService } from "../storage/gcsService";
import { TemplateService } from "../documents/templateService";
import { PdfService } from "../documents/pdfService";
import {
  GENERATION_ALLOWED_VALUES,
  getUploadPdfColumn,
  TEMPLATE_MAPPING
} from "../utils/mapping";

function toModel(item: MondayItem): Record<string, unknown> {
  const model: Record<string, unknown> = {
    item_name: item.name,
    item_id: item.id
  };

  for (const col of item.column_values) {
    model[col.id] = col.text ?? "";
  }

  model.client_name = (model.client_name as string) || item.name;
  model.price = model.price || "";
  model.loading_address = model.loading_address || "";

  return model;
}

export class DocumentGenerationFlow {
  constructor(
    private readonly mondayClient: MondayClient,
    private readonly gcsService: GcsService,
    private readonly templateService: TemplateService,
    private readonly pdfService: PdfService,
    private readonly templatePrefix: string
  ) {}

  async process(itemId: string, selectedValue: string): Promise<void> {
    if (!GENERATION_ALLOWED_VALUES.has(selectedValue)) {
      throw new Error(`Unsupported generation value: ${selectedValue}`);
    }

    const item = await this.mondayClient.getItemById(itemId);
    const model = toModel(item);
    const templateFile = TEMPLATE_MAPPING[selectedValue];

    const tmpFiles: string[] = [];
    try {
      const templatePath = await this.gcsService.downloadTemplateToTmp(this.templatePrefix, templateFile);
      tmpFiles.push(templatePath);

      const generatedDocx = await this.templateService.fillTemplate(templatePath, model);
      tmpFiles.push(generatedDocx);

      const generatedPdf = await this.pdfService.convertDocxToPdf(generatedDocx);
      tmpFiles.push(generatedPdf);

      const uploadColumn = getUploadPdfColumn(selectedValue);
      const uploadName = `${path.basename(templateFile, ".docx")}_${item.id}.pdf`;
      const completionStatusColumn = uploadColumn === "file_mksefxnc" ? "color_mkse8v90" : "color_mksn3kgw";

      await this.mondayClient.uploadFile(item.id, uploadColumn, generatedPdf, uploadName);
      await this.mondayClient.updateStatus(item.board.id, item.id, completionStatusColumn, "PDF Generated");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown generation error";
      await this.mondayClient.updateText(item.board.id, item.id, "text_mky32wv3", errorMessage);
      throw error;
    } finally {
      await this.gcsService.cleanupTmp(tmpFiles);
    }
  }
}
