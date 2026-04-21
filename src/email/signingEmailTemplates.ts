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

function renderPlainTextEmailBody(params: { text: string }): string {
  return emailWrapper(`<div style="white-space: pre-wrap;">${escapeHtml(params.text)}</div>`);
}

function inviteSubject(params: { language: SigningEmailLanguage; flowType: SigningFlowType }): string {
  if (params.language === "ro") {
    return params.flowType === "client"
      ? "Comanda de Expeditie Crystal Logistics"
      : "Comanda transport Crystal Logistics";
  }
  return params.flowType === "client" ? "Shipping Order Crystal Logistics" : "Transport Order Crystal Logistics";
}

function inviteSubjectWithOrderRef(params: {
  language: SigningEmailLanguage;
  flowType: SigningFlowType;
  orderReference: string;
}): string {
  const base = inviteSubject({ language: params.language, flowType: params.flowType });
  return `${base} - ${params.orderReference}`;
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
    if (params.flowType === "transportator") {
      const transporterRoBody = `Buna ziua,


am atasat comanda de transport, am rugamintea sa mi-o trimiteti scanata, semnata si stampilata alaturi de asigurarea CMR,


Pentru un proces mai rapid si mai simplu, documentul poate fi semnat electronic accesand linkul de mai jos. Dupa semnare, veti primi automat o copie a documentului semnat. Linkul este valabil 48 de ore de la primirea acestui email:

${params.signingUrl}


Atentie!
Furnizorii nu accepta descarcarea marfurilor din camioane dupa ce s-a primit acceptul soferului de incarcare iar casa de expeditie nu accepta noul pret impus avand deja marfa in camion. In cazul neatentionarii in scris si incarcarii fara acord, transportatorul isi asuma reducerea costului impus de catre casa de expeditie in cazul in care se incarca mai putina marfa si mentinerea pretului in cazul in care se incarca mai multa marfa.`;

      return {
        subject: inviteSubjectWithOrderRef({
          language: "ro",
          flowType: "transportator",
          orderReference: params.orderNumber
        }),
        html: renderPlainTextEmailBody({ text: transporterRoBody })
      };
    }

    const signingBlock = `
            <p>Pentru un proces mai rapid si mai simplu, documentul poate fi semnat electronic accesand linkul de mai jos. Dupa semnare, veti primi automat o copie a documentului semnat. Linkul este valabil 48 de ore de la primirea acestui email:</p>
            <p><a href="${safeUrl}">${safeUrl}</a></p>
          `;

    return {
      subject: inviteSubjectWithOrderRef({
        language: "ro",
        flowType: params.flowType,
        orderReference: params.orderNumber
      }),
      html: emailWrapper(`
            <p>Buna ziua,</p>
            ${
              params.flowType === "client"
                ? `
            <p>am atasat comanda de expeditie,</p>
            <p>am rugamintea sa mi-o trimiteti scanata, semnata si stampilata.</p>
          `
                : `
            <p>am atasat comanda de transport, am rugamintea sa mi-o trimiteti scanata, semnata si stampilata alaturi de asigurarea CMR.</p>
            <br />
          `
            }
            ${signingBlock}
            ${
              params.flowType === "client"
                ? `
            <p>multumim ca ati ales sa lucrati cu Crystal Logistics,</p>
            <p>O zi frumoasa!</p>
            <br />
            <p>In cazul in care marfa transportata se incadreaza intr-una din categoriile bunurilor cu risc fiscal ridicat (BRFR), beneficiarul (importatorul) are obligatia de a ne furniza in timp util codurile UIT necesare pentru toate segmentele transporturilor nationale aferente, pentru a putea fi trecute pe CMR-uri +avize de livrare (POD). Nerespectarea acestei reglementari in timp util poate produce intarzieri, penalitati si amenzi care vor fi suportate integral de catre client. Prezenta comanda a fost expediata in urma acceptarii ofertei iar noi deja am demarat organizarea serviciului de transport. In cazul in care nu se trimite refuzul scris in maximum o ora de la trimiterea acestei comenzi, comanda se considera acceptata integral.</p>
          `
                : `
            <br />
            <p>Atentie!</p>
            <p>Furnizorii nu accepta descarcarea marfurilor din camioane dupa ce s-a primit acceptul soferului de incarcare iar casa de expeditie nu accepta noul pret impus avand deja marfa in camion. In cazul neatentionarii in scris si incarcarii fara acord, transportatorul isi asuma reducerea costului impus de catre casa de expeditie in cazul in care se incarca mai putina marfa si mentinerea pretului in cazul in care se incarca mai multa marfa.</p>
          `
            }
          `)
    };
  }

  if (params.flowType === "transportator") {
    const transporterEnBody = `Hello,

Please find the transport order attached. Kindly send it back to us scanned, signed and stamped, together with the CMR insurance.

For a faster and easier process, the document can also be signed electronically using the link below. After signing, you will automatically receive a copy of the signed document. The signing link is valid for 48 hours from receiving this email:

${params.signingUrl}

Attention!
Suppliers do not accept unloading of goods from trucks after the driver's loading acceptance has been received, and the forwarding company does not accept a newly imposed price once the goods are already loaded in the truck. If no written notice is given and loading takes place without agreement, the carrier accepts the reduced cost imposed by the forwarding company if less goods are loaded, and the original price remains unchanged if more goods are loaded.`;

    return {
      subject: inviteSubjectWithOrderRef({
        language: "en",
        flowType: "transportator",
        orderReference: params.orderNumber
      }),
      html: renderPlainTextEmailBody({ text: transporterEnBody })
    };
  }

  const signingBlock = `
            <p>For a faster and easier process, the document can also be signed electronically using the link below. After signing, you will automatically receive a copy of the signed document. The signing link is valid for 48 hours from receiving this email:</p>
            <p><a href="${safeUrl}">${safeUrl}</a></p>
          `;

  return {
    subject: inviteSubjectWithOrderRef({
      language: "en",
      flowType: params.flowType,
      orderReference: params.orderNumber
    }),
    html: emailWrapper(`
            <p>Hello,</p>
            <br />
            ${
              params.flowType === "client"
                ? `
            <p>Please find the shipping order attached.</p>
            <p>Kindly send it back to us scanned, signed and stamped.</p>
          `
                : `
            <p>Please find the transport order attached. Kindly send it back to us scanned, signed and stamped, together with the CMR insurance.</p>
            <br />
          `
            }
            <br />
            ${signingBlock}
            <br />
            ${
              params.flowType === "client"
                ? `
            <p>Thank you for choosing to work with Crystal Logistics.</p>
            <br />
            <p>Have a nice day!</p>
            <br />
            <p>If the transported goods fall within one of the categories of high fiscal risk goods, the beneficiary (importer) is required to provide us in due time with the UIT codes necessary for all related national transport segments, so they can be included on the CMRs and delivery notes (POD). Failure to comply with this requirement in due time may cause delays, penalties and fines, which will be borne entirely by the client. This order was sent following acceptance of the offer, and we have already started organizing the transport service. If no written refusal is sent within one hour from the sending of this order, the order is considered fully accepted.</p>
          `
                : `
            <p>Attention!</p>
            <p>Suppliers do not accept unloading of goods from trucks after the driver's loading acceptance has been received, and the forwarding company does not accept the newly imposed price as the goods are already loaded in the truck. In case no written notice is given and loading takes place without agreement, the carrier assumes the cost reduction imposed by the forwarding company if less goods are loaded, and maintains the price if more goods are loaded.</p>
          `
            }
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
