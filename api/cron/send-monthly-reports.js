import { Resend } from "resend";
import { neon } from "@neondatabase/serverless";

const resend = new Resend(process.env.RESEND_API_KEY);
const sql = neon(process.env.POSTGRES_URL);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function handler(req, res) {
  console.log("Running monthly report job");
  console.log("PDFSHIFT loaded:", !!process.env.PDFSHIFT_API_KEY);
  console.log("PDFSHIFT first chars:", process.env.PDFSHIFT_API_KEY?.slice(0, 6));
  console.log("PDFSHIFT length:", process.env.PDFSHIFT_API_KEY?.length);

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({
      success: false,
      error: "Missing RESEND_API_KEY",
    });
  }

  if (!process.env.RESEND_FROM_EMAIL) {
    return res.status(500).json({
      success: false,
      error: "Missing RESEND_FROM_EMAIL",
    });
  }

  if (!process.env.POSTGRES_URL) {
    return res.status(500).json({
      success: false,
      error: "Missing POSTGRES_URL",
    });
  }

  try {
    const clients = await sql`
      SELECT
        id,
        name,
        email,
        report_slug,
        google_customer_id,
        created_at,
        active
      FROM clients
      WHERE active = true
      ORDER BY created_at ASC
    `;

    if (!clients || clients.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No active clients found",
        totalClients: 0,
        sentCount: 0,
        failedCount: 0,
        sent: [],
        failed: [],
      });
    }

    const sent = [];
    const failed = [];

    for (const client of clients) {
      const clientName = client.name;
      const clientEmail = client.email;
      const clientSlug = client.report_slug;

      if (!clientName || !clientEmail || !clientSlug) {
        failed.push({
          client: clientName || "Unknown client",
          email: clientEmail || null,
          report: null,
          error: "Missing required fields: name, email or report_slug",
        });
        continue;
      }

      const reportUrl = `https://lead-report-peek.lovable.app/r/${clientSlug}`;
      console.log("PDFSHIFT env loaded:", !!process.env.PDFSHIFT_API_KEY);
console.log("PDFSHIFT key prefix:", process.env.PDFSHIFT_API_KEY?.slice(0, 8));
console.log("PDFSHIFT key length:", process.env.PDFSHIFT_API_KEY?.length);
const pdfResponse = await fetch("https://api.pdfshift.io/v3/convert/pdf", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization:
      "Basic " + Buffer.from("api:" + process.env.PDFSHIFT_API_KEY).toString("base64"),
  },
  body: JSON.stringify({
  source: reportUrl,
  delay: 4000
})
});

if (!pdfResponse.ok) {
  const errorText = await pdfResponse.text();
  throw new Error("PDFShift error: " + errorText);
}

const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
      console.log(`Sending report to: ${clientName} <${clientEmail}>`);

      try {
        const response = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL,
          to: clientEmail,
          subject: `Relatório Google Ads - ${clientName}`,
          html: `
            <h2>Relatório de Performance Google Ads</h2>
            <p>Olá!</p>
            <p>Seu relatório de performance já está disponível:</p>
            <p>
              <a href="${reportUrl}" target="_blank" rel="noopener noreferrer">
                Acessar relatório
              </a>
            </p>
            <p>Este relatório foi gerado automaticamente pela plataforma Bennedita.</p>
          `,
          attachments: [
  {
    filename: `relatorio-${clientSlug}.pdf`,
    content: pdfBuffer
  }
],
        });

        console.log("Resend response:", response);

        sent.push({
          client: clientName,
          email: clientEmail,
          report: reportUrl,
          response,
        });
      } catch (error) {
        console.error(`Failed to send email for ${clientName}:`, error);

        failed.push({
          client: clientName,
          email: clientEmail,
          report: reportUrl,
          error: error?.message || "Unknown error",
        });
      }

      await sleep(1500);
    }

    return res.status(200).json({
      success: failed.length === 0,
      message:
        failed.length === 0
          ? "All monthly reports sent successfully"
          : "Monthly reports processed with some failures",
      totalClients: clients.length,
      sentCount: sent.length,
      failedCount: failed.length,
      sent,
      failed,
    });
  } catch (error) {
    console.error("Monthly report job failed:", error);

    return res.status(500).json({
      success: false,
      error: "Monthly report job failed",
      details: error?.message || "Unknown error",
    });
  }
}
