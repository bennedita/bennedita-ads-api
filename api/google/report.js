import { GoogleAdsApi } from "google-ads-api";

const client = new GoogleAdsApi({
  client_id: process.env.GOOGLE_CLIENT_ID,
  client_secret: process.env.GOOGLE_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
});

export default async function handler(req, res) {
    // DEBUG TEMPORÁRIO: verificar se o header interno está chegando
  console.log("[report] x-internal-api-key:", req.headers["x-internal-api-key"]);
  console.log("[report] authorization:", req.headers["authorization"]);
  try {
    const refresh_token = process.env.GOOGLE_REFRESH_TOKEN;

    const customer_id = String(
      req.query.customer_id || process.env.GOOGLE_CUSTOMER_ID || ""
    );

    const login_customer_id = process.env.GOOGLE_LOGIN_CUSTOMER_ID; // MCC

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

    if (!login_customer_id) {
      return res.status(500).json({
        ok: false,
        message: "GOOGLE_LOGIN_CUSTOMER_ID ausente (ID do MCC).",
      });
    }

    // DEBUG TEMPORÁRIO
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || "";
    console.log("[DEBUG OAUTH] clientId_last10:", clientId.slice(-10));
    console.log("[DEBUG OAUTH] clientSecret_len:", clientSecret.length);
    console.log("[DEBUG OAUTH] refreshToken_len:", refreshToken.length);
    console.log(
      "[DEBUG OAUTH] refreshToken_has_newline:",
      /\r|\n/.test(refreshToken)
    );
    console.log("[DEBUG OAUTH] refreshToken_starts:", refreshToken.slice(0, 4));
    console.log("[DEBUG OAUTH] login_customer_id:", login_customer_id);

    const customer = client.Customer({
      customer_id,
      refresh_token,
      login_customer_id,
    });

const period = String(req.query.period || "LAST_30_DAYS");
const startDate = req.query.start_date ? String(req.query.start_date) : null;
const endDate = req.query.end_date ? String(req.query.end_date) : null;

// Filtro de data GAQL
let dateFilter = `segments.date DURING ${period}`;

if (period === "custom") {
  if (!startDate || !endDate) {
    return res.status(400).json({
      ok: false,
      message: "Período custom exige start_date e end_date (YYYY-MM-DD).",
    });
  }
  dateFilter = `segments.date BETWEEN '${startDate}' AND '${endDate}'`;
}

const summaryQuery = `
SELECT
  metrics.cost_micros,
  metrics.clicks,
  metrics.conversions
FROM customer
WHERE ${dateFilter}
`;
const chartQuery = `
SELECT
  segments.date,
  metrics.cost_micros,
  metrics.conversions
FROM customer
WHERE ${dateFilter}
ORDER BY segments.date
`;
    const summaryRows = await customer.query(summaryQuery);
const chartRows = await customer.query(chartQuery);

    let costMicros = 0;
    let clicks = 0;
    let conversions = 0;

    for (const r of summaryRows) {
      costMicros += Number(r.metrics.cost_micros || 0);
      clicks += Number(r.metrics.clicks || 0);
      conversions += Number(r.metrics.conversions || 0);
    }

    const spend = costMicros / 1_000_000;
const chartData = chartRows.map((r) => ({
  date: r.segments.date,
  investimento: Number(r.metrics.cost_micros || 0) / 1_000_000,
  leads: Number(r.metrics.conversions || 0),
}));
    return res.status(200).json({
  ok: true,
  period,
  customer_id,
  data: {
    spend,
    clicks,
    conversions,
    currency: "BRL",
  },
  chartData,
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
