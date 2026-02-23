import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function requireAuth(req) {
  const token = req.headers.authorization || "";
  const isVercelCron = req.headers["x-vercel-cron"] === "1";
  const isManualAuth = token === `Bearer ${process.env.INTERNAL_API_KEY}`;
  return isVercelCron || isManualAuth;
}

function formatISODate(d) {
  return d.toISOString().split("T")[0];
}

export default async function handler(req, res) {
  try {
    if (!requireAuth(req)) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const now = new Date();
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const start_date = formatISODate(firstDayLastMonth);
    const end_date = formatISODate(lastDayLastMonth);

    const clients = JSON.parse(process.env.REPORT_CLIENTS_JSON || "[]");

    if (!clients.length) {
      return res.status(400).json({ ok: false, error: "No clients configured" });
    }

    const sent = [];
    const failed = [];

    for (const client of clients) {
      if (client.frequency !== "monthly") continue;

      try {
        const proto = req.headers["x-forwarded-proto"] || "https";
        const host = req.headers["x-forwarded-host"] || req.headers.host;
        const baseUrl = `${proto}://${host}`;

        const url = `${baseUrl}/api/google/report?customer_id=${client.customer_id}&period=custom&start_date=${start_date}&end_date=${end_date}`;

        const reportResponse = await fetch(url);
        const report = await reportResponse.json();

        if (!reportResponse.ok || !report?.ok) {
          throw new Error("Failed to generate report");
        }

        await resend.emails.send({
          from: process.env.EMAIL_FROM,
          to: client.email,
          subject: `Relatório Mensal - ${client.name} (${start_date} a ${end_date})`,
          html: `
            <h2>Relatório Mensal - ${client.name}</h2>
            <p><strong>Período:</strong> ${start_date} até ${end_date}</p>
            <hr/>
            <p><strong>Investimento:</strong> R$ ${Number(report.data?.spend ?? 0).toFixed(2)}</p>
            <p><strong>Leads:</strong> ${Number(report.data?.conversions ?? 0)}</p>
            <p><strong>Cliques:</strong> ${Number(report.data?.clicks ?? 0)}</p>
          `,
        });

        sent.push(client.name);
      } catch (err) {
        console.error("Erro cliente:", client.name, err.message);
        failed.push(client.name);
      }
    }

    return res.status(200).json({
      ok: true,
      sent,
      failed,
      period: { start_date, end_date },
    });
  } catch (err) {
    console.error("cron send-monthly-reports error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
