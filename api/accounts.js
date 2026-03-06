import { sql } from "./_lib/db.js";

export default async function handler(req, res) {
  try {
    const rows = await sql`
      SELECT DISTINCT
        c.google_customer_id,
        c.name as client_name
      FROM clients c
      WHERE c.google_customer_id IS NOT NULL
      ORDER BY c.name ASC
    `;

    const accounts = rows.map((row) => ({
      id: row.google_customer_id,
      name: row.client_name,
    }));

    return res.status(200).json({
      success: true,
      data: accounts,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      details: err?.message || String(err),
    });
  }
}
