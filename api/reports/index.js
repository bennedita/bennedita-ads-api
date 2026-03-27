import { sql } from "../_lib/db.js";
// force deploy
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "GET") {
    try {
      const { slug } = req.query;

      if (!slug) {
        return res.status(400).json({
          error: "slug é obrigatório",
        });
      }

      const reports = await sql`
        SELECT *
        FROM reports
        WHERE client_slug = ${slug}
        ORDER BY created_at DESC
      `;

      return res.status(200).json(reports);
    } catch (error) {
      console.error("ERRO AO BUSCAR RELATÓRIOS:", error);

      return res.status(500).json({
        error: "Erro ao buscar relatórios",
        details: error.message,
      });
    }
  }

  if (req.method === "POST") {
    try {
      const {
  client_slug,
  customer_id,
  account_name,
  period,
  platforms,
  summary,
  campaigns,
  chart_data,
  snapshot_json,
  pdf_url,
} = req.body;

      if (!client_slug || !period) {
        return res.status(400).json({
          error: "client_slug e period são obrigatórios",
        });
      }

      const client = await sql`
        SELECT id FROM clients WHERE report_slug = ${client_slug} LIMIT 1
      `;

      if (!client.length) {
        return res.status(404).json({
          error: "Cliente não encontrado",
        });
      }

      const client_id = client[0].id;

      console.log("BODY RECEBIDO:", req.body);

      const report = await sql`
        INSERT INTO reports (
          client_id,
          client_slug,
          customer_id,
          account_name,
          period,
          platforms,
          summary,
          campaigns,
          chart_data,
          snapshot_json,
          pdf_url,
          status
        )
        VALUES (
          ${client_id},
          ${client_slug},
          ${customer_id || null},
          ${account_name || null},
          ${period},
          ${platforms || null},
          ${summary ? JSON.stringify(summary) : null},
          ${campaigns ? JSON.stringify(campaigns) : null},
          ${chart_data ? JSON.stringify(chart_data) : null},
          ${snapshot_json ? JSON.stringify(snapshot_json) : null},
          ${pdf_url || null},
          'draft'
        )
        RETURNING *
      `;

      return res.status(201).json(report[0]);
    } catch (error) {
      console.error("ERRO AO SALVAR RELATÓRIO:", error);

      return res.status(500).json({
        error: "Erro ao salvar relatório",
        details: error.message,
      });
    }
  }

  return res.status(405).json({ error: "Método não permitido" });
}
