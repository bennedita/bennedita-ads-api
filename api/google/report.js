import { GoogleAdsApi } from "google-ads-api";

const client = new GoogleAdsApi({
  client_id: process.env.GOOGLE_CLIENT_ID,
  client_secret: process.env.GOOGLE_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
});

export default async function handler(req, res) {
  try {
    const refresh_token = process.env.GOOGLE_REFRESH_TOKEN;

    const customer_id = String(
      req.query.customer_id || process.env.GOOGLE_CUSTOMER_ID || ""
    );

    if (!refresh_token) {
      return res.status(500).json({
        ok: false,
        message: "GOOGLE_REFRESH_TOKEN ausente",
      });
    }

    if (!customer_id) {
      return res.status(400).json({
        ok: false,
        message:
          "customer_id ausente. Envie ?customer_id=SEU_ID ou defina GOOGLE_CUSTOMER_ID no Vercel.",
      });
    }
// DEBUG TEMPORÁRIO
const clientId = process.env.GOOGLE_CLIENT_ID || "";
const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || "";

console.log("[DEBUG OAUTH] clientId_last10:", clientId.slice(-10));
console.log("[DEBUG OAUTH] clientSecret_len:", clientSecret.length);
console.log("[DEBUG OAUTH] refreshToken_len:", refreshToken.length);
console.log("[DEBUG OAUTH] refreshToken_has_newline:", /\r|\n/.test(refreshToken));
console.log("[DEBUG OAUTH] refreshToken_starts:", refreshToken.slice(0, 4));
    const customer = client.Customer({
      customer_id,
      refresh_token,
    });

    const dateRange = String(req.query.period || "LAST_30_DAYS");

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
        currency: "BRL",
      },
    });

  } catch (err) {
    console.error("ERRO COMPLETO:", err);

    return res.status(500).json({
      ok: false,
      message: err.message || "Erro desconhecido",
      details: err?.response?.data || err,
    });
  }
}
