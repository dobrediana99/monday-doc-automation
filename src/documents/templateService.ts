import { promises as fs } from "node:fs";
import path from "node:path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export class TemplateService {
  async fillTemplate(templatePath: string, model: Record<string, unknown>): Promise<string> {
    const content = await fs.readFile(templatePath, "binary");
    const zip = new PizZip(content);

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      // Fără asta, o cheie lipsă din model se randează literal „undefined" în
      // document. Pe o comandă care se semnează, un câmp gol e acceptabil;
      // cuvântul „undefined" tipărit lângă o etichetă nu e.
      nullGetter: () => ""
    });

    doc.render(model);

    const buffer = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE"
    });

    const outputPath = path.join("/tmp", `${Date.now()}-generated.docx`);
    await fs.writeFile(outputPath, buffer);
    return outputPath;
  }
}
