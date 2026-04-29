import { neon } from "@neondatabase/serverless";

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

    let processed = 0;

    for (const client of clients) {
      // 2. Criar período (últimos 7 dias)
      const today = new Date();
      const endDate = today.toISOString().split("T")[0];

      const start = new Date();
      start.setDate(today.getDate() - 7);
      const startDate = start.toISOString().split("T")[0];

      const period = `${startDate} até ${endDate}`;

      // 3. Evitar duplicação
      const existing = await sql`
        SELECT id FROM reports
        WHERE client_id = ${client.id}
        AND period = ${period}
        LIMIT 1
      `;

      if (existing.length > 0) {
        console.log("Relatório já existe:", client.name);
        continue;
      }

      // 4. Criar relatório
      const reportResult = await sql`
        INSERT INTO reports (
          client_id,
          period,
          snapshot_json,
          status,
          created_at
        )
        VALUES (
          ${client.id},
          ${period},
          ${JSON.stringify({ weekly: true })}::jsonb,
          'generated',
          NOW()
        )
        RETURNING *
      `;

      const report = reportResult[0];

      // 5. Enviar email (CORRIGIDO)
      await fetch(`${process.env.BASE_URL}/api/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: client.email,
          subject: `Relatório Google Ads - ${client.name}`,
          html: `
            <h2>Relatório de Performance</h2>
            <p>Olá!</p>
            <p>Segue o relatório referente a <strong>${period}</strong>.</p>
            <p>
              <a href="${getAppUrl()}/report/${client.report_slug}">
                Acessar relatório
              </a>
            </p>
            <br/>
            <p>Bennedita Marketing Digital</p>
          `,
          reportUrl: `${getAppUrl()}/report/${client.report_slug}`
        }),
      });

      processed++;
    }

    return res.json({
      success: true,
      processed,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: err.message,
    });
  }
}
