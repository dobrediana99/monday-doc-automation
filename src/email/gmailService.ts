import { google } from "googleapis";

function wrapBase64Lines(b64: string): string {
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) {
    lines.push(b64.slice(i, i + 76));
  }
  return lines.join("\r\n");
}

function encodeRfc2047Subject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) {
    return subject;
  }
  const b64 = Buffer.from(subject, "utf8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

export class GmailService {
  private readonly gmail;
  private readonly sender: string;

  constructor(config: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    refreshToken: string;
    sender: string;
  }) {
    const oauth2Client = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );

    oauth2Client.setCredentials({ refresh_token: config.refreshToken });
    this.gmail = google.gmail({ version: "v1", auth: oauth2Client });
    this.sender = config.sender;
  }

  async sendEmail(params: {
    to: string;
    from?: string;
    subject: string;
    html: string;
    cc?: string[];
    pdfAttachment?: { bytes: Buffer; fileName: string };
  }): Promise<void> {
    const raw = params.pdfAttachment
      ? this.buildRawMultipartHtmlWithOptionalPdf({
          to: params.to,
          from: params.from,
          subject: params.subject,
          html: params.html,
          cc: params.cc,
          pdfBytes: params.pdfAttachment.bytes,
          attachmentFileName: params.pdfAttachment.fileName
        })
      : this.buildRawEmail(params.to, params.from, params.subject, params.html, params.cc);
    await this.gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw
      }
    });
  }

  async sendEmailWithPdfAttachment(params: {
    to: string;
    from?: string;
    subject: string;
    html: string;
    pdfBytes: Buffer;
    attachmentFileName: string;
    cc?: string[];
  }): Promise<void> {
    const raw = this.buildRawMultipartWithPdf(params);
    await this.gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw
      }
    });
  }

  private buildRawEmail(to: string, from: string | undefined, subject: string, html: string, cc?: string[]): string {
    const fromHeader = from?.trim().length ? from.trim() : this.sender;
    const headers: string[] = [`From: ${fromHeader}`, `To: ${to}`];
    if (cc && cc.length > 0) {
      headers.push(`Cc: ${cc.join(", ")}`);
    }
    const message = [
      ...headers,
      "Content-Type: text/html; charset=utf-8",
      "MIME-Version: 1.0",
      `Subject: ${encodeRfc2047Subject(subject)}`,
      "",
      html
    ].join("\n");

    return Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  private buildRawMultipartWithPdf(params: {
    to: string;
    from?: string;
    subject: string;
    html: string;
    pdfBytes: Buffer;
    attachmentFileName: string;
    cc?: string[];
  }): string {
    const boundary = `mixed_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const safeName = params.attachmentFileName.replace(/[\r\n"]/g, "_");
    const htmlB64 = Buffer.from(params.html, "utf8").toString("base64");
    const pdfB64 = params.pdfBytes.toString("base64");

    const fromHeader = params.from?.trim().length ? params.from.trim() : this.sender;
    const headers: string[] = [`From: ${fromHeader}`, `To: ${params.to}`];
    if (params.cc && params.cc.length > 0) {
      headers.push(`Cc: ${params.cc.join(", ")}`);
    }

    const message = [
      ...headers,
      "MIME-Version: 1.0",
      `Subject: ${encodeRfc2047Subject(params.subject)}`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64Lines(htmlB64),
      "",
      `--${boundary}`,
      "Content-Type: application/pdf",
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${safeName}"`,
      "",
      wrapBase64Lines(pdfB64),
      "",
      `--${boundary}--`,
      ""
    ].join("\r\n");

    return Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  private buildRawMultipartHtmlWithOptionalPdf(params: {
    to: string;
    from?: string;
    subject: string;
    html: string;
    pdfBytes: Buffer;
    attachmentFileName: string;
    cc?: string[];
  }): string {
    return this.buildRawMultipartWithPdf({
      to: params.to,
      from: params.from,
      subject: params.subject,
      html: params.html,
      pdfBytes: params.pdfBytes,
      attachmentFileName: params.attachmentFileName,
      cc: params.cc
    });
  }
}
