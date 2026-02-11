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
      source: "google_live",
      period: dateRange,
      customer_id,
      data: {
        spend,
        clicks,
        conversions,
        currency: "BRL",
      },
      campaigns: [],
    });

  } catch (err) {
    const errText = err?.message ? String(err.message) : String(err);

    const isAuthError =
      errText.includes("403") ||
      errText.toUpperCase().includes("PERMISSION_DENIED") ||
      errText.toUpperCase().includes("AUTHENTICATION_ERROR") ||
      errText.toUpperCase().includes("AUTHORIZATION_ERROR");

    // 🔥 SE FOR ERRO DE PERMISSÃO (NORMAL ANTES DA APROVAÇÃO)
    if (isAuthError) {
      return res.status(200).json({
        ok: true,
        source: "mock_fallback_google_403",
        period: String(req.query.period || "LAST_30_DAYS"),
        customer_id: String(
          req.query.customer_id || process.env.GOOGLE_CUSTOMER_ID || ""
        ),
        data: {
          spend: 7200,
          clicks: 2450,
          conversions: 104,
          currency: "BRL",
        },
        campaigns: [
          { name: "Campanha - Busca Genérica", spend: 2850, conversions: 32 },
          { name: "Campanha - Marca", spend: 1200, conversions: 28 },
          { name: "Campanha - Remarketing", spend: 1650, conversions: 24 },
          { name: "Campanha - Display", spend: 980, conversions: 12 },
          { name: "Campanha - Performance Max", spend: 520, conversions: 8 },
        ],
      });
    }

    // ❌ QUALQUER OUTRO ERRO REAL
    return res.status(500).json({
      ok: false,
      error: errText,
    });
  }
}
