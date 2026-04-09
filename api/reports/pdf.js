import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

chromium.setGraphicsMode = false;

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  let browser;

  try {
    const { slug, reportId } = req.query;

    if (!slug && !reportId) {
      return res.status(400).json({
        success: false,
        error: "Missing slug or reportId",
      });
    }

    const baseUrl = "https://lead-report-peek.lovable.app";

    const reportUrl = reportId
      ? `${baseUrl}/report/${reportId}?print=true`
      : `${baseUrl}/r/${slug}?print=true`;

const executablePath = await chromium.executablePath();

browser = await puppeteer.launch({
  args: chromium.args,
  executablePath,
  headless: "new", // 👈 importante
});

    const page = await browser.newPage();

    await page.goto(reportUrl, {
      waitUntil: "networkidle2",
      timeout: 60000,
    });

    // tempo pra renderizar gráfico e dados
    await new Promise((resolve) => setTimeout(resolve, 4000));

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "16px",
        right: "16px",
        bottom: "16px",
        left: "16px",
      },
    });

    const fileName = reportId
      ? `relatorio-${reportId}.pdf`
      : `relatorio-${slug}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);

    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error("PDF generation failed:", error);

    return res.status(500).json({
      success: false,
      error: "PDF generation failed",
      details: error?.message || "Unknown error",
    });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.error("Error closing browser:", e);
      }
    }
  }
}
