import { Resend } from "resend";
import { neon } from "@neondatabase/serverless";

const resend = new Resend(process.env.RESEND_API_KEY);
const sql = neon(process.env.POSTGRES_URL);

function getAppUrl() {
  return "https://lead-report-peek.lovable.app";
}

// 🔥 PDF
async function generatePdf(reportUrl) {
  const response = await fetch("https://api.pdfshift.io/v3/convert/pdf", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Basic " +
        Buffer.from("api:" + process.env.PDFSHIFT_API_KEY).toString("base64"),
    },
    body: JSON.stringify({
      source: reportUrl + "?print=true",
      format: "A4",
      delay: 8000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error("PDFShift error: " + errorText);
  }

  return Buffer.from(await response.arrayBuffer());
}

export default async function handler(req, res) {
  try {
    const { reportId } =
      req.method === "POST" ? req.body : req.query;

    if (!reportId) {
      return res.status(400).json({ error: "Missing reportId" });
    }

    // 🔥 BUSCA DADOS
    const rows = await sql`
      SELECT r.*, c.email, c.name
      FROM reports r
      JOIN clients c ON r.client_id = c.id
      WHERE r.id = ${reportId}
      LIMIT 1
    `;

    const report = rows?.[0];

    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }

    if (!report.email) {
      return res.status(400).json({ error: "Client without email" });
    }

    const reportUrl = `${getAppUrl()}/report/${report.client_slug}`;

    // 🔥 PDF
    let attachment;
    try {
      const buffer = await generatePdf(reportUrl);

      attachment = {
        filename: `relatorio-${report.id}.pdf`,
        content: buffer,
      };
    } catch (err) {
      console.error("PDF ERROR:", err);
    }

    // 🔥 EMAIL
    const email = await resend.emails.send({
      from: "Relatórios Bennedita <relatorios@mail.bennedita.com.br>",
      to: report.email,
      subject: `Relatório Google Ads - ${report.client_name}`,
      html: `
        <h2>Relatório de Performance</h2>
        <p>Olá!</p>
        <p>Segue o relatório referente ao período:</p>
        <p><strong>${report.period}</strong></p>

        <p>
          <a href="${reportUrl}">Acessar relatório</a>
        </p>

        <p>O PDF segue anexado.</p>
      `,
      attachments: attachment ? [attachment] : [],
    });

    return res.json({
      success: true,
      email,
    });
  } catch (err) {
    console.error("SEND EMAIL ERROR:", err);

    return res.status(500).json({
      error: err.message,
    });
  }
}
