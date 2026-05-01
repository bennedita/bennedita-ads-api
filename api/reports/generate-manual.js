import { neon } from "@neondatabase/serverless";
import { GoogleAdsApi } from "google-ads-api";

const sql = neon(process.env.POSTGRES_URL);

const client = new GoogleAdsApi({
  client_id: process.env.GOOGLE_ADS_CLIENT_ID,
  client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
});

function getDatesBetween(start, end) {
  const dates = [];
  const [y1, m1, d1] = start.split("-").map(Number);
  const [y2, m2, d2] = end.split("-").map(Number);

  const current = new Date(y1, m1 - 1, d1);
  const last = new Date(y2, m2 - 1, d2);

  while (current <= last) {
    const yyyy = current.getFullYear();
    const mm = String(current.getMonth() + 1).padStart(2, "0");
    const dd = String(current.getDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

function n(value) {
  return Number(value || 0);
}

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
      SELECT * FROM clients
      WHERE report_slug = ${slug}
      LIMIT 1
    `;

    if (!clients.length) {
      return res.status(404).json({
        success: false,
        error: "Client not found",
      });
    }

    const dbClient = clients[0];
    const customerId = String(dbClient.google_customer_id || "").replace(/-/g, "");
    const period = `${startDate} até ${endDate}`;

    const customer = client.Customer({
      customer_id: customerId,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
      login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    });

    const campaignRows = await customer.query(`
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

    let deviceRows = [];
    try {
      deviceRows = await customer.query(`
        SELECT
          segments.device,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions
        FROM campaign
        WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      `);
    } catch (err) {
      console.error("DEVICE QUERY ERROR:", err.message);
    }

    let keywordRows = [];
    try {
      keywordRows = await customer.query(`
        SELECT
          ad_group_criterion.keyword.text,
          metrics.impressions,
          metrics.clicks,
          metrics.cost_micros,
          metrics.conversions
        FROM keyword_view
        WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      `);
    } catch (err) {
      console.error("KEYWORD QUERY ERROR:", err.message);
    }

    let impressions = 0;
    let clicks = 0;
    let cost = 0;
    let conversions = 0;

    const campaignsMap = {};
    const chartMap = {};

    for (const row of campaignRows) {
      const date = row.segments.date;
      const name = row.campaign.name;

      const imp = n(row.metrics.impressions);
      const clk = n(row.metrics.clicks);
      const cst = n(row.metrics.cost_micros) / 1_000_000;
      const conv = n(row.metrics.conversions);

      impressions += imp;
      clicks += clk;
      cost += cst;
      conversions += conv;

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

      if (!chartMap[date]) {
        chartMap[date] = {
          date,
          cost: 0,
          conversions: 0,
        };
      }

      chartMap[date].cost += cst;
      chartMap[date].conversions += conv;
    }

    const allDates = getDatesBetween(startDate, endDate);

    const chartData = allDates.map((date) => ({
      date,
      cost: chartMap[date]?.cost || 0,
      conversions: chartMap[date]?.conversions || 0,
    }));

    const campaigns = Object.values(campaignsMap);

    const deviceMap = {};

    for (const row of deviceRows) {
      const device = row.segments.device || "UNKNOWN";
      const cst = n(row.metrics.cost_micros) / 1_000_000;
      const clk = n(row.metrics.clicks);
      const imp = n(row.metrics.impressions);
      const conv = n(row.metrics.conversions);

      if (!deviceMap[device]) {
        deviceMap[device] = {
          device,
          cost: 0,
          clicks: 0,
          impressions: 0,
          conversions: 0,
        };
      }

      deviceMap[device].cost += cst;
      deviceMap[device].clicks += clk;
      deviceMap[device].impressions += imp;
      deviceMap[device].conversions += conv;
    }

    const deviceBreakdown = Object.values(deviceMap);

    const keywordMap = {};

    for (const row of keywordRows) {
      const keyword = row.ad_group_criterion?.keyword?.text || "—";
      const cst = n(row.metrics.cost_micros) / 1_000_000;
      const clk = n(row.metrics.clicks);
      const imp = n(row.metrics.impressions);
      const conv = n(row.metrics.conversions);

      if (!keywordMap[keyword]) {
        keywordMap[keyword] = {
          keyword,
          cost: 0,
          clicks: 0,
          impressions: 0,
          conversions: 0,
        };
      }

      keywordMap[keyword].cost += cst;
      keywordMap[keyword].clicks += clk;
      keywordMap[keyword].impressions += imp;
      keywordMap[keyword].conversions += conv;
    }

    const keywords = Object.values(keywordMap)
      .sort((a, b) => b.conversions - a.conversions || b.clicks - a.clicks)
      .slice(0, 10);

    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? cost / clicks : 0;
    const conversion_rate = clicks > 0 ? (conversions / clicks) * 100 : 0;
    const cpa = conversions > 0 ? cost / conversions : 0;

    const snapshot = {
      account_name: dbClient.name,
      client_name: dbClient.name,
      client_slug: dbClient.report_slug,
      customer_id: customerId,
      period,
      summary: {
        impressions,
        clicks,
        cost,
        conversions,
        ctr,
        cpc,
        cpa,
        conversion_rate,
      },
      campaigns,
      chartData,
      deviceBreakdown,
      device_breakdown: deviceBreakdown,
      topKeywords: keywords,
      keywords,
      insights: [],
      source: "google_ads",
    };

    const existing = await sql`
      SELECT id FROM reports
      WHERE client_id = ${dbClient.id}
      AND period = ${period}
      LIMIT 1
    `;

    let result;

    if (existing.length > 0) {
      result = await sql`
        UPDATE reports
        SET snapshot_json = ${JSON.stringify(snapshot)}::jsonb
        WHERE id = ${existing[0].id}
        RETURNING *
      `;
    } else {
      result = await sql`
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
    }

    return res.json({
      success: true,
      reportId: result[0].id,
      reused: existing.length > 0,
      updated: true,
    });
  } catch (err) {
    console.error("GENERATE MANUAL ERROR:", err);

    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
}
