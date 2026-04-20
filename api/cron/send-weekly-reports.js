import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.POSTGRES_URL);

export default async function handler(req, res) {
  try {
    // 1. Buscar clientes com semanal ativo
    const clients = await sql`
      SELECT * FROM clients
      WHERE weekly_report_enabled = true
    `;

    for (const client of clients) {
      // 2. Criar período (últimos 7 dias)
      const today = new Date();
      const endDate = today.toISOString().split("T")[0];

      const start = new Date();
      start.setDate(today.getDate() - 7);
      const startDate = start.toISOString().split("T")[0];

      // 3. Criar relatório no banco (CORRIGIDO)
      const reportResult = await sql`
        INSERT INTO reports (
          client_id,
          period,
          snapshot_json,
          created_at
        )
        VALUES (
          ${client.id},
          ${startDate + " até " + endDate},
          ${JSON.stringify({ weekly: true })}::jsonb,
          NOW()
        )
        RETURNING *
      `;

      const report = reportResult[0];

      // 4. Chamar envio de email
      await fetch(`${process.env.BASE_URL}/api/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportId: report.id,
        }),
      });
    }

    return res.json({
      success: true,
      processed: clients.length,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: err.message,
    });
  }
}
