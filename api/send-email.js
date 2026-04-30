import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// 🔥 Geração de PDF via PDFShift
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
      source: reportUrl + "?print=true", // ✅ garante versão print
      format: "A4",
      print_background: true,
      use_print: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error("PDFShift error: " + errorText);
  }

  return Buffer.from(await response.arrayBuffer());
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { to, subject, html, reportUrl } = req.body;

    if (!to || !subject || !html) {
      return res.status(400).json({
        error: "Missing required fields: to, subject or html",
      });
    }

    let attachments = [];

    // 🔥 Gera PDF se tiver URL
    if (reportUrl) {
      try {
        const pdfBuffer = await generatePdf(reportUrl);

        attachments.push({
          filename: "relatorio.pdf",
          content: pdfBuffer,
        });
      } catch (err) {
        console.error("Erro ao gerar PDF:", err);
      }
    }

    // ✉️ Envio do email
    const response = await resend.emails.send({
      from: "Relatórios Bennedita <relatorios@mail.bennedita.com.br>",
      to,
      subject,
      html,
      attachments,
    });

    return res.status(200).json({
      success: true,
      response,
    });
  } catch (error) {
    console.error("Erro ao enviar email:", error);
    return res.status(500).json({
      error: error.message,
    });
  }
}
