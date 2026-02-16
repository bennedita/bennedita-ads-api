import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // CORS (permite somente seu app)
  const origin = req.headers.origin || "";
  const allowedOrigins = new Set([
    "https://lead-report-peek.lovable.app",
  ]);

  if (allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // Bloqueia chamadas fora do seu app (evita abuso sem login)
  if (!allowedOrigins.has(origin)) {
    return res.status(403).json({ ok: false, error: "Forbidden origin" });
  }

  // (Opcional) trava de segurança básica: limite de tamanho
  const rawLen = Number(req.headers["content-length"] || 0);
  if (rawLen > 50_000) {
    return res.status(413).json({ ok: false, error: "Payload too large" });
  }

  // Valida env do Resend
  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!resendKey) {
    return res.status(500).json({
      ok: false,
      error: "Server misconfigured: RESEND_API_KEY missing",
    });
  }

  try {
    const { to, subject, html } = req.body || {};
    if (!to || !subject || !html) {
      return res.status(400).json({
        ok: false,
        error: "Missing fields: to, subject, html",
      });
    }

    // IMPORTANTE: enquanto o domínio no Resend não estiver verificado,
    // o envio real pode falhar. Depois da verificação, vamos trocar o from.
    const data = await resend.emails.send({
      from: "Bennedita Ads <onboarding@resend.dev>",
      to,
      subject,
      html,
    });

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "Unknown error",
    });
  }
}
