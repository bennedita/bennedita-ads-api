import { Resend } from "resend";
import { neon } from "@neondatabase/serverless";

const resend = new Resend(process.env.RESEND_API_KEY);
const sql = neon(process.env.POSTGRES_URL);

function getAppUrl() {
  return "https://lead-report-peek.lovable.app";
}

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

      // 3. Criar relatório no banco
      const reportResult = await sql`
        INSERT INTO reports (client_id, period, created_at)
        VALUES (
          ${client.id},
          ${startDate + " até " + endDate},
          NOW()
        )
        RETURNING *
      `;

      const report = reportResult[0];

      // 4. Chamar endpoint que envia email (o que você já tem)
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
