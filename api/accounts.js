import { sql } from "./_lib/db";

export default async function handler(req, res) {
  try {
    const rows = await sql`
      SELECT DISTINCT google_customer_id, client_name
      FROM reports
      WHERE google_customer_id IS NOT NULL
    `;

    const accounts = rows.map((row) => ({
      id: row.google_customer_id,
      name: row.client_name,
    }));

    res.status(200).json(accounts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar contas" });
  }
}
