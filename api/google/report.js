const { GoogleAdsApi } = require("google-ads-api");
const client = new GoogleAdsApi({
  client_id: process.env.GOOGLE_CLIENT_ID,
  client_secret: process.env.GOOGLE_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
});
module.exports = async function handler(req, res) {
  try {
    // endpoint de relatório (ainda sem Google Ads real)
    export default async function handler(req, res) {
  try {
    const refresh_token = process.env.GOOGLE_REFRESH_TOKEN;

    // Você pode passar o customer_id via URL: /api/google/report?customer_id=1234567890
    // ou salvar no Vercel como GOOGLE_CUSTOMER_ID
    const customer_id = String(req.query.customer_id || process.env.GOOGLE_CUSTOMER_ID || "");

    if (!refresh_token) {
      return res.status(500).json({ ok: false, message: "GOOGLE_REFRESH_TOKEN ausente" });
    }

    if (!customer_id) {
      return res.status(400).json({
        ok: false,
        message: "customer_id ausente. Envie ?customer_id=SEU_ID ou defina GOOGLE_CUSTOMER_ID no Vercel.",
      });
    }

    // Cria um "customer" autenticado usando refresh_token
    const customer = client.Customer({
      customer_id,
      refresh_token,
    });

    // Período (padrão: últimos 30 dias). Depois a gente parametriza melhor.
    const dateRange = String(req.query.period || "LAST_30_DAYS");

    // GAQL: busca métricas agregadas
    const gaql = `
      SELECT
        metrics.cost_micros,
        metrics.clicks,
        metrics.conversions
      FROM customer
      WHERE segments.date DURING ${dateRange}
    `;

    const rows = await customer.query(gaql);

    let costMicros = 0;
    let clicks = 0;
    let conversions = 0;

    for (const r of rows) {
      costMicros += Number(r.metrics.cost_micros || 0);
      clicks += Number(r.metrics.clicks || 0);
      conversions += Number(r.metrics.conversions || 0);
    }

    const spend = costMicros / 1_000_000;

    return res.status(200).json({
      ok: true,
      period: dateRange,
      customer_id,
      data: {
        spend,
        clicks,
        conversions,
        currency: "BRL", // depois podemos pegar a moeda real da conta
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
