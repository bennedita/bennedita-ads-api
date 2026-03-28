import { GoogleAdsApi } from "google-ads-api";
import { neon } from "@neondatabase/serverless";
const client = new GoogleAdsApi({
  client_id: process.env.GOOGLE_ADS_CLIENT_ID,
  client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
});
const sql = neon(process.env.POSTGRES_URL);
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { slug, period, start_date, end_date } = req.query;
    console.log("QUERY:", req.query);
const dateFilter =
  start_date && end_date
    ? `segments.date BETWEEN '${start_date}' AND '${end_date}'`
    : "segments.date DURING LAST_30_DAYS";
if (!slug) {
  return res.status(400).json({
    success: false,
    error: "Missing slug",
  });
}

const clientRow = await sql`
  SELECT google_customer_id
  FROM clients
  WHERE report_slug = ${slug}
  LIMIT 1
`;

if (!clientRow.length) {
  return res.status(404).json({
    success: false,
    error: "Client not found",
  });
}

const customer_id = clientRow[0].google_customer_id;

    const cleanId = String(customer_id).replace(/\D/g, "");

    const customer = client.Customer({
      customer_id: cleanId,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
      login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    });

    const rows = await customer.query(`
      SELECT
        metrics.cost_micros,
        metrics.clicks,
        metrics.impressions,
        metrics.conversions
      FROM customer
      WHERE ${dateFilter}
    `);
    const campaignRows = await customer.query(`
  SELECT
    campaign.name,
    metrics.cost_micros,
    metrics.clicks,
    metrics.conversions
  FROM campaign
  WHERE ${dateFilter}
`);
        const dailyRows = await customer.query(`
      SELECT
        segments.date,
        metrics.cost_micros,
        metrics.conversions
      FROM customer
      WHERE ${dateFilter}
      ORDER BY segments.date
    `);
        const keywordRows = await customer.query(`
      SELECT
        ad_group_criterion.keyword.text,
        metrics.clicks,
        metrics.impressions,
        metrics.ctr,
        metrics.average_cpc,
        metrics.cost_micros,
        metrics.conversions
      FROM keyword_view
      WHERE ${dateFilter}
      ORDER BY metrics.clicks DESC
      LIMIT 10
    `);
    const deviceRows = await customer.query(`
  SELECT
    segments.device,
    metrics.cost_micros,
    metrics.clicks,
    metrics.impressions,
    metrics.conversions
  FROM customer
  WHERE ${dateFilter}
`);
    
  campaigns,
  chartData,
  topKeywords,
  deviceBreakdown,
  insights: [],
  source: "google_ads",
  debugVersion: "device-breakdown-v1",
});
    let spend = 0;
    let clicks = 0;
    let impressions = 0;
    let conversions = 0;

    for (const r of rows) {
      spend += Number(r.metrics.cost_micros || 0) / 1_000_000;
      clicks += Number(r.metrics.clicks || 0);
      impressions += Number(r.metrics.impressions || 0);
      conversions += Number(r.metrics.conversions || 0);
    }
        const campaignMap = new Map();

for (const row of campaignRows) {
  const name = row.campaign.name || "Campanha sem nome";
  const investimento = Number(row.metrics.cost_micros || 0) / 1_000_000;
  const clicks = Number(row.metrics.clicks || 0);
  const leads = Number(row.metrics.conversions || 0);

  if (!campaignMap.has(name)) {
    campaignMap.set(name, {
      name,
      investimento: 0,
      clicks: 0,
      leads: 0,
      cpa: 0,
    });
  }

  const current = campaignMap.get(name);
  current.investimento += investimento;
  current.clicks += clicks;
  current.leads += leads;
}

    const campaigns = Array.from(campaignMap.values())
      .map((campaign) => ({
        ...campaign,
        cpa: campaign.leads > 0 ? campaign.investimento / campaign.leads : 0,
      }))
      .filter((campaign) => campaign.investimento > 0 || campaign.leads > 0)
      .sort((a, b) => {
        if (b.leads !== a.leads) return b.leads - a.leads;
        return b.investimento - a.investimento;
      });
        const chartData = dailyRows.map((row) => ({
      name: row.segments.date,
      investimento: Number(row.metrics.cost_micros || 0) / 1_000_000,
      leads: Number(row.metrics.conversions || 0),
    }));
    
    const keywordMap = new Map();

for (const row of keywordRows) {
  const keyword = row.ad_group_criterion.keyword.text || "Sem keyword";
  const clicks = Number(row.metrics.clicks || 0);
  const impressions = Number(row.metrics.impressions || 0);
  const spend = Number(row.metrics.cost_micros || 0) / 1_000_000;
  const conversions = Number(row.metrics.conversions || 0);

  if (!keywordMap.has(keyword)) {
    keywordMap.set(keyword, {
      keyword,
      clicks: 0,
      impressions: 0,
      spend: 0,
      conversions: 0,
    });
  }

  const current = keywordMap.get(keyword);
  current.clicks += clicks;
  current.impressions += impressions;
  current.spend += spend;
  current.conversions += conversions;
}

const topKeywords = Array.from(keywordMap.values())
  .map((item) => ({
    keyword: item.keyword,
    clicks: item.clicks,
    impressions: item.impressions,
    ctr: item.impressions > 0 ? (item.clicks / item.impressions) * 100 : 0,
    cpc: item.clicks > 0 ? item.spend / item.clicks : 0,
    spend: item.spend,
    conversions: item.conversions,
  }))
  .sort((a, b) => b.conversions - a.conversions || b.clicks - a.clicks)
  .slice(0, 10);
  const deviceMap = new Map();

for (const row of deviceRows) {
  const rawDevice = row.segments.device || "UNKNOWN";
  const device = String(rawDevice).toUpperCase();

  const cost = Number(row.metrics.cost_micros || 0) / 1_000_000;
  const clicks = Number(row.metrics.clicks || 0);
  const impressions = Number(row.metrics.impressions || 0);
  const conversions = Number(row.metrics.conversions || 0);

  if (!deviceMap.has(device)) {
    deviceMap.set(device, {
      device,
      cost: 0,
      clicks: 0,
      impressions: 0,
      conversions: 0,
    });
  }

  const current = deviceMap.get(device);
  current.cost += cost;
  current.clicks += clicks;
  current.impressions += impressions;
  current.conversions += conversions;
}

const deviceBreakdown = Array.from(deviceMap.values())
  .filter((item) => item.cost > 0 || item.clicks > 0 || item.impressions > 0 || item.conversions > 0)
  .sort((a, b) => b.cost - a.cost);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpa = conversions > 0 ? spend / conversions : 0;

    return res.status(200).json({
  period,
  customer_id,
  data: {
    spend,
    clicks,
    impressions,
    conversions,
    ctr,
    cpa,
  },
  campaigns,
  chartData,
  topKeywords,
  deviceBreakdown,
  insights: [],
  source: "google_ads",
      debugVersion: "keywords-v1",
});
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      error: "Google Ads request failed",
      details: err.message,
    });
  }
}
