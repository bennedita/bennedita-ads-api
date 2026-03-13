import { Resend } from "resend";
import { neon } from "@neondatabase/serverless";

const resend = new Resend(process.env.RESEND_API_KEY);
const sql = neon(process.env.POSTGRES_URL);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function handler(req, res) {
  console.log("Running monthly report job");

  try {
    const clients = await sql`
      SELECT
        id,
        name,
        email,
        report_slug,
        google_customer_id,
        created_at
      FROM clients
      WHERE active IS TRUE
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

      if (!clientEmail || !clientSlug) {
        failed.push({
          client: clientName || "Unknown client",
          email: clientEmail || null,
          report: null,
          error: "Missing email or report_slug in database",
        });
        continue;
      }

      const reportUrl = `https://lead-report-peek.lovable.app/r/${clientSlug}`;

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
