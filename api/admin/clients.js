import { sql } from "../_lib/db.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const clients = await sql`
        SELECT
          c.id,
          c.name,
          c.email,
          c.google_customer_id,
          c.report_slug,
          c.active,
          c.created_at,
          COALESCE(
            json_agg(
              json_build_object(
                'platform', a.platform,
                'account_id', a.account_id,
                'account_name', a.account_name
              )
            ) FILTER (WHERE a.id IS NOT NULL),
            '[]'
          ) AS ad_accounts
        FROM clients c
        LEFT JOIN ad_accounts a
          ON a.client_id = c.id
          AND a.active = true
        GROUP BY
          c.id,
          c.name,
          c.email,
          c.google_customer_id,
          c.report_slug,
          c.active,
          c.created_at
        ORDER BY c.created_at DESC
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
