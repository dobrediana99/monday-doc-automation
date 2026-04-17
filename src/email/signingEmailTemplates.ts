import type { SigningEmailLanguage } from "./signingEmailLocale";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emailWrapper(innerHtml: string): string {
  return `<div style="font-family: Arial, sans-serif; line-height: 1.5;">${innerHtml}</div>`;
}

export function buildSignatureRequestEmail(params: {
  language: SigningEmailLanguage;
  orderNumber: string;
  signingUrl: string;
}): { subject: string; html: string } {
  const safeUrl = escapeHtml(params.signingUrl);

  if (params.language === "ro") {
    return {
      subject: `Solicitare semnare comandă de expediție – ${params.orderNumber}`,
      html: emailWrapper(`
            <p>Bună ziua,</p>
            <p>Vă rugăm să semnați documentul accesibil prin linkul de mai jos, pentru continuarea procesării comenzii de expediție.</p>
            <p>Link semnare:<br /><a href="${safeUrl}">${safeUrl}</a></p>
            <p>După semnare, veți primi automat și documentul semnat.</p>
            <p>Dacă aveți întrebări, vă rugăm să ne contactați.</p>
            <p>Cu stimă,<br />Crystal Logistics Services</p>
          `)
    };
  }

  return {
    subject: `Signature request for shipment order – ${params.orderNumber}`,
    html: emailWrapper(`
            <p>Hello,</p>
            <p>Please sign the document available at the link below in order to proceed with the shipment order.</p>
            <p>Signing link:<br /><a href="${safeUrl}">${safeUrl}</a></p>
            <p>Once the document is signed, you will automatically receive the signed version by email.</p>
            <p>If you have any questions, please contact us.</p>
            <p>Kind regards,<br />Crystal Logistics Services</p>
          `)
  };
}

export function buildSignedDocumentDeliveryEmail(params: {
  language: SigningEmailLanguage;
  orderNumber: string;
}): { subject: string; html: string } {
  if (params.language === "ro") {
    return {
      subject: `Transmitere document semnat – ${params.orderNumber}`,
      html: emailWrapper(`
            <p>Bună ziua,</p>
            <p>Vă transmitem atașat documentul semnat.</p>
            <p>Pentru orice informații suplimentare, vă rugăm să ne contactați.</p>
            <p>Cu stimă,<br />Crystal Logistics Services</p>
          `)
    };
  }

  return {
    subject: `Signed document – ${params.orderNumber}`,
    html: emailWrapper(`
            <p>Hello,</p>
            <p>Please find attached the signed document.</p>
            <p>For any additional information, please feel free to contact us.</p>
            <p>Kind regards,<br />Crystal Logistics Services</p>
          `)
  };
}
