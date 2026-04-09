import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

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

    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    await page.goto(reportUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
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
      stack: process.env.NODE_ENV !== "production" ? error?.stack : undefined,
    });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error("Error closing browser:", closeError);
      }
    }
  }
}
