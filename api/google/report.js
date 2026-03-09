import { GoogleAdsApi } from "google-ads-api";

const client = new GoogleAdsApi({
  client_id: process.env.GOOGLE_ADS_CLIENT_ID,
  client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
});

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
    const { customer_id, period } = req.query;

    if (!customer_id) {
      return res.status(400).json({
        success: false,
        error: "Missing customer_id",
      });
    }

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
      WHERE segments.date DURING LAST_30_DAYS
    `);
    const campaignRows = await customer.query(`
      SELECT
        campaign.name,
        metrics.cost_micros,
        metrics.conversions
      FROM campaign
      WHERE segments.date DURING LAST_30_DAYS
    `);
        const dailyRows = await customer.query(`
      SELECT
        segments.date,
        metrics.cost_micros,
        metrics.conversions
      FROM customer
      WHERE segments.date DURING LAST_30_DAYS
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
      WHERE segments.date DURING LAST_30_DAYS
      ORDER BY metrics.clicks DESC
      LIMIT 10
    `);
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
      const leads = Number(row.metrics.conversions || 0);

      if (!campaignMap.has(name)) {
        campaignMap.set(name, {
          name,
          investimento: 0,
          leads: 0,
          cpa: 0,
        });
      }

      const current = campaignMap.get(name);
      current.investimento += investimento;
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
    
    const topKeywords = keywordRows.map((row) => ({
  keyword: row.ad_group_criterion.keyword.text || "",
  clicks: Number(row.metrics.clicks || 0),
  impressions: Number(row.metrics.impressions || 0),
  ctr: Number(row.metrics.ctr || 0) * 100,
  cpc: Number(row.metrics.average_cpc || 0) / 1_000_000,
  spend: Number(row.metrics.cost_micros || 0) / 1_000_000,
  conversions: Number(row.metrics.conversions || 0),
}));
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
insights: [],
source: "google_ads",
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      error: "Google Ads request failed",
      details: err.message,
    });
  }
}
