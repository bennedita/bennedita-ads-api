import { Resend } from "resend";
import { neon } from "@neondatabase/serverless";

const resend = new Resend(process.env.RESEND_API_KEY);
const sql = neon(process.env.POSTGRES_URL);
const TEST_EMAIL = process.env.TEST_EMAIL || "viniciusfariabsb@gmail.com";
const TEST_MODE = process.env.TEST_MODE === "true";
const BCC_EMAIL = process.env.BCC_EMAIL || "viniciusfariabsb@gmail.com";
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBaseUrl(req) {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
  }
  const host = req.headers.host;
  return `https://${host}`.replace(/\/$/, "");
}

function getLastMonthPeriod() {
  const now = new Date();

  const firstDayCurrentMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );

  const lastDayPreviousMonth = new Date(
    firstDayCurrentMonth.getTime() - 24 * 60 * 60 * 1000
  );

  const firstDayPreviousMonth = new Date(
    Date.UTC(
      lastDayPreviousMonth.getUTCFullYear(),
      lastDayPreviousMonth.getUTCMonth(),
      1
    )
  );

  const startDay = String(firstDayPreviousMonth.getUTCDate()).padStart(2, "0");
  const endDay = String(lastDayPreviousMonth.getUTCDate()).padStart(2, "0");
  const month = String(lastDayPreviousMonth.getUTCMonth() + 1).padStart(2, "0");
  const year = String(lastDayPreviousMonth.getUTCFullYear());

  return {
    startDate: `${year}-${month}-${startDay}`,
    endDate: `${year}-${month}-${endDay}`,
    periodLabel: `${startDay}/${month}/${year} — ${endDay}/${month}/${year}`,
  };
}

