import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.POSTGRES_URL);

function getBaseUrl() {
  if (!process.env.BASE_URL) {
    throw new Error("BASE_URL não definida");
  }
  return process.env.BASE_URL;
}

function getAppUrl() {
  return "https://lead-report-peek.lovable.app";
}

function formatDate(date) {
  return date.toISOString().split("T")[0];
}

export default async function handler(req, res) {
  try {
    const clients = await sql`
      SELECT * FROM clients
      WHERE weekly_report_enabled = true
    `;

    let processed = 0;

    for (const client of clients) {
      try {
        // 📅 SEMANA COMPLETA ANTERIOR (segunda → domingo)
        const today = new Date();

        const lastMonday = new Date(today);
        lastMonday.setDate(today.getDate() - today.getDay() - 6);

        const lastSunday = new Date(today);
        lastSunday.setDate(today.getDate() - today.getDay());

        const startDate = formatDate(lastMonday);
        const endDate = formatDate(lastSunday);

        console.log(`➡️ Gerando relatório: ${client.name}`);
        console.log(`📅 Período: ${startDate} até ${endDate}`);

        // 🔥 GERAR RELATÓRIO
        const generateRes = await fetch(
          `${getBaseUrl()}/api/reports/generate-manual?slug=${client.report_slug}&startDate=${startDate}&endDate=${endDate}`
        );

        const generateData = await generateRes.json();

        if (!generateData.success) {
          console.error("❌ Erro ao gerar relatório:", generateData);
          continue;
        }

        const reportId = generateData.reportId;

        console.log(`✅ Relatório pronto: ${reportId}`);

        // 📧 ENVIAR EMAIL
        const emailRes = await fetch(`${getBaseUrl()}/api/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reportId,
          }),
        });

        const emailData = await emailRes.json();

        if (!emailRes.ok) {
          console.error("❌ Erro ao enviar email:", emailData);
          continue;
        }

        console.log("📧 Email enviado:", emailData);

        processed++;
      } catch (clientError) {
        console.error(`❌ Erro no cliente ${client.name}:`, clientError);
      }
    }

    return res.json({
      success: true,
      processed,
    });
  } catch (err) {
    console.error("🔥 CRON ERROR:", err);

    return res.status(500).json({
      error: err.message,
    });
  }
}
