import { sql } from "../_lib/db.js";

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  try {
    const rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
const id = String(rawId || "").trim().replace(/^"|"$/g, "").replace(/"/g, "");

// valida UUID (aceita v1-v5)
const isUuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

 if (!isUuid) {
  return res.status(400).json({
    success: false,
    error: "Invalid report id",
    debug: {
      received: rawId,
      cleaned: id,
      length: id.length
    }
  });
}

    const rows = await sql`
      SELECT
        r.id,
        r.client_id,
        c.name as client_name,
        c.google_customer_id,
        r.period,
        r.summary,
        r.next_actions,
        r.snapshot_json,
        r.status,
        r.created_at
      FROM reports r
      JOIN clients c ON c.id = r.client_id
      WHERE r.id = ${id}::uuid
      LIMIT 1
    `;

    const item = rows?.[0] || null;

    if (!item) {
      return res.status(404).json({ success: false, error: "Report not found" });
    }

    return res.status(200).json({ success: true, data: item });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      details: err?.message || String(err),
    });
  }
}
