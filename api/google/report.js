import { GoogleAdsApi } from "google-ads-api";

export default async function handler(req, res) {
  try {
    const {
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      GOOGLE_DEVELOPER_TOKEN,
      GOOGLE_REFRESH_TOKEN,
      GOOGLE_CUSTOMER_ID,
    } = process.env;

    if (!GOOGLE_CLIENT_ID)
      return res.status(500).json({ error: "GOOGLE_CLIENT_ID ausente" });

    if (!GOOGLE_CLIENT_SECRET)
      return res.status(500).json({ error: "GOOGLE_CLIENT_SECRET ausente" });

    if (!GOOGLE_DEVELOPER_TOKEN)
      return res.status(500).json({ error: "GOOGLE_DEVELOPER_TOKEN ausente" });

    if (!GOOGLE_REFRESH_TOKEN)
      return res.status(500).json({ error: "GOOGLE_REFRESH_TOKEN ausente" });

    if (!GOOGLE_CUSTOMER_ID)
      return res.status(500).json({ error: "GOOGLE_CUSTOMER_ID ausente" });

    const client = new GoogleAdsApi({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      developer_token: GOOGLE_DEVELOPER_TOKEN,
    });

    const customer = client.Customer({
      customer_id: GOOGLE_CUSTOMER_ID.replace(/-/g, ""),
      refresh_token: GOOGLE_REFRESH_TOKEN,
    });

    const rows = await customer.query(`
      SELECT
        metrics.cost_micros,
        metrics.clicks,
        metrics.conversions
      FROM customer
      WHERE segments.date DURING LAST_30_DAYS
    `);

    let costMicros = 0;
    let clicks = 0;
    let conversions = 0;

    for (const r of rows) {
      costMicros += Number(r.metrics.cost_micros || 0);
      clicks += Number(r.metrics.clicks || 0);
      conversions += Number(r.metrics.conversions || 0);
    }

    return res.status(200).json({
      ok: true,
      data: {
        spend: costMicros / 1_000_000,
        clicks,
        conversions,
      },
    });
  } catch (error) {
    console.error("ERRO COMPLETO:", error);

    return res.status(500).json({
      ok: false,
      message: error.message,
      full_error: error,
    });
  }
}
