import { Resend } from "resend";
import chromium from "@sparticuz/chromium";
import { chromium as playwright } from "playwright-core";

const resend = new Resend(process.env.RESEND_API_KEY);

async function generatePdf(url) {
  const browser = await playwright.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  const page = await browser.newPage();

  await page.goto(url, {
    waitUntil: "networkidle",
  });

  await page.waitForTimeout(5000);

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
  });

  await browser.close();

  return pdfBuffer;
}

export default async function handler(req, res) {
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

    let attachments = [];

    if (reportUrl) {
      try {
        const pdfBuffer = await generatePdf(reportUrl + "?print=true");

        attachments.push({
          filename: "relatorio.pdf",
          content: pdfBuffer,
        });
      } catch (err) {
        console.error("Erro ao gerar PDF:", err);
      }
    }

    const response = await resend.emails.send({
      from: "Relatórios Bennedita <relatorios@mail.bennedita.com.br>",
      to,
      subject,
      html,
      attachments,
    });

    return res.status(200).json({ success: true, response });
  } catch (error) {
    console.error("Erro ao enviar email:", error);
    return res.status(400).json({ error: error.message });
  }
}
