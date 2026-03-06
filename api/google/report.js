import { sql } from "../_lib/db.js";

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

    const cleanCustomerId = String(customer_id).replace(/\D/g, "");

    const rows = await sql`
      SELECT
        r.id,
        r.period,
        r.snapshot_json,
        r.created_at,
        c.google_customer_id,
        c.name as client_name
      FROM reports r
      JOIN clients c ON c.id = r.client_id
      WHERE REPLACE(REPLACE(REPLACE(c.google_customer_id,'-',''),' ',''),'.','') = ${cleanCustomerId}
      ORDER BY r.created_at DESC
      LIMIT 1
    `;

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Report not found",
      });
    }

    const row = rows[0];
    const snapshot = row.snapshot_json || {};

    const spend = Number(snapshot.cost ?? snapshot.spend ?? 0);
    const conversions = Number(snapshot.leads ?? snapshot.conversions ?? 0);
    const clicks = Number(snapshot.clicks ?? 0);
    const impressions = Number(snapshot.impressions ?? 0);

    return res.status(200).json({
      period: row.period || period,
      customer_id: row.google_customer_id,
      clientName: row.client_name,
      generatedAt: row.created_at,
      data: {
        spend,
        clicks,
        conversions,
        impressions,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? spend / clicks : 0,
        cpa: conversions > 0 ? spend / conversions : 0,
      },
      campaigns: snapshot.campaigns || [],
      chartData: snapshot.chartData || [],
      insights: snapshot.insights || [],
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      details: err.message,
    });
  }
}
