import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.POSTGRES_URL);

function getBaseUrl() {
  if (!process.env.BASE_URL) {
    throw new Error("BASE_URL não definida");
  }
  return process.env.BASE_URL;
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

        console.log(`➡️ ${client.name}`);
        console.log(`📅 ${startDate} até ${endDate}`);

        // 🔥 1. GERAR RELATÓRIO
        const generateRes = await fetch(
          `${getBaseUrl()}/api/reports/generate-manual?slug=${client.report_slug}&startDate=${startDate}&endDate=${endDate}`
        );

        const generateData = await generateRes.json();

        if (!generateData.success) {
          console.error("❌ Erro ao gerar:", generateData);
          continue;
        }

        const reportId = generateData.reportId;

        console.log(`✅ Report ID: ${reportId}`);

        // 📧 2. ENVIAR EMAIL (USANDO SEU ENDPOINT CORRETO)
        const emailRes = await fetch(`${getBaseUrl()}/api/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reportId, // 🔥 ÚNICO CAMPO NECESSÁRIO
          }),
        });

        const emailData = await emailRes.json();

        if (!emailRes.ok) {
          console.error("❌ Email erro:", emailData);
          continue;
        }

        console.log("📧 Email enviado");

        processed++;
      } catch (errClient) {
        console.error(`❌ Cliente ${client.name}:`, errClient);
      }
    }

    console.log("FINAL:", processed);

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
