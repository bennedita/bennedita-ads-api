import chromium from "@sparticuz/chromium";
import { chromium as playwright } from "playwright-core";

export default async function handler(req, res) {
  try {
    const { slug } = req.query;

    if (!slug) {
      return res.status(400).json({
        success: false,
        error: "Missing slug",
      });
    }

    const reportUrl = `https://lead-report-peek.lovable.app/r/${slug}`;

    const browser = await playwright.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();

    await page.goto(reportUrl, {
      waitUntil: "networkidle",
      timeout: 60000,
    });

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

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="relatorio-${slug}.pdf"`
    );

    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error("PDF generation failed:", error);

    return res.status(500).json({
      success: false,
      error: "PDF generation failed",
      details: error?.message || "Unknown error",
    });
  }
}
