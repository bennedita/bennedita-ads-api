import { sql } from "../_lib/db.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  try {
    const rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
    const id = String(rawId || "").trim().replace(/[\\"]/g, "");

    if (!id) {
      return res.status(400).json({ success: false, error: "Missing report id" });
    }

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

    // 1) Se for UUID válido, busca normal por UUID
    if (isUuid) {
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

      if (!rows?.[0]) {
        return res.status(404).json({ success: false, error: "Report not found" });
      }

      return res.status(200).json({ success: true, data: rows[0] });
    }

    // 2) Se NÃO for UUID, tenta achar por prefixo (ex: veio truncado com 35 chars)
    const like = `${id}%`;
    const matches = await sql`
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
      WHERE r.id::text LIKE ${like}
      ORDER BY r.created_at DESC
      LIMIT 2
    `;

    if (!matches || matches.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Report not found",
        debug: { received: id, length: id.length }
      });
    }

    if (matches.length > 1) {
      return res.status(409).json({
        success: false,
        error: "Ambiguous id prefix (more than one match)",
        debug: { received: id, length: id.length }
      });
    }

    // Achou 1 único: retorna e mostra o UUID completo correto
    return res.status(200).json({
      success: true,
      data: matches[0],
      corrected_id: matches[0].id
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      details: err?.message || String(err),
    });
  }
}
