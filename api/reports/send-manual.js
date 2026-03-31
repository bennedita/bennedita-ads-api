import { Resend } from "resend";
import { neon } from "@neondatabase/serverless";

const resend = new Resend(process.env.RESEND_API_KEY);
const sql = neon(process.env.POSTGRES_URL);

function getBaseUrl(req) {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return `https://${req.headers.host}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const { reportId } = req.body || {};

    if (!reportId) {
      return res.status(400).json({
        success: false,
        error: "Missing reportId",
      });
    }

    const rows = await sql`
      SELECT r.*, c.email, c.name
      FROM reports r
      JOIN clients c ON r.client_id = c.id
      WHERE r.id = ${reportId}
      LIMIT 1
    `;

    const report = rows?.[0];

    if (!report) {
      return res.status(404).json({ success: false, error: "Report not found" });
    }

    if (!report.email) {
      return res.status(400).json({ success: false, error: "Client has no email" });
    }

    const baseUrl = getBaseUrl(req);

    const reportUrl = `${baseUrl}/report/${report.id}`;

    const emailResponse = await resend.emails.send({
      from: "Relatórios <onboarding@resend.dev>",
      to: [report.email],
      subject: `Relatório Google Ads - ${report.account_name}`,
      html: `
        <p>Olá!</p>
        <p>Seu relatório está pronto:</p>
        <p><a href="${reportUrl}">Acessar relatório</a></p>
      `,
    });

    return res.status(200).json({
      success: true,
      message: "Email sent successfully",
      reportId: report.id,
      email: report.email,
      response: emailResponse,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Manual email send failed",
      details: error?.message || "Unknown error",
    });
  }
}
