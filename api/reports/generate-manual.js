import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.POSTGRES_URL);

function formatPeriodLabel(startDate, endDate) {
  const [y1, m1, d1] = startDate.split("-");
  const [y2, m2, d2] = endDate.split("-");
  return `${d1}/${m1}/${y1} — ${d2}/${m2}/${y2}`;
}

function getBaseUrl(req) {
  if (process.env.PUBLIC_APP_URL) {
    return process.env.PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
  }
  return `https://${req.headers.host}`.replace(/\/$/, "");
}

async function findExistingReport(clientSlug, periodLabel) {
  const rows = await sql`
    SELECT id, period, created_at
    FROM reports
    WHERE client_slug = ${clientSlug}
      AND period = ${periodLabel}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return rows?.[0] ?? null;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Métodos permitidos
  if (req.method !== "POST" && req.method !== "GET") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  try {
    const { clientId, startDate, endDate } =
      req.method === "POST" ? (req.body || {}) : (req.query || {});

    if (!clientId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: "Missing clientId, startDate or endDate",
      });
    }

    const clientRows = await sql`
      SELECT id, name, email, report_slug, google_customer_id, active
      FROM clients
      WHERE id = ${clientId}
      LIMIT 1
    `;

    const client = clientRows?.[0];

    if (!client) {
      return res.status(404).json({
        success: false,
        error: "Client not found",
      });
    }

    if (!client.report_slug) {
      return res.status(400).json({
        success: false,
        error: "Client missing report_slug",
      });
    }

    const periodLabel = formatPeriodLabel(startDate, endDate);
    const baseUrl = getBaseUrl(req);

    let existingReport = await findExistingReport(
      client.report_slug,
      periodLabel
    );

    if (!existingReport?.id) {
      const googleReportUrl =
        `${baseUrl}/api/google/report` +
        `?slug=${encodeURIComponent(client.report_slug)}` +
        `&period=custom` +
        `&start_date=${encodeURIComponent(startDate)}` +
        `&end_date=${encodeURIComponent(endDate)}`;

      const reportResponse = await fetch(googleReportUrl, {
        method: "GET",
        headers: {
          "x-internal-api-key": process.env.INTERNAL_API_KEY || "",
        },
      });

      if (!reportResponse.ok) {
        const errorText = await reportResponse.text();
        throw new Error(
          `Google report fetch failed (${reportResponse.status}): ${errorText}`
        );
      }

      const reportData = await reportResponse.json();

      if (!reportData || !reportData.data) {
        return res.status(422).json({
          success: false,
          error: "No report data for this period",
        });
      }

      const payload = {
        client_slug: client.report_slug,
        customer_id: client.google_customer_id || client.report_slug,
        account_name: client.name || "Cliente",
        period: periodLabel,
        platforms: "google",
        snapshot_json: reportData,
        summary: reportData?.data ?? null,
        campaigns: reportData?.campaigns ?? [],
        chart_data: reportData?.chartData ?? [],
        topKeywords: reportData?.topKeywords ?? [],
        device_breakdown: reportData?.deviceBreakdown ?? [],
      };

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
        throw new Error(
          `Snapshot save failed (${saveResponse.status}): ${errorText}`
        );
      }

      existingReport = await findExistingReport(
        client.report_slug,
        periodLabel
      );
    }

    if (!existingReport?.id) {
      throw new Error("Report was not created");
    }

    return res.status(200).json({
      success: true,
      message: "Report generated successfully",
      reportId: existingReport.id,
      clientId: client.id,
      clientName: client.name,
      period: periodLabel,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Manual report generation failed",
      details: error?.message || "Unknown error",
    });
  }
}
