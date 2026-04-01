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

function getApiBaseUrl(req) {
  if (process.env.PUBLIC_API_URL) {
    return process.env.PUBLIC_API_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
  }
  return `https://${req.headers.host}`.replace(/\/$/, "");
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
        Bennedita
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
    "Bennedita",
  ].join("\n");
}

async function getPdfAttachment({ report, req }) {
  const apiBaseUrl = getApiBaseUrl(req);

  const candidates = [
    report.pdf_url,
    `${apiBaseUrl}/api/reports/pdf?reportId=${encodeURIComponent(report.id)}`,
    `${apiBaseUrl}/api/reports/pdf?id=${encodeURIComponent(report.id)}`,
  ].filter(Boolean);

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "x-internal-api-key": process.env.INTERNAL_API_KEY || "",
        },
      });

      if (!response.ok) continue;

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("pdf")) continue;

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (!buffer.length) continue;

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
    } catch (error) {
      console.error("PDF attachment fetch failed:", url, error?.message || error);
    }
  }

  return null;
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

    const appUrl = getAppUrl();
    const reportUrl = `${appUrl}/report/${report.id}`;

    const subjectBase = report.account_name || report.name || "Cliente";
    const subject = report.period
      ? `Relatório Google Ads — ${subjectBase} — ${report.period}`
      : `Relatório Google Ads — ${subjectBase}`;

    const attachment = await getPdfAttachment({ report, req });

    const emailPayload = {
      from: "Relatórios <relatorios@mail.bennedita.com.br>",
      to: recipients,
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
    };

    if (attachment) {
      emailPayload.attachments = [attachment];
    }

    const emailResponse = await resend.emails.send(emailPayload);

    return res.status(200).json({
      success: true,
      message: attachment
        ? "Email sent successfully with PDF attachment"
        : "Email sent successfully (without PDF attachment)",
      reportId: report.id,
      email: report.email,
      attachmentIncluded: Boolean(attachment),
      response: emailResponse,
    });
  } catch (error) {
    console.error("❌ send-manual ERROR:");
    console.error("message:", error?.message);
    console.error("stack:", error?.stack);
    console.error("full error:", error);

    return res.status(500).json({
      success: false,
      error: "Manual email send failed",
      details: error?.message || "Unknown error",
    });
  }
}
