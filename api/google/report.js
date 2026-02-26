import { GoogleAdsApi } from "google-ads-api";
import { requireInternalAuth } from "../_lib/requireInternalAuth.js";
const client = new GoogleAdsApi({
  client_id: process.env.GOOGLE_CLIENT_ID,
  client_secret: process.env.GOOGLE_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
});

export default async function handler(req, res) {
    const authError = requireInternalAuth(req, res);
  if (authError) return;
  
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
    function getPreviousDateRange(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const diffMs = endDate - startDate;
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const prevEnd = new Date(startDate);
  prevEnd.setDate(prevEnd.getDate() - 1);

  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - diffDays);

  const format = (d) => d.toISOString().split("T")[0];

  return {
    start: format(prevStart),
    end: format(prevEnd),
  };
}
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
// ============================
// PERÍODO ANTERIOR (apenas se custom)
// ============================

let previousSummaryRows = [];

if (period === "custom" && startDate && endDate) {
  const prevRange = getPreviousDateRange(startDate, endDate);

  const previousQuery = `
  SELECT
    metrics.cost_micros,
    metrics.clicks,
    metrics.conversions
  FROM customer
  WHERE segments.date BETWEEN '${prevRange.start}' AND '${prevRange.end}'
  `;

  previousSummaryRows = await customer.query(previousQuery);
}
    let costMicros = 0;
    let clicks = 0;
    let conversions = 0;

    for (const r of summaryRows) {
      costMicros += Number(r.metrics.cost_micros || 0);
      clicks += Number(r.metrics.clicks || 0);
      conversions += Number(r.metrics.conversions || 0);
    }
// ============================
// SOMA PERÍODO ANTERIOR
// ============================

let prevCostMicros = 0;
let prevClicks = 0;
let prevConversions = 0;

for (const r of previousSummaryRows) {
  prevCostMicros += Number(r.metrics.cost_micros || 0);
  prevClicks += Number(r.metrics.clicks || 0);
  prevConversions += Number(r.metrics.conversions || 0);
}

const prevSpend = prevCostMicros / 1_000_000;
    const spend = costMicros / 1_000_000;
    // ============================
// CÁLCULO DE VARIAÇÃO (%)
// ============================

function calcDelta(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

const delta = {
  spend: calcDelta(spend, prevSpend),
  clicks: calcDelta(clicks, prevClicks),
  conversions: calcDelta(conversions, prevConversions),
};
// ============================
// INSIGHTS AUTOMÁTICOS
// ============================

function generateInsights(current, previous, delta) {
  const insights = [];

  // Leads
  if (current.conversions > 0) {
    insights.push(
      `Foram gerados ${current.conversions} leads no período.`
    );
  }

  // Investimento
  if (current.spend > 0) {
    insights.push(
      `O investimento total foi de R$ ${current.spend.toFixed(2)}.`
    );
  }

  // CPL
  if (current.conversions > 0) {
    const cpl = current.spend / current.conversions;
    insights.push(
      `O custo médio por lead foi de R$ ${cpl.toFixed(2)}.`
    );
  }

  // Crescimento de conversões
  if (delta.conversions !== null) {
    if (delta.conversions > 0) {
      insights.push(
        `As conversões aumentaram ${delta.conversions.toFixed(1)}% em relação ao período anterior.`
      );
    } else if (delta.conversions < 0) {
      insights.push(
        `As conversões reduziram ${Math.abs(delta.conversions).toFixed(1)}% comparado ao período anterior.`
      );
    }
  }

  return insights;
}    
const chartData = chartRows.map((r) => ({
  date: r.segments.date,
  investimento: Number(r.metrics.cost_micros || 0) / 1_000_000,
  leads: Number(r.metrics.conversions || 0),
}));
    const currentData = {
  spend,
  clicks,
  conversions,
};

const previousData = {
  spend: prevSpend,
  clicks: prevClicks,
  conversions: prevConversions,
};

const insights = generateInsights(currentData, previousData, delta);
   return res.status(200).json({
  ok: true,
  period,
  customer_id,

  current: {
    spend,
    clicks,
    conversions,
  },

  previous: {
    spend: prevSpend,
    clicks: prevClicks,
    conversions: prevConversions,
  },

  delta,
  insights,
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
