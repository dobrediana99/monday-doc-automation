import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { MondayClient, MondayItem } from "../monday/mondayClient";
import * as generationValidation from "../validation/generationValidation";
import { DocumentGenerationFlow } from "./documentGeneration";
import { GenerationValidationError } from "./generationErrors";

function minimalItem(): MondayItem {
  return {
    id: "12345",
    name: "CLS9999",
    board: { id: "2030349838" },
    column_values: [],
    assets: []
  };
}

describe("DocumentGenerationFlow validation failure", () => {
  const getItemById = vi.fn().mockResolvedValue(minimalItem());
  const updateText = vi.fn().mockResolvedValue(undefined);
  const hasStatusLabel = vi.fn().mockResolvedValue(true);
  const updateStatus = vi.fn().mockResolvedValue(undefined);

  const mondayClient = {
    getItemById,
    updateText,
    hasStatusLabel,
    updateStatus
  } as unknown as MondayClient;

  const gcsService = { downloadTemplateToTmp: vi.fn(), cleanupTmp: vi.fn() };
  const templateService = { fillTemplate: vi.fn() };
  const pdfService = { convertDocxToPdf: vi.fn() };

  beforeEach(() => {
    vi.spyOn(generationValidation, "validateGenerationRequest").mockReturnValue({
      ok: false,
      errors: ["Eroare validare: camp lipsa (test)."],
      missingFields: [],
      invalidFields: [],
      issues: []
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws GenerationValidationError after Monday error sync (for webhook forget)", async () => {
    const flow = new DocumentGenerationFlow(
      mondayClient,
      gcsService as never,
      templateService as never,
      pdfService as never
    );

    await expect(flow.process("12345", "Client SRL", "color_mky3xvmr")).rejects.toThrow(
      GenerationValidationError
    );

    expect(updateText).toHaveBeenCalledWith(
      "2030349838",
      "12345",
      generationValidation.GENERATION_ERROR_TEXT_COLUMN,
      "Eroare validare: camp lipsa (test)."
    );
    expect(updateStatus).toHaveBeenCalledWith("2030349838", "12345", "color_mky3xvmr", "Eroare");
  });
});
