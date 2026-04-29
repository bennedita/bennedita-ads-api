import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.POSTGRES_URL);

function getBaseUrl() {
  return process.env.BASE_URL;
}

export default async function handler(req, res) {
  try {
    const clients = await sql`
      SELECT * FROM clients
      WHERE weekly_report_enabled = true
    `;

    let processed = 0;

    for (const client of clients) {
      // período (últimos 7 dias)
      const today = new Date();
      const endDate = today.toISOString().split("T")[0];

      const start = new Date();
      start.setDate(today.getDate() - 7);
      const startDate = start.toISOString().split("T")[0];

      // 1. GERAR RELATÓRIO REAL (Google Ads)
      const generateRes = await fetch(
        `${getBaseUrl()}/api/reports/generate-manual?slug=${client.report_slug}&startDate=${startDate}&endDate=${endDate}`
      );

      const generateData = await generateRes.json();

      if (!generateData.success) {
        console.error("Erro ao gerar relatório:", generateData);
        continue;
      }

      const reportId = generateData.reportId;

      // 2. ENVIAR EMAIL COM PDF
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
            <p>Segue o relatório da última semana.</p>
            <p>
              <a href="https://lead-report-peek.lovable.app/report/${client.report_slug}">
                Acessar relatório
              </a>
            </p>
            <br/>
            <p>Bennedita Marketing Digital</p>
          `,
          reportUrl: `https://lead-report-peek.lovable.app/report/${client.report_slug}`
        }),
      });

      processed++;
    }

    return res.json({
      success: true,
      processed,
    });
  } catch (err) {
    console.error("CRON ERROR:", err);

    return res.status(500).json({
      error: err.message,
    });
  }
}
