import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.POSTGRES_URL);

function getBaseUrl() {
  return process.env.BASE_URL;
}

function getAppUrl() {
  return "https://lead-report-peek.lovable.app";
}

export default async function handler(req, res) {
  try {
   const clients = await sql`
  SELECT * FROM clients
  WHERE report_slug = 'vinicius-faria---cantor'
`;

    let processed = 0;

    for (const client of clients) {
      try {
        // 📅 período do mês anterior
        const today = new Date();

        const firstDayLastMonth = new Date(
          today.getFullYear(),
          today.getMonth() - 1,
          1
        );

        const lastDayLastMonth = new Date(
          today.getFullYear(),
          today.getMonth(),
          0
        );

        const startDate = firstDayLastMonth.toISOString().split("T")[0];
        const endDate = lastDayLastMonth.toISOString().split("T")[0];

        console.log(`Gerando relatório mensal: ${client.name}`);

        // 1. gerar relatório
        const generateRes = await fetch(
          `${getBaseUrl()}/api/reports/generate-manual?slug=${client.report_slug}&startDate=${startDate}&endDate=${endDate}`
        );

        const generateData = await generateRes.json();

        if (!generateData.success) {
          console.error("Erro ao gerar relatório:", generateData);
          continue;
        }

        const reportId = generateData.reportId;

        // 2. enviar email
  const emailRes = await fetch(`${getBaseUrl()}/api/send-email`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    reportId
  }),
});

        const emailData = await emailRes.json();
        console.log("Email enviado:", emailData);

        processed++;
      } catch (err) {
        console.error("Erro no cliente:", client.name, err);
      }
    }

    return res.json({
      success: true,
      processed,
    });
  } catch (err) {
    console.error("CRON MENSAL ERROR:", err);

    return res.status(500).json({
      error: err.message,
    });
  }
}
