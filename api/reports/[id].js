import { sql } from "../_lib/db.js";

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === "OPTIONS") return res.status(204).end();

  const rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
  const id = String(rawId || "").trim().replace(/[\\"]/g, "");

  if (!id) {
    return res.status(400).json({ success: false, error: "Missing report id" });
  }

  try {
    // -----------------------
    // GET /api/reports/:id
    // -----------------------
    if (req.method === "GET") {
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
        WHERE r.id::text = ${id}
        LIMIT 1
      `;

      const item = rows?.[0] || null;

      if (!item) {
        return res.status(404).json({ success: false, error: "Report not found" });
      }

      return res.status(200).json({ success: true, data: item });
    }

    // -----------------------
    // PATCH /api/reports/:id
    // -----------------------
    if (req.method === "PATCH") {
      const body = await new Promise((resolve) => {
        let data = "";
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => {
          try {
            resolve(JSON.parse(data || "{}"));
          } catch {
            resolve({});
          }
        });
      });

      const allowed = ["period", "summary", "next_actions", "snapshot_json", "status"];
      const sets = [];

      for (const f of allowed) {
        if (body[f] !== undefined) {
          if (f === "snapshot_json") {
            sets.push(sql`snapshot_json = ${JSON.stringify(body[f] || {})}::jsonb`);
          } else {
            sets.push(sql`${sql([f])} = ${body[f]}`);
          }
        }
      }

      if (sets.length === 0) {
        return res.status(400).json({ success: false, error: "No valid fields to update" });
      }

      // monta "SET a=..., b=..." sem sql.join
      let setSql = sql`${sets[0]}`;
      for (let i = 1; i < sets.length; i++) {
        setSql = sql`${setSql}, ${sets[i]}`;
      }

      const updated = await sql`
        UPDATE reports
        SET ${setSql}
        WHERE id::text = ${id}
        RETURNING id
      `;

      if (!updated || updated.length === 0) {
        return res.status(404).json({ success: false, error: "Report not found" });
      }

      return res.status(200).json({ success: true, data: { id: updated[0].id } });
    }

    // outros métodos
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      details: err?.message || String(err),
    });
  }
}
