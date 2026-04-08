import { MondayClient, type MondayItem } from "../monday/mondayClient";
import { GcsService } from "../storage/gcsService";
import { TemplateService } from "../documents/templateService";
import { PdfService } from "../documents/pdfService";
import {
  GENERATION_ALLOWED_VALUES,
  GENERATION_TRIGGER_COLUMNS,
  getUploadPdfColumn,
  legalFormLabelForTrigger,
  legalFormStatusColumnForTrigger,
  TEMPLATE_MAPPING
} from "../utils/mapping";
import { buildGeneratedPdfFileName } from "../utils/generatedDocumentName";
import { buildNormalizedItemModel } from "../utils/mondayValues";
import {
  GENERATION_ERROR_TEXT_COLUMN,
  validateGenerationRequest
} from "../validation/generationValidation";

function toModel(item: MondayItem, selectedValue: string): Record<string, unknown> {
  const model = buildNormalizedItemModel(item);
  model.item_name = item.name;
  model.item_id = item.id;
  model.client_name = (model.client_name as string) || item.name;
  model.price = model.price || "";
  model.loading_address = model.loading_address || "";

  const legalColumnId = legalFormStatusColumnForTrigger(selectedValue);
  const legalLabel = legalFormLabelForTrigger(selectedValue);
  if (legalColumnId && legalLabel) {
    model[legalColumnId] = legalLabel;
  }

  return model;
}

export class DocumentGenerationFlow {
  constructor(
    private readonly mondayClient: MondayClient,
    private readonly gcsService: GcsService,
    private readonly templateService: TemplateService,
    private readonly pdfService: PdfService
  ) {}

  async process(itemId: string, selectedValue: string, triggerColumnId: string): Promise<void> {
    if (!GENERATION_TRIGGER_COLUMNS.has(triggerColumnId)) {
      throw new Error(`Unsupported generation trigger column: ${triggerColumnId}`);
    }

    if (!GENERATION_ALLOWED_VALUES.has(selectedValue)) {
      throw new Error(`Unsupported generation value: ${selectedValue}`);
    }

    const item = await this.mondayClient.getItemById(itemId);
    const validation = validateGenerationRequest({
      item,
      selectedValue
    });

    if (!validation.ok) {
      const validationMessage =
        validation.errors[0] ??
        "Nu se poate genera comanda. Exista campuri obligatorii lipsa sau invalide.";
      console.warn(
        JSON.stringify({
          event: "generation_validation_failed",
          itemId,
          boardId: item.board.id,
          triggerColumnId,
          selectedValue,
          validation
        })
      );

      await this.mondayClient.updateText(item.board.id, item.id, GENERATION_ERROR_TEXT_COLUMN, validationMessage);
      await this.trySetStatusIfLabelExists(item.board.id, item.id, triggerColumnId, "Eroare");
      return;
    }

    await this.mondayClient.updateText(item.board.id, item.id, GENERATION_ERROR_TEXT_COLUMN, "");
    await this.trySetStatusIfLabelExists(item.board.id, item.id, triggerColumnId, "Generating...");

    const legalColumnId = legalFormStatusColumnForTrigger(selectedValue);
    const legalLabel = legalFormLabelForTrigger(selectedValue);
    if (legalColumnId && legalLabel) {
      await this.trySetStatusIfLabelExists(item.board.id, item.id, legalColumnId, legalLabel);
    }

    const templateFile = TEMPLATE_MAPPING[selectedValue];
    if (!templateFile) {
      const unsupportedMessage = `Nu se poate genera comanda. Varianta "${selectedValue}" nu este implementata in acest serviciu.`;
      await this.mondayClient.updateText(item.board.id, item.id, GENERATION_ERROR_TEXT_COLUMN, unsupportedMessage);
      await this.trySetStatusIfLabelExists(item.board.id, item.id, triggerColumnId, "Eroare");
      return;
    }

    const model = toModel(item, selectedValue);
    const tmpFiles: string[] = [];
    try {
      const templatePath = await this.gcsService.downloadTemplateToTmp(templateFile);
      tmpFiles.push(templatePath);

      const generatedDocx = await this.templateService.fillTemplate(templatePath, model);
      tmpFiles.push(generatedDocx);

      const generatedPdf = await this.pdfService.convertDocxToPdf(generatedDocx);
      tmpFiles.push(generatedPdf);

      const uploadColumn = getUploadPdfColumn(selectedValue);
      const uploadName = buildGeneratedPdfFileName(selectedValue, item);

      await this.mondayClient.uploadFile(item.id, uploadColumn, generatedPdf, uploadName);
      await this.trySetStatusIfLabelExists(item.board.id, item.id, triggerColumnId, "PDF Generated");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown generation error";
      await this.mondayClient.updateText(item.board.id, item.id, GENERATION_ERROR_TEXT_COLUMN, errorMessage);
      throw error;
    } finally {
      await this.gcsService.cleanupTmp(tmpFiles);
    }
  }

  private async trySetStatusIfLabelExists(
    boardId: string,
    itemId: string,
    columnId: string,
    label: string
  ): Promise<void> {
    try {
      const hasLabel = await this.mondayClient.hasStatusLabel(boardId, columnId, label);
      if (!hasLabel) {
        return;
      }
      await this.mondayClient.updateStatus(boardId, itemId, columnId, label);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown status update error";
      console.warn(
        JSON.stringify({
          event: "generation_status_update_skipped",
          boardId,
          itemId,
          columnId,
          label,
          error: message
        })
      );
    }
  }
}
