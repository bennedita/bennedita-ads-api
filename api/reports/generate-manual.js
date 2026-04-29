import { neon } from "@neondatabase/serverless";
import { GoogleAdsApi } from "google-ads-api";

const sql = neon(process.env.POSTGRES_URL);

const client = new GoogleAdsApi({
  client_id: process.env.GOOGLE_ADS_CLIENT_ID,
  client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
});

export default async function handler(req, res) {
  try {
    const { slug, startDate, endDate } = req.query;

    if (!slug || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: "Missing slug, startDate or endDate",
      });
    }

    const clients = await sql`
      SELECT * FROM clients WHERE report_slug = ${slug} LIMIT 1
    `;

    if (clients.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Client not found",
      });
    }

    const dbClient = clients[0];
    const customerIdClean = dbClient.google_customer_id.replace(/-/g, "");

    const period = `${startDate} até ${endDate}`;

    // ✅ 1. VERIFICAR SE JÁ EXISTE
    const existing = await sql`
      SELECT * FROM reports
      WHERE client_id = ${dbClient.id}
      AND period = ${period}
      LIMIT 1
    `;

    if (existing.length > 0) {
      return res.json({
        success: true,
        reportId: existing[0].id,
        reused: true,
      });
    }

    const customer = client.Customer({
      customer_id: customerIdClean,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
      login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    });

    // 🔥 GOOGLE ADS
    let rows = [];

    try {
      rows = await customer.query(`
        SELECT
          campaign.name,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions
        FROM campaign
        WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      `);
    } catch (error) {
      return res.status(500).json({
        success: false,
        step: "google_ads",
        error: error.message,
      });
    }

    let impressions = 0;
    let clicks = 0;
    let cost = 0;
    let conversions = 0;

    const campaigns = rows.map((row) => {
      const imp = Number(row.metrics.impressions || 0);
      const clk = Number(row.metrics.clicks || 0);
      const cst = Number(row.metrics.cost_micros || 0) / 1_000_000;
      const conv = Number(row.metrics.conversions || 0);

      impressions += imp;
      clicks += clk;
      cost += cst;
      conversions += conv;

      return {
        name: row.campaign.name,
        impressions: imp,
        clicks: clk,
        cost: cst,
        conversions: conv,
      };
    });

    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? cost / clicks : 0;
    const conversion_rate = clicks > 0 ? (conversions / clicks) * 100 : 0;

    const chartData = campaigns.map((c) => ({
      name: c.name,
      impressions: c.impressions,
      clicks: c.clicks,
    }));

    const snapshot = {
      summary: {
        impressions,
        clicks,
        cost,
        conversions,
        ctr,
        cpc,
        conversion_rate,
      },
      campaigns,
      chartData,
      insights: [],
      source: "google_ads",
    };

    const result = await sql`
      INSERT INTO reports (
        client_id,
        period,
        snapshot_json,
        status,
        created_at
      )
      VALUES (
        ${dbClient.id},
        ${period},
        ${JSON.stringify(snapshot)}::jsonb,
        'generated',
        NOW()
      )
      RETURNING *
    `;

    return res.json({
      success: true,
      reportId: result[0].id,
      reused: false,
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}
