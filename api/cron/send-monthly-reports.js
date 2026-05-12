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
    // 🔥 somente clientes ativos + mensal habilitado
    const clients = await sql`
      SELECT *
      FROM clients
      WHERE active = true
      AND monthly_report_enabled = true
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

        const period = `${startDate} até ${endDate}`;

        console.log(`➡️ ${client.name}`);
        console.log(`📅 ${period}`);

        // 🔒 EVITA DUPLICIDADE
        const existing = await sql`
          SELECT id
          FROM reports
          WHERE client_id = ${client.id}
          AND period = ${period}
          LIMIT 1
        `;

        if (existing.length > 0) {
          console.log(`⏭️ Relatório já existe para ${client.name}`);
          continue;
        }

        // 🔥 1. GERAR RELATÓRIO
        const generateRes = await fetch(
          `${getBaseUrl()}/api/reports/generate-manual?slug=${client.report_slug}&startDate=${startDate}&endDate=${endDate}`
        );

        const generateData = await generateRes.json();

        console.log("GENERATE DATA:", generateData);

        if (!generateRes.ok || !generateData.success) {
          console.error(
            `❌ Erro ao gerar relatório para ${client.name}:`,
            generateData
          );
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
          console.error(
            `❌ Erro no email para ${client.name}:`,
            emailData
          );
          continue;
        }

        console.log(`✅ Email enviado para ${client.name}`);

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
