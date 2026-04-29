import chromium from "@sparticuz/chromium";
import playwright from "playwright-core";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req, res) {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        error: "Missing url",
      });
    }

    const browser = await playwright.chromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();

    await page.goto(url, {
      waitUntil: "networkidle",
    });

    // 👇 IMPORTANTE: força render completo do Lovable
    await page.waitForTimeout(5000);

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
    });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=relatorio.pdf"
    );

    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error("PDF ERROR:", error);

    return res.status(500).json({
      error: error.message,
      stack: error.stack,
    });
  }
}
