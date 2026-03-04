import { sql } from "../_lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      client_name,
      google_customer_id,
      period,
      summary,
      next_actions,
      snapshot_json,
      status,
    } = req.body;

    if (!client_name || !google_customer_id || !period || !snapshot_json) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Verifica se cliente já existe
    let client =
      await sql`SELECT * FROM clients WHERE google_customer_id = ${google_customer_id}`;

    let clientId;

    if (client.length === 0) {
      const inserted =
        await sql`
          INSERT INTO clients (name, google_customer_id)
          VALUES (${client_name}, ${google_customer_id})
          RETURNING id
        `;
      clientId = inserted[0].id;
    } else {
      clientId = client[0].id;
    }

    // Insere relatório
    const report =
      await sql`
        INSERT INTO reports (
          client_id,
          period,
          summary,
          next_actions,
          snapshot_json,
          status
        )
        VALUES (
          ${clientId},
          ${period},
          ${summary || ""},
          ${next_actions || ""},
          ${snapshot_json},
          ${status || "rascunho"}
        )
        RETURNING *
      `;

    return res.status(200).json({
      success: true,
      report: report[0],
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
}
