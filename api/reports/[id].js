import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.POSTGRES_URL);

export default async function handler(req, res) {
  try {
    const { id } = req.query;

    // 🔥 buscar snapshot exato pelo UUID
    const rows = await sql`
      SELECT *
      FROM reports
      WHERE id = ${id}
      LIMIT 1
    `;

    const report = rows?.[0];

    if (!report) {
      return res.status(404).json({
        error: `Relatório ${id} não encontrado`,
      });
    }

    return res.json(report);
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
}
