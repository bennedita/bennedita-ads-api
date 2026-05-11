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
    // 🔥 usando coluna que EXISTE no banco
    const clients = await sql`
  SELECT *
  FROM clients
  WHERE active = true
`;

    let processed = 0;

    for (const client of clients) {
      try {
        // 📅 MÊS ANTERIOR COMPLETO
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

        const startDate = formatDate(firstDayLastMonth);
        const endDate = formatDate(lastDayLastMonth);

        console.log(`➡️ ${client.name}`);
        console.log(`📅 ${startDate} até ${endDate}`);

        // 🔥 1. GERAR RELATÓRIO
        const generateRes = await fetch(
          `${getBaseUrl()}/api/reports/generate-manual?slug=${client.report_slug}&startDate=${startDate}&endDate=${endDate}`
        );

        const generateData = await generateRes.json();

        console.log("GENERATE DATA:", generateData);

        if (!generateData.success) {
          console.error("❌ Erro ao gerar relatório:", generateData);
          continue;
        }

        const reportId = generateData.reportId;

        console.log(`✅ Report ID: ${reportId}`);

        // 🔥 2. ENVIAR EMAIL
        const emailRes = await fetch(
          `${getBaseUrl()}/api/send-email`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              reportId,
            }),
          }
        );

        const emailData = await emailRes.json();

        console.log("📧 EMAIL DATA:", emailData);

        if (!emailRes.ok) {
          console.error("❌ Erro no email:", emailData);
          continue;
        }

        console.log("✅ Email enviado");

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
    console.error("🔥 CRON MENSAL ERROR:", err);

    return res.status(500).json({
      error: err.message,
    });
  }
}
