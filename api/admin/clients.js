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
    try {
      const { name, email, google_customer_id } = req.body;

      if (!name || !google_customer_id) {
        return res.status(400).json({
          error: "Nome e Google Customer ID são obrigatórios",
        });
      }

      const slug = name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "-");

      const newClient = await sql`
        INSERT INTO clients (name, email, google_customer_id, report_slug, active)
        VALUES (${name}, ${email}, ${google_customer_id}, ${slug}, true)
        RETURNING *
      `;

      return res.status(201).json(newClient[0]);
    } catch (error) {
      return res.status(500).json({
        error: "Erro ao criar cliente",
        details: error.message,
      });
    }
  }

  return res.status(405).json({ error: "Método não permitido" });
}
