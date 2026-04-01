import { Resend } from "resend";
import { neon } from "@neondatabase/serverless";

const resend = new Resend(process.env.RESEND_API_KEY);
const sql = neon(process.env.POSTGRES_URL);

function parseRecipients(rawEmail) {
  if (!rawEmail) return [];
  return String(rawEmail)
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAppUrl() {
  return "https://lead-report-peek.lovable.app";
}

async function generatePdf(report) {
  const reportUrl = `${getAppUrl()}/report/${report.id}`;

  const response = await fetch("https://api.pdfshift.io/v3/convert/pdf", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Basic " +
        Buffer.from("api:" + process.env.PDFSHIFT_API_KEY).toString("base64"),
    },
    body: JSON.stringify({
      source: reportUrl,
      use_print: true,
      delay: 15000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error("PDFShift error: " + errorText);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (!buffer.length) {
    throw new Error("PDF vazio");
  }

  return {
    filename: `relatorio-${report.id}.pdf`,
    content: buffer,
  };
}

export default async function handler(req, res) {
  try {
    const { reportId } =
      req.method === "POST" ? req.body : req.query;

    if (!reportId) {
      return res.status(400).json({ error: "Missing reportId" });
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
      return res.status(404).json({ error: "Report not found" });
    }

    const recipients = parseRecipients(report.email);

    if (!recipients.length) {
      return res.status(400).json({ error: "No email" });
    }

    const reportUrl = `${getAppUrl()}/report/${report.id}`;

    let attachment;
    try {
      attachment = await generatePdf(report);
    } catch (err) {
      console.error("PDF ERROR:", err);
      return res.status(500).json({
        error: "PDF generation failed",
        details: err.message,
      });
    }

    const subject =
      report.account_name
        ? `Relatório Google Ads - ${report.account_name}`
        : `Relatório Google Ads`;

    const email = await resend.emails.send({
      from: "Relatórios <relatorios@mail.bennedita.com.br>",
      to: recipients,
      bcc: process.env.BCC_EMAIL ? [process.env.BCC_EMAIL] : [],
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
          
          <h2 style="margin-bottom: 16px;">
            Relatório de Performance Google Ads
          </h2>

          <p>Olá!</p>

          <p>
            Segue o relatório referente a 
            <strong>${report.period}</strong>.
          </p>

          <p style="margin: 24px 0;">
            <a
              href="${reportUrl}"
              target="_blank"
              style="
                display: inline-block;
                background: #2563eb;
                color: #ffffff;
                text-decoration: none;
                padding: 12px 20px;
                border-radius: 8px;
                font-weight: 600;
              "
            >
              Acessar relatório
            </a>
          </p>

          <p>O PDF consolidado segue anexado neste e-mail.</p>

          <p>Qualquer dúvida, fico à disposição.</p>

          <br/>

          <p>
            Atenciosamente,<br/>
            Vinicius Faria<br/>
            Bennedita Marketing Digital
          </p>

        </div>
      `,
      attachments: [attachment],
    });

    return res.json({
      success: true,
      email,
    });
  } catch (err) {
    console.error("SEND MANUAL ERROR:", err);

    return res.status(500).json({
      error: err.message,
    });
  }
}
