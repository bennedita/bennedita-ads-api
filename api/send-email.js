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
      landscape: true,
      delay: 8000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error("PDFShift error: " + errorText);
  }

  return Buffer.from(await response.arrayBuffer());
}

function formatFileName(name) {
  return (
    name
      ?.toLowerCase()
      .replace(/\s+/g, "-")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") || "cliente"
  );
}

export default async function handler(req, res) {
  // ✅ CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const body =
      req.method === "POST"
        ? typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body
        : req.query;

    const { reportId } = body;

    console.log("📩 reportId recebido:", reportId);

    if (!reportId) {
      return res.status(400).json({ error: "Missing reportId" });
    }

    // 🔥 BUSCA DADOS
    const rows = await sql`
      SELECT r.*, c.email, c.name as client_name, c.report_slug
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

    const clientName = report.client_name || "Cliente";
    const reportUrl = `${getAppUrl()}/report/${report.report_slug}`;

    console.log("🌐 URL do relatório:", reportUrl);

    // 🔥 PDF
    let attachments = [];

    try {
      const buffer = await generatePdf(reportUrl);
console.log("PDF BUFFER SIZE:", buffer.length);

console.log(
  "PDF HEADER:",
  buffer.toString("utf8", 0, 20)
);
      console.log("📄 PDF gerado com sucesso");

      const base64Pdf = buffer.toString("base64");

     attachments = [
  {
    filename: `relatorio-${formatFileName(clientName)}.pdf`,
    content: base64Pdf,
  },
];

      console.log("📎 Attachment preparado");
    } catch (err) {
      console.error("❌ PDF ERROR:", err.message);
    }

    // 🔥 EMAIL
    const email = await resend.emails.send({
      from: "Relatórios Bennedita <relatorios@mail.bennedita.com.br>",
      to: report.email,
      subject: `Relatório Google Ads - ${clientName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2 style="color:#111;">Relatório de Performance</h2>

          <p>Olá!</p>

          <p>Segue o relatório referente ao período:</p>

          <p><strong>${report.period || "-"}</strong></p>

          <div style="margin: 30px 0;">
            <a href="${reportUrl}"
              style="
                background-color:#2563eb;
                color:#fff;
                padding:14px 24px;
                text-decoration:none;
                border-radius:8px;
                font-weight:bold;
                display:inline-block;
              ">
              Acessar Relatório
            </a>
          </div>

          <p>O PDF segue anexado.</p>

          <br/>

          <p>
            Atenciosamente,<br/>
            Bennedita Marketing Digital
          </p>
        </div>
      `,
      attachments,
    });

    console.log("✅ Email enviado:", email?.id);

    return res.json({
      success: true,
      email,
    });
  } catch (err) {
    console.error("🔥 SEND EMAIL ERROR:", err);

    return res.status(500).json({
      error: err.message,
    });
  }
}
