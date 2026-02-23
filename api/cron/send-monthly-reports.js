import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function requireAuth(req) {
  const token = req.headers.authorization || "";
  return token === `Bearer ${process.env.INTERNAL_API_KEY}`;
}

function formatISODate(d) {
  return d.toISOString().split("T")[0];
}

export default async function handler(req, res) {
  try {
    // 🔐 Bloqueia acesso público (cron/automation)
    if (!requireAuth(req)) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    // 📅 mês anterior (fechado)
    const now = new Date();
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const start_date = formatISODate(firstDayLastMonth);
    const end_date = formatISODate(lastDayLastMonth);

    // ✅ por enquanto: 1 cliente (depois vira lista de clientes)
    const customer_id = process.env.GOOGLE_CUSTOMER_ID;

    // Chama o próprio endpoint de report (mesma API já pronta)
    const baseUrl =
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";

    const url = `${baseUrl}/api/google/report?customer_id=${customer_id}&period=custom&start_date=${start_date}&end_date=${end_date}`;

    const reportResponse = await fetch(url);
    const report = await reportResponse.json();

    if (!reportResponse.ok || !report?.ok) {
      return res.status(500).json({
        ok: false,
        error: "Failed to generate report",
        details: report,
      });
    }

    // 📧 Email de teste (trocar depois para email do cliente)
    const to = process.env.REPORT_TEST_TO_EMAIL; // vamos criar essa env no próximo passo

    if (!to) {
      return res.status(400).json({
        ok: false,
        error: "Missing REPORT_TEST_TO_EMAIL env",
      });
    }

    await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to,
      subject: `Relatório Mensal (Google Ads) — ${start_date} a ${end_date}`,
      html: `
        <h2>Relatório Mensal — Google Ads</h2>
        <p><strong>Período:</strong> ${start_date} até ${end_date}</p>
        <hr/>
        <p><strong>Investimento:</strong> R$ ${Number(report.data?.spend ?? 0).toFixed(2)}</p>
        <p><strong>Leads:</strong> ${Number(report.data?.conversions ?? 0)}</p>
        <p><strong>Cliques:</strong> ${Number(report.data?.clicks ?? 0)}</p>
      `,
    });

    return res.status(200).json({ ok: true, sentTo: to, period: { start_date, end_date } });
  } catch (err) {
    console.error("cron send-monthly-reports error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Unknown error" });
  }
}
