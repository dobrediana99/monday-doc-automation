import { describe, expect, it } from "vitest";
import {
  renderSignPage,
  SIGN_VALIDATION_CONSENT_EN,
  SIGN_VALIDATION_CONSENT_RO,
  SIGN_VALIDATION_FULL_NAME_EN,
  SIGN_VALIDATION_FULL_NAME_RO
} from "./signingController";

describe("renderSignPage", () => {
  const html = renderSignPage("test-token-abc");

  it("includes Crystal/CLS logo asset", () => {
    expect(html).toContain('src="/sign/assets/logo-crystal.png"');
  });

  it("includes Go to end of document button and iframe id for preview", () => {
    expect(html).toContain("Mergi la finalul documentului / Go to end of document");
    expect(html).toContain('id="documentPreviewScroll"');
  });

  it("includes script logic to jump to end of document and fallback scroll to signature card", () => {
    expect(html).toContain("scrollIntoView");
    expect(html).toContain("signatureCard");
    expect(html).toContain("preview.scrollTo");
  });

  it("requires document review before enabling submit", () => {
    expect(html).toContain("let documentReviewed = false");
    expect(html).toContain("consent && hasInk && nameOk && documentReviewed");
    expect(html).toContain("Pentru a semna, parcurge documentul până la final");
    expect(html).toContain("function markDocumentReviewed()");
  });

  it("detects manual scroll reaching bottom for review unlock", () => {
    expect(html).toContain("addEventListener('scroll'");
    expect(html).toContain("preview.scrollTop + preview.clientHeight >= preview.scrollHeight - threshold");
    expect(html).toContain("const threshold = 80");
  });

  it("includes robust iframe fallback when PDF.js fails", () => {
    expect(html).toContain('type="module"');
    expect(html).toContain('import * as pdfjsLib from "/sign/assets/pdfjs/pdf.mjs"');
    expect(html).toContain('pdfjsLib.GlobalWorkerOptions.workerSrc = "/sign/assets/pdfjs/pdf.worker.mjs"');
    expect(html).not.toContain("createElement('iframe')");
    expect(html).not.toContain("cdnjs.cloudflare.com/ajax/libs/pdf.js");
  });

  it("includes reviewed status copy", () => {
    expect(html).toContain("Document parcurs / Document reviewed");
  });

  it("includes bilingual signing success copy in the embedded script", () => {
    expect(html).toContain("Documentul a fost semnat cu succes.");
    expect(html).toContain("The document was signed successfully.");
  });

  it("does not include the QES / custom workflow disclaimer", () => {
    expect(html).not.toMatch(/not QES/i);
    expect(html).not.toMatch(/custom electronic signature workflow/i);
  });

  it("includes bilingual preview fallback helper under the iframe", () => {
    expect(html).toContain("Dacă previzualizarea nu se încarcă, deschide în tab nou:");
    expect(html).toContain("If the preview does not load, open it in a new tab:");
  });

  it("includes bilingual intermediate status strings", () => {
    expect(html).toContain("Se trimite semnatura...");
    expect(html).toContain("Submitting signature...");
    expect(html).toContain("Se trimite refuzul...");
    expect(html).toContain("Submitting refusal...");
    expect(html).toContain("A aparut o problema la procesare.");
  });

  it("includes mandatory bilingual full name field and validation copy", () => {
    expect(html).toContain('id="signerFullName"');
    expect(html).toContain("Nume complet / Full name");
    expect(html).toContain("fullNameTrimmed");
    expect(html).toContain(SIGN_VALIDATION_FULL_NAME_RO);
    expect(html).toContain(SIGN_VALIDATION_FULL_NAME_EN);
    expect(html).toContain("signerFullName: fullName");
  });

  it("includes bilingual consent validation in the submit handler (no alert)", () => {
    expect(html).toContain(SIGN_VALIDATION_CONSENT_RO);
    expect(html).toContain(SIGN_VALIDATION_CONSENT_EN);
    expect(html).not.toContain("Trebuie sa bifati confirmarea");
    expect(html).toContain("data.errorRo && data.errorEn");
  });
});
