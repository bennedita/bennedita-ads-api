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
    const customerIdClean = String(dbClient.google_customer_id).replace(/-/g, "");
    const period = `${startDate} até ${endDate}`;

    const customer = client.Customer({
      customer_id: customerIdClean,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
      login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    });

    // =========================
    // 🔥 QUERY COM DATA
    // =========================
    const rows = await customer.query(`
      SELECT
        segments.date,
        campaign.name,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM campaign
      WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
    `);

    let impressions = 0;
    let clicks = 0;
    let cost = 0;
    let conversions = 0;

    const campaignsMap = {};
    const chartMap = {};

    rows.forEach((row) => {
      const date = row.segments.date;
      const name = row.campaign.name;

      const imp = Number(row.metrics.impressions || 0);
      const clk = Number(row.metrics.clicks || 0);
      const cst = Number(row.metrics.cost_micros || 0) / 1_000_000;
      const conv = Number(row.metrics.conversions || 0);

      impressions += imp;
      clicks += clk;
      cost += cst;
      conversions += conv;

      // campanhas (agrupado)
      if (!campaignsMap[name]) {
        campaignsMap[name] = {
          name,
          impressions: 0,
          clicks: 0,
          cost: 0,
          conversions: 0,
        };
      }

      campaignsMap[name].impressions += imp;
      campaignsMap[name].clicks += clk;
      campaignsMap[name].cost += cst;
      campaignsMap[name].conversions += conv;

      // chart por data
      if (!chartMap[date]) {
        chartMap[date] = {
          date,
          cost: 0,
          conversions: 0,
        };
      }

      chartMap[date].cost += cst;
      chartMap[date].conversions += conv;
    });

    const campaigns = Object.values(campaignsMap);

    const chartData = Object.values(chartMap).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? cost / clicks : 0;
    const conversion_rate = clicks > 0 ? (conversions / clicks) * 100 : 0;

    const accountName = dbClient.name || "Cliente";

    const snapshot = {
      account_name: accountName,
      client_name: accountName,
      client_slug: dbClient.report_slug,
      customer_id: customerIdClean,
      period,
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

    // =========================
    // UPSERT
    // =========================
    const existing = await sql`
      SELECT id FROM reports
      WHERE client_id = ${dbClient.id}
      AND period = ${period}
      LIMIT 1
    `;

    if (existing.length > 0) {
      const updated = await sql`
        UPDATE reports
        SET snapshot_json = ${JSON.stringify(snapshot)}::jsonb,
            summary = ${JSON.stringify(snapshot.summary)}::jsonb,
            campaigns = ${JSON.stringify(campaigns)}::jsonb,
            chart_data = ${JSON.stringify(chartData)}::jsonb,
            account_name = ${accountName},
            status = 'generated'
        WHERE id = ${existing[0].id}
        RETURNING *
      `;

      return res.json({
        success: true,
        reportId: updated[0].id,
        reused: true,
        updated: true,
      });
    }

    const result = await sql`
      INSERT INTO reports (
        client_id,
        period,
        snapshot_json,
        summary,
        campaigns,
        chart_data,
        account_name,
        status,
        created_at
      )
      VALUES (
        ${dbClient.id},
        ${period},
        ${JSON.stringify(snapshot)}::jsonb,
        ${JSON.stringify(snapshot.summary)}::jsonb,
        ${JSON.stringify(campaigns)}::jsonb,
        ${JSON.stringify(chartData)}::jsonb,
        ${accountName},
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
