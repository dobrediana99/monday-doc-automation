import type { SigningEmailLanguage } from "./signingEmailLocale";
import type { SigningFlowType } from "../utils/mapping";

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

function inviteSubject(params: { language: SigningEmailLanguage; flowType: SigningFlowType }): string {
  if (params.language === "ro") {
    return params.flowType === "client"
      ? "Comanda de Expeditie Crystal Logistics"
      : "Comanda transport Crystal Logistics";
  }
  return params.flowType === "client" ? "Shipping Order Crystal Logistics" : "Transport Order Crystal Logistics";
}

export function buildSignatureRequestEmail(params: {
  language: SigningEmailLanguage;
  flowType: SigningFlowType;
  orderNumber: string;
  signingUrl: string;
}): { subject: string; html: string } {
  const safeUrl = escapeHtml(params.signingUrl);
  const safeOrderRef = escapeHtml(params.orderNumber);

  if (params.language === "ro") {
    return {
      subject: inviteSubject({ language: "ro", flowType: params.flowType }),
      html: emailWrapper(`
            <p>Bună ziua,</p>
            <p>Referință comandă: <strong>${safeOrderRef}</strong>.</p>
            <p>Am atașat comanda în format PDF.</p>
            <p>Pentru un proces mai rapid si mai simplu, documentul poate fi semnat electronic accesand linkul de mai jos. Dupa semnare, veti primi automat o copie a documentului semnat. Linkul este valabil 48 de ore de la primirea acestui email:</p>
            <p><a href="${safeUrl}">${safeUrl}</a></p>
            <p>Daca preferati varianta clasica, va rugam sa ne trimiteti documentul scanat, semnat si stampilat.</p>
            <p>Dacă aveți întrebări, vă rugăm să ne contactați.</p>
            <p>Cu stimă,<br />Crystal Logistics Services</p>
          `)
    };
  }

  return {
    subject: inviteSubject({ language: "en", flowType: params.flowType }),
    html: emailWrapper(`
            <p>Hello,</p>
            <p>Order reference: <strong>${safeOrderRef}</strong>.</p>
            <p>We have attached the order as a PDF.</p>
            <p>For a faster and easier process, the document can be signed electronically using the link below. After signing, you will automatically receive a copy of the signed document. The signing link is valid for 48 hours from receiving this email:</p>
            <p><a href="${safeUrl}">${safeUrl}</a></p>
            <p>If you prefer the traditional method, please send us the scanned, signed and stamped document.</p>
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
