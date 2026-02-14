import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // CORS básico
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") return res.status(200).end();
// Verificação de API Key interna
const apiKey = String(req.headers["x-api-key"] || "").trim();
const expectedKey = String(process.env.INTERNAL_API_KEY || "").trim();

if (!expectedKey) {
  return res.status(500).json({
    ok: false,
    error: "Server misconfigured: INTERNAL_API_KEY missing"
  });
}

if (apiKey !== expectedKey) {
  return res.status(401).json({
    ok: false,
    error: "Unauthorized"
  });
}


  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
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
