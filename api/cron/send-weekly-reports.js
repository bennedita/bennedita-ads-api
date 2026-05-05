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
    console.log("🔥 CRON WEEKLY START");

    const clients = await sql`
      SELECT id, name, report_slug, weekly_report_enabled
      FROM clients
    `;

    console.log("👥 TODOS CLIENTES:", clients);

    const activeClients = clients.filter(c => c.weekly_report_enabled === true);

    console.log("✅ CLIENTES ATIVOS:", activeClients);

    let processed = 0;

    for (const client of activeClients) {
      try {
        const today = new Date();

        const lastMonday = new Date(today);
        lastMonday.setDate(today.getDate() - today.getDay() - 6);

        const lastSunday = new Date(today);
        lastSunday.setDate(today.getDate() - today.getDay());

        const startDate = formatDate(lastMonday);
        const endDate = formatDate(lastSunday);

        console.log(`➡️ ${client.name} | ${startDate} → ${endDate}`);

        const generateRes = await fetch(
          `${getBaseUrl()}/api/reports/generate-manual?slug=${client.report_slug}&startDate=${startDate}&endDate=${endDate}`
        );

        const generateData = await generateRes.json();

        console.log("📊 GENERATE:", generateData);

        if (!generateData.success) continue;

        const reportId = generateData.reportId;

       const emailRes = await fetch(`${getBaseUrl()}/api/send-email`, {
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
      <p>Segue o relatório referente ao período:</p>
      <p><strong>${startDate} até ${endDate}</strong></p>
      <p>
        <a href="${getAppUrl()}/report/${client.report_slug}">
          Acessar relatório
        </a>
      </p>
      <br/>
      <p>Bennedita Marketing Digital</p>
    `,
    reportId
  }),
});

        const emailData = await emailRes.json();

        console.log("📧 EMAIL:", emailData);

        if (!emailRes.ok) continue;

        processed++;
      } catch (err) {
        console.error("❌ ERRO CLIENTE:", err);
      }
    }

    console.log("✅ FINAL:", processed);

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
