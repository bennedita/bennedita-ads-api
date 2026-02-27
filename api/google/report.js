import { GoogleAdsApi } from "google-ads-api";
import { requireInternalAuth } from "../_lib/requireInternalAuth.js";

const client = new GoogleAdsApi({
  client_id: process.env.GOOGLE_CLIENT_ID,
  client_secret: process.env.GOOGLE_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
});

function formatDate(d) {
  return d.toISOString().split("T")[0];
}

// Converte period (LAST_7_DAYS, THIS_MONTH, etc) em range fixo start/end
function getRangeFromPeriod(period) {
  const today = new Date();

  // Usar ontem como "end" para evitar dia parcial (muito comum em Ads)
  const end = new Date(today);
  end.setDate(end.getDate() - 1);

  const start = new Date(end);

  const daysMap = {
    LAST_7_DAYS: 7,
    LAST_14_DAYS: 14,
    LAST_30_DAYS: 30,
    LAST_90_DAYS: 90,
  };

  if (daysMap[period]) {
    start.setDate(end.getDate() - (daysMap[period] - 1));
    return { start: formatDate(start), end: formatDate(end) };
  }

  if (period === "THIS_MONTH") {
    const s = new Date(end.getFullYear(), end.getMonth(), 1);
    return { start: formatDate(s), end: formatDate(end) };
  }

  if (period === "LAST_MONTH") {
    const s = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    const e = new Date(end.getFullYear(), end.getMonth(), 0); // último dia do mês passado
    return { start: formatDate(s), end: formatDate(e) };
  }

  // fallback: 30 dias
  start.setDate(end.getDate() - 29);
  return { start: formatDate(start), end: formatDate(end) };
}

// Dado um range, gera o range anterior equivalente (mesma duração)
function getPreviousDateRange(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const diffMs = endDate.getTime() - startDate.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const prevEnd = new Date(startDate);
  prevEnd.setDate(prevEnd.getDate() - 1);

  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - diffDays);

  return {
    start: formatDate(prevStart),
    end: formatDate(prevEnd),
  };
}

function calcDelta(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function generateInsights(current, delta) {
  const insights = [];

  // Conversões
  if (current.conversions > 0) {
    insights.push(`Foram geradas ${current.conversions} conversões no período.`);
  } else {
    insights.push(`Não houve conversões registradas no período.`);
  }

  // Investimento
  if (current.spend > 0) {
    insights.push(`O investimento total foi de R$ ${current.spend.toFixed(2)}.`);
  }

  // CPA médio
  if (current.conversions > 0 && current.spend > 0) {
    const cpa = current.spend / current.conversions;
    insights.push(`O CPA médio foi de R$ ${cpa.toFixed(2)}.`);
  }

  // Variação de conversões
  if (delta.conversions !== null) {
    if (delta.conversions > 0) {
      insights.push(
        `As conversões aumentaram ${delta.conversions.toFixed(
          1
        )}% em relação ao período anterior.`
      );
    } else if (delta.conversions < 0) {
      insights.push(
        `As conversões reduziram ${Math.abs(delta.conversions).toFixed(
          1
        )}% em relação ao período anterior.`
      );
    } else {
      insights.push(`As conversões ficaram estáveis vs período anterior.`);
    }
  }

  return insights;
}

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
      return res.status(500).json({ ok: false, message: "GOOGLE_REFRESH_TOKEN ausente" });
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

    // DEBUG TEMPORÁRIO (pode remover depois)
    const clientId = process.env.GOOGLE_CLIENT_ID || "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
    const refreshToken = process.env.GOOGLE_REFRESH_TOKEN || "";
    console.log("[DEBUG OAUTH] clientId_last10:", clientId.slice(-10));
    console.log("[DEBUG OAUTH] clientSecret_len:", clientSecret.length);
    console.log("[DEBUG OAUTH] refreshToken_len:", refreshToken.length);
    console.log("[DEBUG OAUTH] refreshToken_has_newline:", /\r|\n/.test(refreshToken));
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

    // Range atual (custom ou period padrão)
    let currentRange;
    if (period === "custom") {
      if (!startDate || !endDate) {
        return res.status(400).json({
          ok: false,
          message: "Período custom exige start_date e end_date (YYYY-MM-DD).",
        });
      }
      currentRange = { start: startDate, end: endDate };
    } else {
      currentRange = getRangeFromPeriod(period);
    }

    const dateFilter = `segments.date BETWEEN '${currentRange.start}' AND '${currentRange.end}'`;

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

    const [summaryRows, chartRows] = await Promise.all([
      customer.query(summaryQuery),
      customer.query(chartQuery),
    ]);

    // Range anterior (sempre)
    const prevRange = getPreviousDateRange(currentRange.start, currentRange.end);

    const previousQuery = `
      SELECT
        metrics.cost_micros,
        metrics.clicks,
        metrics.conversions
      FROM customer
      WHERE segments.date BETWEEN '${prevRange.start}' AND '${prevRange.end}'
    `;

    const previousSummaryRows = await customer.query(previousQuery);

    // Soma atual
    let costMicros = 0;
    let clicks = 0;
    let conversions = 0;

    for (const r of summaryRows) {
      costMicros += Number(r.metrics.cost_micros || 0);
      clicks += Number(r.metrics.clicks || 0);
      conversions += Number(r.metrics.conversions || 0);
    }

    // Soma anterior
    let prevCostMicros = 0;
    let prevClicks = 0;
    let prevConversions = 0;

    for (const r of previousSummaryRows) {
      prevCostMicros += Number(r.metrics.cost_micros || 0);
      prevClicks += Number(r.metrics.clicks || 0);
      prevConversions += Number(r.metrics.conversions || 0);
    }

    const spend = costMicros / 1_000_000;
    const prevSpend = prevCostMicros / 1_000_000;

    const delta = {
      spend: calcDelta(spend, prevSpend),
      clicks: calcDelta(clicks, prevClicks),
      conversions: calcDelta(conversions, prevConversions),
    };

    const currentData = { spend, clicks, conversions };
    const insights = generateInsights(currentData, delta);

    const chartData = chartRows.map((r) => ({
      date: r.segments.date,
      investimento: Number(r.metrics.cost_micros || 0) / 1_000_000,
      conversions: Number(r.metrics.conversions || 0),
    }));

    return res.status(200).json({
      ok: true,
      period,
      customer_id,
      range: currentRange,
      previousRange: prevRange,

      current: currentData,
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
