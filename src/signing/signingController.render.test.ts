import { describe, expect, it } from "vitest";
import { renderSignPage } from "./signingController";

describe("renderSignPage", () => {
  const html = renderSignPage("test-token-abc");

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
});
