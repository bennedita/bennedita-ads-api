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

function buildEmailHtml({ clientName, accountName, period, reportUrl }) {
  const title = accountName || clientName || "Cliente";
  const periodLine = period ? ` referente a <strong>${period}</strong>` : "";

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #111827; line-height: 1.6;">
      <h2 style="margin: 0 0 16px;">Relatório de Performance Google Ads</h2>

      <p>Olá!</p>

      <p>
        Segue o relatório consolidado de Google Ads${periodLine}.
      </p>

      <p>
        Você pode acessar a versão online pelo link abaixo:
      </p>

      <p style="margin: 24px 0;">
        <a
          href="${reportUrl}"
          style="
            display: inline-block;
            background: #2563eb;
            color: #ffffff;
            text-decoration: none;
            padding: 12px 18px;
            border-radius: 8px;
            font-weight: 600;
          "
        >
          Acessar relatório
        </a>
      </p>

      <p>
        O PDF consolidado segue anexado neste e-mail.
      </p>

      <p>
        Qualquer dúvida, fico à disposição.
      </p>

      <p style="margin-top: 24px;">
        Atenciosamente,<br />
        Vinicius Faria<br />
        Bennedita Marketing Digital
      </p>

      <hr style="margin: 32px 0; border: 0; border-top: 1px solid #e5e7eb;" />

      <p style="font-size: 12px; color: #6b7280;">
        Conta: ${title}${period ? `<br />Período: ${period}` : ""}
      </p>
    </div>
  `;
}

function buildEmailText({ period, reportUrl }) {
  return [
    "Olá,",
    "",
    `Segue o relatório consolidado de Google Ads${period ? ` referente a ${period}` : ""}.`,
    "",
    `Acessar relatório: ${reportUrl}`,
    "",
    "O PDF consolidado segue anexado neste e-mail.",
    "",
    "Qualquer dúvida, fico à disposição.",
    "",
    "Atenciosamente,",
    "Vinicius Faria",
    "Bennedita Marketing Digital",
  ].join("\n");
}

// ✅ NOVO: GERA PDF REAL (SEM DEPENDER DE API INTERNA)
async function generatePdf(report) {
  const appUrl = getAppUrl();
  const reportUrl = `${appUrl}/report/${report.id}?print=true`;

  const response = await fetch("https://api.pdfshift.io/v3/convert/pdf", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Basic " +
        Buffer.from("api:" + process.env.PDFSHIFT_API_KEY).toString("base64"),
    },
    body: JSON.stringify({
      url: reportUrl,
      print_background: true,
      delay: 8000,
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

  const safeName =
    (report.account_name || report.name || "relatorio")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "relatorio";

  return {
    filename: `${safeName}.pdf`,
    content: buffer,
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  try {
    const { reportId } =
      req.method === "POST" ? (req.body || {}) : (req.query || {});

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
      return res.status(404).json({
        success: false,
        error: "Report not found",
      });
    }

    const recipients = parseRecipients(report.email);

    if (recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Client has no valid email",
      });
    }

    const reportUrl = `${getAppUrl()}/report/${report.id}`;

    const subjectBase = report.account_name || report.name || "Cliente";
    const subject = report.period
      ? `Relatório Google Ads — ${subjectBase} — ${report.period}`
      : `Relatório Google Ads — ${subjectBase}`;

    // 🚨 GERA PDF OU FALHA (NÃO ENVIA ERRADO)
    let attachment;
    try {
      attachment = await generatePdf(report);
    } catch (error) {
      console.error("❌ PDF FAILED:", error);

      return res.status(500).json({
        success: false,
        error: "PDF generation failed",
        details: error.message,
      });
    }

    const emailResponse = await resend.emails.send({
      from: "Relatórios <relatorios@mail.bennedita.com.br>",
      to: recipients,
      bcc: process.env.BCC_EMAIL,
      subject,
      html: buildEmailHtml({
        clientName: report.name,
        accountName: report.account_name,
        period: report.period,
        reportUrl,
      }),
      text: buildEmailText({
        period: report.period,
        reportUrl,
      }),
      attachments: [attachment],
    });

    return res.status(200).json({
      success: true,
      message: "Email sent successfully with PDF",
      reportId: report.id,
      email: report.email,
      attachmentIncluded: true,
      response: emailResponse,
    });
  } catch (error) {
    console.error("❌ send-manual ERROR:");
    console.error("message:", error?.message);
    console.error("stack:", error?.stack);

    return res.status(500).json({
      success: false,
      error: "Manual email send failed",
      details: error?.message || "Unknown error",
    });
  }
}
