import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // CORS básico
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  // Preflight (OPTIONS)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Só aceita POST
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  // Verificação de API Key interna
  const apiKey = String(req.headers["x-api-key"] || "").trim();
  const expectedKey = String(process.env.INTERNAL_API_KEY || "").trim();

  if (!expectedKey) {
    return res.status(500).json({
      ok: false,
      error: "Server misconfigured: INTERNAL_API_KEY missing",
    });
  }

  // Debug seguro + MARKER (pra confirmar deploy e diagnosticar mismatch)
  if (apiKey !== expectedKey) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized_MARKER_2026",
      debug: {
        apiKeyLen: apiKey.length,
        expectedKeyLen: expectedKey.length,
        apiKeyStart: apiKey.slice(0, 6),
        apiKeyEnd: apiKey.slice(-6),
        expectedKeyStart: expectedKey.slice(0, 6),
        expectedKeyEnd: expectedKey.slice(-6),
      },
    });
  }

  // Valida Resend key
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