function parseRecipients(rawEmail) {
  if (!rawEmail) return [];
  return String(rawEmail)
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function findExistingReport(clientSlug, periodLabel) {
  const rows = await sql`
    SELECT id, snapshot_json, created_at
    FROM reports
    WHERE client_slug = ${clientSlug}
      AND period = ${periodLabel}
    ORDER BY created_at DESC
    LIMIT 1
  `;

  return rows?.[0] ?? null;
}

async function generateAndSaveSnapshot({
  req,
  clientSlug,
  clientName,
  customerId,
  periodLabel,
  startDate,
  endDate,
  baseUrl,
}) {
  const googleReportUrl =
    `${baseUrl}/api/google/report` +
    `?slug=${encodeURIComponent(clientSlug)}` +
    `&period=custom` +
    `&start_date=${encodeURIComponent(startDate)}` +
    `&end_date=${encodeURIComponent(endDate)}`;

  console.log("Generating Google report:", {
    clientSlug,
    googleReportUrl,
  });

  const reportResponse = await fetch(googleReportUrl, {
    method: "GET",
    headers: {
      "x-internal-api-key": process.env.INTERNAL_API_KEY || "",
    },
  });

  if (!reportResponse.ok) {
    const errorText = await reportResponse.text();
    throw new Error(`Google report fetch failed (${reportResponse.status}): ${errorText}`);
  }

  const reportData = await reportResponse.json();

if (!reportData || !reportData.data) {
  throw new Error("Empty report data from Google API");
}

  const payload = {
    client_slug: clientSlug,
    customer_id: customerId || clientSlug,
    account_name: clientName || "Cliente",
    period: periodLabel,
    platforms: "google",
    snapshot_json: reportData,
    summary: reportData?.data ?? null,
    campaigns: reportData?.campaigns ?? [],
    chart_data: reportData?.chartData ?? reportData?.chart_data ?? [],
    topKeywords: reportData?.topKeywords ?? reportData?.top_keywords ?? [],
    device_breakdown:
      reportData?.deviceBreakdown ??
      reportData?.device_breakdown ??
      [],
  };

  console.log("Saving generated snapshot:", {
    clientSlug,
    periodLabel,
    hasSummary: !!payload.summary,
    campaigns: payload.campaigns.length,
    chartData: payload.chart_data.length,
    topKeywords: payload.topKeywords.length,
  });

  const saveResponse = await fetch(`${baseUrl}/api/reports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-api-key": process.env.INTERNAL_API_KEY || "",
    },
    body: JSON.stringify(payload),
  });

  if (!saveResponse.ok) {
    const errorText = await saveResponse.text();
    throw new Error(`Snapshot save failed (${saveResponse.status}): ${errorText}`);
  }

  const saveJson = await saveResponse.json();
  console.log("Snapshot save response:", saveJson);

  return saveJson;
}

export default async function handler(req, res) {
  console.log("Running monthly report job");

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({
      success: false,
      error: "Missing RESEND_API_KEY",
    });
  }

  if (!process.env.RESEND_FROM_EMAIL) {
    return res.status(500).json({
      success: false,
      error: "Missing RESEND_FROM_EMAIL",
    });
  }

  if (!process.env.POSTGRES_URL) {
    return res.status(500).json({
      success: false,
      error: "Missing POSTGRES_URL",
    });
  }

  if (!process.env.PDFSHIFT_API_KEY) {
    return res.status(500).json({
      success: false,
      error: "Missing PDFSHIFT_API_KEY",
    });
  }

  const baseUrl = "https://lead-report-peek.lovable.app";
  let startDate, endDate, periodLabel;

if (req.query.period) {
  periodLabel = req.query.period;

  // converter "01/01/2026 — 31/01/2026" → datas
  const [start, end] = periodLabel.split(" — ");
  
  const [d1, m1, y1] = start.split("/");
  const [d2, m2, y2] = end.split("/");

  startDate = `${y1}-${m1}-${d1}`;
  endDate = `${y2}-${m2}-${d2}`;
} else {
  const period = getLastMonthPeriod();
  startDate = period.startDate;
  endDate = period.endDate;
  periodLabel = period.periodLabel;
}

  console.log("Base URL:", baseUrl);
  console.log("Period:", { startDate, endDate, periodLabel });
  console.log("PDFSHIFT loaded:", !!process.env.PDFSHIFT_API_KEY);
  console.log("PDFSHIFT first chars:", process.env.PDFSHIFT_API_KEY?.slice(0, 6));
  console.log("PDFSHIFT length:", process.env.PDFSHIFT_API_KEY?.length);

  try {
    const clients = await sql`
      SELECT
        id,
        name,
        email,
        report_slug,
        google_customer_id,
        created_at,
        active
      FROM clients
      WHERE active = true
      ORDER BY created_at ASC
    `;

    if (!clients || clients.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No active clients found",
        totalClients: 0,
        sentCount: 0,
        failedCount: 0,
        sent: [],
        failed: [],
      });
    }

    const sent = [];
    const failed = [];

    for (const client of clients) {
      try {
      const clientName = client.name;
      const clientEmail = client.email;
      const clientSlug = client.report_slug;
      const customerId = client.google_customer_id;
console.log("CRON DEBUG", {
  clientName,
  clientEmail,
  clientSlug,
  customerId,
  periodLabel,
});
      console.log("Processing client:", {
        clientName,
        clientEmail,
        clientSlug,
        customerId,
      });

      if (!clientName || !clientEmail || !clientSlug) {
        failed.push({
          client: clientName || "Unknown client",
          email: clientEmail || null,
          report: null,
          error: "Missing required fields: name, email or report_slug",
        });
        continue;
      }

      const recipients = parseRecipients(clientEmail);
      const finalRecipients = TEST_MODE ? [TEST_EMAIL] : recipients;
const forceResend = req.query.force === "true";

const alreadySent = await sql`
  SELECT id
  FROM reports
  WHERE client_slug = ${clientSlug}
    AND period = ${periodLabel}
    AND sent = true
  LIMIT 1
`;

if (!forceResend && alreadySent.length > 0) {
  console.log(`Skipping already sent report for ${clientName}`);
  continue;
}

if (forceResend && alreadySent.length > 0) {
  console.log(`Force resend enabled for ${clientName}`);
}
      if (recipients.length === 0) {
        failed.push({
          client: clientName,
          email: clientEmail || null,
          report: null,
          error: "No valid recipient emails found",
        });
        continue;
      }

        let existingReport = await findExistingReport(clientSlug, periodLabel);

        if (!existingReport?.id) {
          console.log("No snapshot found, generating automatically:", {
            clientSlug,
            periodLabel,
          });

          await generateAndSaveSnapshot({
            req,
            clientSlug,
            clientName,
            customerId,
            periodLabel,
            startDate,
            endDate,
            baseUrl,
          });

          existingReport = await findExistingReport(clientSlug, periodLabel);
        }

        if (!existingReport?.id) {
          throw new Error(`No snapshot found or created for ${periodLabel}`);
        }

        const reportUrl = `${baseUrl}/report/${existingReport.id}?start_date=${startDate}&end_date=${endDate}`;

        console.log("Generating PDF from:", reportUrl);

        const pdfResponse = await fetch("https://api.pdfshift.io/v3/convert/pdf", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization:
              "Basic " +
              Buffer.from("api:" + process.env.PDFSHIFT_API_KEY).toString("base64"),
          },
          body: JSON.stringify({
            source: reportUrl,
            delay: 4000,
          }),
        });

        if (!pdfResponse.ok) {
          const errorText = await pdfResponse.text();
          throw new Error("PDFShift error: " + errorText);
        }

        const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

        console.log(`Sending report to: ${clientName} <${finalRecipients.join(", ")}>`);

        const response = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL,
          to: finalRecipients,
          bcc: [BCC_EMAIL],
          subject: `Relatório Google Ads - ${clientName}`,
          html: `
            <h2>Relatório de Performance Google Ads</h2>
            <p>Olá!</p>
            <p>Seu relatório de performance já está disponível:</p>
            <p>
              <a href="${reportUrl}" target="_blank" rel="noopener noreferrer">
                Acessar relatório
              </a>
            </p>
            <p>Este relatório foi gerado automaticamente pela plataforma Bennedita.</p>
          `,
          attachments: [
            {
              filename: `relatorio-${clientSlug}.pdf`,
              content: pdfBuffer,
            },
          ],
        });

        console.log("Resend response:", response);
await sql`
  UPDATE reports
  SET sent = true
  WHERE id = ${existingReport.id}
`;
        sent.push({
          client: clientName,
          email: finalRecipients,
          report: reportUrl,
          response,
        });
      } catch (error) {
  console.error(`❌ Error processing client:`, client.name, error);

  failed.push({
    client: client.name || "Unknown client",
    email: client.email || null,
    report: null,
    error: error?.message || "Unknown error",
  });

  continue;
}

      await sleep(1500);
    }

    return res.status(200).json({
      success: failed.length === 0,
      message:
        failed.length === 0
          ? "All monthly reports sent successfully"
          : "Monthly reports processed with some failures",
      totalClients: clients.length,
      sentCount: sent.length,
      failedCount: failed.length,
      period: periodLabel,
      sent,
      failed,
    });
  } catch (error) {
    console.error("Monthly report job failed:", error);

    return res.status(500).json({
      success: false,
      error: "Monthly report job failed",
      details: error?.message || "Unknown error",
    });
  }
}
