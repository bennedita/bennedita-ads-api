import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.POSTGRES_URL);

export default async function handler(req, res) {
  try {
    const { id } = req.query;

    // 🔥 NOVO: aceitar slug também
    const rows = await sql`
      SELECT r.*
      FROM reports r
      JOIN clients c ON r.client_id = c.id
      WHERE c.report_slug = ${id}
      ORDER BY r.created_at DESC
      LIMIT 1
    `;

    const report = rows?.[0];

    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }

    return res.json(report);
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
}
