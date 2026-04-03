import { Storage } from "@google-cloud/storage";
import path from "node:path";
import { promises as fs } from "node:fs";

export class GcsService {
  private readonly storage: Storage;

  constructor(private readonly bucketName: string) {
    this.storage = new Storage();
  }

  async downloadTemplateToTmp(objectName: string): Promise<string> {
    console.info(
      JSON.stringify({
        event: "gcs_template_download_start",
        bucket: this.bucketName,
        objectName,
        gsUri: `gs://${this.bucketName}/${objectName}`
      })
    );
    const destination = path.join("/tmp", `${Date.now()}-${objectName}`);
    await this.storage.bucket(this.bucketName).file(objectName).download({
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
