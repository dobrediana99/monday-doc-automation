import { Storage } from "@google-cloud/storage";
import path from "node:path";
import { promises as fs } from "node:fs";

export class GcsService {
  private readonly storage: Storage;

  constructor(private readonly bucketName: string) {
    this.storage = new Storage();
  }

  async downloadTemplateToTmp(templatePrefix: string, templateFile: string): Promise<string> {
    const sourcePath = `${templatePrefix}/${templateFile}`;
    const destination = path.join("/tmp", `${Date.now()}-${templateFile}`);
    await this.storage.bucket(this.bucketName).file(sourcePath).download({
      destination
    });
    return destination;
  }

  async cleanupTmp(pathsToDelete: string[]): Promise<void> {
    await Promise.all(
      pathsToDelete.map(async (filePath) => {
        try {
          await fs.unlink(filePath);
        } catch {
          // best-effort cleanup for stateless runtime
        }
      })
    );
  }
}
