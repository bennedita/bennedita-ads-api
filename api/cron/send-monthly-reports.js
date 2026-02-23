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

        const spend = Number(report.data?.spend ?? 0);
const conversions = Number(report.data?.conversions ?? 0);
const clicks = Number(report.data?.clicks ?? 0);
const cpa = conversions > 0 ? spend / conversions : 0;

await resend.emails.send({
  from: process.env.EMAIL_FROM,
  to: client.email,
  subject: `Relatório Mensal — ${client.name} (${start_date} a ${end_date})`,
  html: `
  <div style="background:#f3f4f6;padding:40px 20px;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">

      <span style="display:none;font-size:1px;color:#ffffff;opacity:0;">
        Resumo mensal de desempenho no Google Ads.
      </span>

      <h2 style="margin:0 0 8px 0;font-size:22px;color:#111827;">
        Relatório mensal — ${client.name}
      </h2>

      <p style="margin:0 0 24px 0;color:#6b7280;font-size:14px;">
        Período: ${start_date} até ${end_date}
      </p>

      <!-- KPI GRID -->
      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px;">

        <div style="flex:1 1 45%;background:#f9fafb;padding:16px;border-radius:10px;">
          <p style="margin:0;font-size:12px;color:#6b7280;">Investimento</p>
          <p style="margin:6px 0 0 0;font-size:20px;font-weight:bold;color:#111827;">
            R$ ${spend.toFixed(2)}
          </p>
        </div>

        <div style="flex:1 1 45%;background:#f9fafb;padding:16px;border-radius:10px;">
          <p style="margin:0;font-size:12px;color:#6b7280;">Conversões</p>
          <p style="margin:6px 0 0 0;font-size:20px;font-weight:bold;color:#111827;">
            ${conversions}
          </p>
        </div>

        <div style="flex:1 1 45%;background:#f9fafb;padding:16px;border-radius:10px;">
          <p style="margin:0;font-size:12px;color:#6b7280;">Custo por conversão (CPA)</p>
          <p style="margin:6px 0 0 0;font-size:20px;font-weight:bold;color:#111827;">
            R$ ${cpa.toFixed(2)}
          </p>
        </div>

        <div style="flex:1 1 45%;background:#f9fafb;padding:16px;border-radius:10px;">
          <p style="margin:0;font-size:12px;color:#6b7280;">Cliques</p>
          <p style="margin:6px 0 0 0;font-size:20px;font-weight:bold;color:#111827;">
            ${clicks}
          </p>
        </div>

      </div>

      <p style="font-size:14px;color:#374151;line-height:1.5;">
        Durante o período analisado, suas campanhas geraram 
        <strong>${conversions} conversões</strong> com um custo médio de 
        <strong>R$ ${cpa.toFixed(2)}</strong> por conversão.
        Para visualizar campanhas, gráficos e evolução detalhada, acesse o dashboard completo.
      </p>

      <div style="text-align:center;margin:30px 0;">
        <a href="https://lead-report-peek.lovable.app"
           style="background:#2563eb;color:#ffffff;padding:14px 24px;
                  text-decoration:none;border-radius:8px;font-weight:bold;
                  display:inline-block;">
          Ver dashboard completo
        </a>
      </div>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">

      <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">
        Enviado automaticamente pela Bennedita.<br/>
        Em caso de dúvidas, responda este e-mail.
      </p>

    </div>
  </div>
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
