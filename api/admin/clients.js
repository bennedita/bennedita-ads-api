import { sql } from "../_lib/db.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const clients = await sql`
        SELECT id, name, email, google_customer_id, report_slug, active, created_at
        FROM clients
        ORDER BY created_at DESC
      `;

      return res.status(200).json(clients);
    } catch (error) {
      return res.status(500).json({
        error: "Erro ao listar clientes",
        details: error.message,
      });
    }
  }

  if (req.method === "POST") {
    return res.status(200).json({ message: "Criar cliente" });
  }

  return res.status(405).json({ error: "Método não permitido" });
}
