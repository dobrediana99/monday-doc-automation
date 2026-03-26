import { google } from "googleapis";

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

  async sendEmail(params: { to: string; subject: string; html: string }): Promise<void> {
    const raw = this.buildRawEmail(params.to, params.subject, params.html);
    await this.gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw
      }
    });
  }

  private buildRawEmail(to: string, subject: string, html: string): string {
    const message = [
      `From: ${this.sender}`,
      `To: ${to}`,
      "Content-Type: text/html; charset=utf-8",
      "MIME-Version: 1.0",
      `Subject: ${subject}`,
      "",
      html
    ].join("\n");

    return Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
}
